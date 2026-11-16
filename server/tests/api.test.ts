import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { getServerConfig, validateServerConfig } from '../config/env.js';
import { db, initSchema } from '../db/database.js';
import { seedDatabase } from '../db/seed.js';
import { chunkDocumentText, extractDocumentContent } from '../ingestion/extractor.js';
import { ingestDocumentBuffer } from '../ingestion/pipeline.js';
import { retrieveRelevantChunks } from '../rag/retriever.js';
import { requireAdmin, requireAuth, verifyFirebaseIdToken } from '../security/auth.js';
import { validateOfficialUrl } from '../security/ssrf.js';

test('Startup environment configuration validates paths, models, and Firebase applet config', () => {
  const cfg = validateServerConfig();
  assert.ok(cfg.port >= 1 && cfg.port <= 65535);
  assert.ok(fs.existsSync(path.dirname(cfg.databasePath)));
  assert.ok(fs.existsSync(cfg.storagePath));
  assert.equal(cfg.llmModel, getServerConfig().llmModel);
  assert.equal(cfg.embeddingModel, getServerConfig().embeddingModel);
  assert.ok(cfg.firebase.projectId.length > 0);
  assert.ok(cfg.firebase.firestoreDatabaseId.length > 0);
});

test('Firebase token verifier rejects malformed, unsigned, and wrong-algorithm JWTs', async () => {
  await assert.rejects(() => verifyFirebaseIdToken('not-a-jwt'), /Malformed/);

  const fakeHeader = Buffer.from(JSON.stringify({ alg: 'none', kid: 'abc' })).toString('base64url');
  const fakePayload = Buffer.from(JSON.stringify({ sub: '123', aud: 'bad' })).toString('base64url');
  await assert.rejects(
    () => verifyFirebaseIdToken(`${fakeHeader}.${fakePayload}.sig`),
    /Unsupported token algorithm/
  );
});

test('Auth middleware rejects requests missing Authorization Bearer token with HTTP 401', async () => {
  let statusCode = 0;
  let jsonBody: any = null;
  let nextCalled = false;

  const mockReq: any = { headers: {} };
  const mockRes: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: any) {
      jsonBody = body;
      return this;
    },
  };

  await requireAuth(mockReq, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 401);
  assert.equal(nextCalled, false);
  assert.ok(String(jsonBody?.error).includes('Authentication required'));

  statusCode = 0;
  jsonBody = null;
  await requireAdmin(mockReq, mockRes, () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 401);
  assert.equal(nextCalled, false);
});

test('Database schema initializes and seeds authentic SECP, FBR, and SRB authorities & documents', async () => {
  initSchema();
  await seedDatabase();

  const authCount = (db.prepare(`SELECT COUNT(*) as c FROM authorities`).get() as any).c;
  assert.ok(authCount >= 3, 'Expected at least 3 seeded official authorities');

  const docCount = (
    db.prepare(`SELECT COUNT(*) as c FROM documents WHERE verification_status = 'verified_official'`).get() as any
  ).c;
  assert.ok(docCount >= 6, 'Expected at least 6 seeded official documents');

  const chunkCount = (db.prepare(`SELECT COUNT(*) as c FROM document_chunks`).get() as any).c;
  assert.ok(chunkCount >= 10, 'Expected indexed document chunks');
});

test('SSRF protection blocks private IPs, localhost, and non-official domains', async () => {
  const local = await validateOfficialUrl('http://127.0.0.1:3000/secret');
  assert.equal(local.ok, false);

  const meta = await validateOfficialUrl('http://169.254.169.254/latest/meta-data/');
  assert.equal(meta.ok, false);

  const blog = await validateOfficialUrl('https://random-tax-blog.example.com/guide');
  assert.equal(blog.ok, false);
});

test('Document extractor and chunker preserve page numbers and section headings', async () => {
  const sampleHtml = Buffer.from(
    '<html><head><title>SECP Test Guide</title></head><body><h1>Company Filing</h1><p>Every company must file Form A within 30 days of AGM.</p><h2>Officer Changes</h2><p>Form 9 replaces Form 29 under Companies Regulations 2024.</p></body></html>'
  );
  const extracted = await extractDocumentContent(sampleHtml, 'guide.html', 'text/html');
  assert.ok(extracted.text.includes('Form A'));
  assert.equal(extracted.detectedTitle, 'SECP Test Guide');

  const pagedText =
    '[[PAGE_1]]\n# Section 1\nContent on page one about SMC.\n[[PAGE_2]]\n# Section 2\nContent on page two about Form 9.';
  const chunks = chunkDocumentText(pagedText, 120, 20);
  assert.ok(chunks.some((c) => c.pageNumber === 1));
  assert.ok(chunks.some((c) => c.pageNumber === 2));
});

test('Hybrid retriever returns relevant SECP SMC chunks and flags superseded Form 29', async () => {
  const smcRes = await retrieveRelevantChunks({
    query: 'Single Member Company nominee eZfile incorporation',
    topK: 5,
    authorityCode: 'SECP',
  });
  assert.ok(smcRes.chunks.length > 0, 'Expected retrieved SECP SMC chunks');
  assert.ok(
    smcRes.chunks.some((c) => c.chunk_text.toLowerCase().includes('nominee')),
    'Expected retrieved chunk to mention SMC Nominee requirement'
  );

  const legacyRes = await retrieveRelevantChunks({
    query: 'Form 29 particulars of directors',
    topK: 5,
    authorityCode: 'SECP',
  });
  assert.ok(
    legacyRes.chunks.some((c) => c.is_superseded === true),
    'Expected legacy Form 29 query to surface superseded flag'
  );
});

test('Document ingestion deduplicates identical checksums and versions updates', async () => {
  const uniqueSuffix = Date.now();
  const v1 = Buffer.from(`[[PAGE_1]]\n# Test Circular ${uniqueSuffix}\nInitial statutory filing guidance v1.`);
  const r1 = await ingestDocumentBuffer(v1, `circular_${uniqueSuffix}.txt`, 'text/plain', {
    authorityCode: 'SECP',
    title: `Test Circular ${uniqueSuffix}`,
    sourceUrl: `https://www.secp.gov.pk/laws/test-${uniqueSuffix}`,
    documentType: 'Circular',
    sourceType: 'upload',
  });
  assert.equal(r1.duplicate, false);
  assert.equal(r1.version, '1.0');

  const dup = await ingestDocumentBuffer(v1, `circular_${uniqueSuffix}.txt`, 'text/plain', {
    authorityCode: 'SECP',
    title: `Test Circular ${uniqueSuffix}`,
    sourceUrl: `https://www.secp.gov.pk/laws/test-${uniqueSuffix}`,
    documentType: 'Circular',
    sourceType: 'upload',
  });
  assert.equal(dup.duplicate, true);
  assert.equal(dup.documentId, r1.documentId);

  const v2 = Buffer.from(`[[PAGE_1]]\n# Test Circular ${uniqueSuffix}\nUpdated statutory filing guidance v2.`);
  const r2 = await ingestDocumentBuffer(v2, `circular_${uniqueSuffix}_v2.txt`, 'text/plain', {
    authorityCode: 'SECP',
    title: `Test Circular ${uniqueSuffix}`,
    sourceUrl: `https://www.secp.gov.pk/laws/test-${uniqueSuffix}`,
    documentType: 'Circular',
    sourceType: 'upload',
  });
  assert.equal(r2.duplicate, false);
  assert.equal(r2.version, '2.0');

  const oldDoc = db
    .prepare(`SELECT is_superseded, superseded_by_id FROM documents WHERE id = ?`)
    .get(r1.documentId) as any;
  assert.equal(oldDoc.is_superseded, 1);
  assert.equal(oldDoc.superseded_by_id, r2.documentId);

  db.prepare(`DELETE FROM documents WHERE id IN (?, ?)`).run(r1.documentId, r2.documentId);
});

test('Firestore security rules include global deny catch-all and per-user uid isolation', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');
  assert.ok(rulesText.includes('allow read, write: if false;'));
  assert.ok(rulesText.includes('request.auth.uid == userId'));
  assert.ok(rulesText.includes('existing().userId == request.auth.uid'));
  assert.ok(rulesText.includes('email_verified == true'));
});
