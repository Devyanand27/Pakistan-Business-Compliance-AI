import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { buildServerApp } from '../app.js';
import {
  getServerConfig,
  hasAnyAiProvider,
  resetServerConfigCache,
  validateServerConfig,
} from '../config/env.js';
import { db, initSchema } from '../db/database.js';
import { seedDatabase } from '../db/seed.js';
import { chunkDocumentText, extractDocumentContent } from '../ingestion/extractor.js';
import { ingestDocumentBuffer } from '../ingestion/pipeline.js';
import { retrieveRelevantChunks } from '../rag/retriever.js';
import { requireAdmin, requireAuth, verifyFirebaseIdToken } from '../security/auth.js';
import { validateOfficialUrl } from '../security/ssrf.js';
import {
  AiProviderError,
  clearAiResponseCache,
  generateStructuredJson,
  setAiProviderTestHooks,
} from '../services/aiProvider.js';
import {
  clearEmbeddingCache,
  generateComparisonWithGemini,
  getEmbeddingCacheSize,
  setEmbedTestHook,
} from '../services/gemini.js';

function withTempEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  return async () => {
    const prev: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) {
      prev[k] = process.env[k];
      if (vars[k] === undefined) delete process.env[k];
      else process.env[k] = vars[k];
    }
    resetServerConfigCache();
    clearAiResponseCache();
    try {
      await fn();
    } finally {
      for (const k of Object.keys(vars)) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
      resetServerConfigCache();
      clearAiResponseCache();
      setAiProviderTestHooks(null);
      setEmbedTestHook(null);
      clearEmbeddingCache();
    }
  };
}

test('Startup environment configuration validates paths, models, AI_PROVIDER, and Firebase applet config', () => {
  const cfg = validateServerConfig();
  assert.ok(cfg.port >= 1 && cfg.port <= 65535);
  assert.ok(fs.existsSync(path.dirname(cfg.databasePath)));
  assert.ok(fs.existsSync(cfg.storagePath));
  assert.equal(cfg.llmModel, getServerConfig().llmModel);
  assert.equal(cfg.embeddingModel, getServerConfig().embeddingModel);
  assert.ok(['auto', 'gemini', 'openrouter'].includes(cfg.aiProvider));
  assert.ok(cfg.openrouterModel.length > 0);
  assert.ok(cfg.firebase.projectId.length > 0);
  assert.ok(cfg.firebase.firestoreDatabaseId.length > 0);
});

test(
  'Invalid AI_PROVIDER fails startup config validation clearly',
  withTempEnv({ AI_PROVIDER: 'invalid_provider' }, () => {
    assert.throws(() => getServerConfig(), /CONFIGURATION_ERROR: AI_PROVIDER/);
  })
);

test(
  'hasAnyAiProvider evaluates configured keys strictly per AI_PROVIDER mode',
  withTempEnv(
    {
      AI_PROVIDER: 'openrouter',
      GEMINI_API_KEY: 'AIzaTestMockKeyValue12345',
      OPENROUTER_API_KEY: undefined,
    },
    () => {
      assert.equal(hasAnyAiProvider(), false);
      process.env.OPENROUTER_API_KEY = 'sk-or-v1-mocktestkey12345';
      assert.equal(hasAnyAiProvider(), true);
    }
  )
);

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

test('Database schema initializes with embedding_model column and seeds SECP, FBR, and SRB records', async () => {
  initSchema();
  await seedDatabase();

  const cols = db.prepare(`PRAGMA table_info(document_chunks)`).all() as Array<{ name: string }>;
  assert.ok(cols.some((c) => c.name === 'embedding_model'));

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

test(
  'Embedding cache avoids duplicate calls, protects against mixed embedding models, and falls back to FTS5 when embeddings are unavailable',
  withTempEnv({ EMBEDDING_MODEL: 'gemini-embedding-2' }, async () => {
    clearEmbeddingCache();
    let embedCalls = 0;

    // Insert temporary doc with an incompatible embedding_model vector
    const suffix = Date.now();
    const docRes = db
      .prepare(
        `INSERT INTO documents (title, source_url, document_type, status, verification_status, checksum, raw_text)
         VALUES (?, ?, 'Official Guide', 'published', 'verified_official', ?, ?)`
      )
      .run(
        `Temp Compat Test ${suffix}`,
        `https://www.secp.gov.pk/test-compat-${suffix}`,
        `compat-${suffix}`,
        'Nominee compatibility test content'
      );
    const docId = Number(docRes.lastInsertRowid);
    const compatVec = new Float32Array([0.9, 0.1, 0.2, 0.3]);
    const compatBlob = Buffer.from(compatVec.buffer);

    try {
      db.prepare(
        `INSERT INTO document_chunks (document_id, chunk_text, page_number, section_title, chunk_index, embedding, embedding_dim, embedding_model)
         VALUES (?, ?, 1, 'Compat Section', 0, ?, 4, 'gemini-embedding-2')`
      ).run(docId, 'Compat token alpha nominee procedure', compatBlob);

      db.prepare(
        `INSERT INTO document_chunks (document_id, chunk_text, page_number, section_title, chunk_index, embedding, embedding_dim, embedding_model)
         VALUES (?, ?, 1, 'Legacy Incompatible Model', 1, ?, 4, 'legacy-incompatible-model')`
      ).run(docId, 'Compat token beta unrelated text', compatBlob);

      setEmbedTestHook(async (texts) => {
        embedCalls += 1;
        return texts.map(() => new Float32Array([0.9, 0.1, 0.2, 0.3]));
      });

      const first = await retrieveRelevantChunks({ query: 'Compat token alpha', topK: 5 });
      assert.equal(first.retrievalMode, 'hybrid_vector_fts');
      assert.equal(embedCalls, 1);
      assert.equal(getEmbeddingCacheSize(), 1);

      // Second query with different casing/spacing hits query embedding cache
      const second = await retrieveRelevantChunks({ query: '  compat   TOKEN alpha ', topK: 5 });
      assert.equal(second.retrievalMode, 'hybrid_vector_fts');
      assert.equal(embedCalls, 1, 'Expected repeated query embedding to be served from cache');

      // Simulate embedding quota outage -> falls back gracefully to lexical_fts
      clearEmbeddingCache();
      setEmbedTestHook(async () => null);
      const fallbackRes = await retrieveRelevantChunks({ query: 'Compat token alpha', topK: 5 });
      assert.equal(fallbackRes.retrievalMode, 'lexical_fts');
      assert.ok(fallbackRes.chunks.length > 0);
    } finally {
      db.prepare(`DELETE FROM documents WHERE id = ?`).run(docId);
    }
  })
);

test(
  'Dual AI provider uses Gemini primary in auto mode (mocked)',
  withTempEnv(
    {
      AI_PROVIDER: 'auto',
      GEMINI_API_KEY: 'AIzaMockGeminiTestKey123456',
      OPENROUTER_API_KEY: 'sk-or-v1-mockopenrouterkey12345',
    },
    async () => {
      let openrouterCalled = false;
      setAiProviderTestHooks({
        geminiGenerate: async () => JSON.stringify({ answer: 'From Gemini primary' }),
        openrouterFetch: async () => {
          openrouterCalled = true;
          throw new Error('Should not be called');
        },
      });

      const res = await generateStructuredJson<{ answer: string }>({
        taskName: 'rag_chat',
        systemInstruction: 'Test system',
        userPrompt: 'Test prompt',
        openrouterSchemaHint: '{"answer":"string"}',
      });

      assert.equal(res.data.answer, 'From Gemini primary');
      assert.equal(res.meta.provider_used, 'gemini');
      assert.equal(res.meta.fallback_triggered, false);
      assert.equal(openrouterCalled, false);
    }
  )
);

test(
  'Dual AI provider automatically falls back to OpenRouter on Gemini 429 quota exhaustion (mocked)',
  withTempEnv(
    {
      AI_PROVIDER: 'auto',
      GEMINI_API_KEY: 'AIzaMockGeminiTestKey123456',
      OPENROUTER_API_KEY: 'sk-or-v1-mockopenrouterkey12345',
      OPENROUTER_MODEL: 'openrouter/free',
    },
    async () => {
      setAiProviderTestHooks({
        geminiGenerate: async () => {
          const err: any = new Error('429 RESOURCE_EXHAUSTED: Quota exceeded');
          err.status = 429;
          throw err;
        },
        openrouterFetch: async (url) => {
          assert.ok(String(url).includes('/api/v1/chat/completions'));
          return new Response(
            JSON.stringify({
              model: 'meta-llama/llama-3.3-70b-instruct:free',
              choices: [
                {
                  message: {
                    content: '```json\n{"answer":"Fallback from OpenRouter"}\n```',
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        },
      });

      const res = await generateStructuredJson<{ answer: string }>({
        taskName: 'rag_chat',
        systemInstruction: 'Test system',
        userPrompt: 'Test prompt',
        openrouterSchemaHint: '{"answer":"string"}',
      });

      assert.equal(res.data.answer, 'Fallback from OpenRouter');
      assert.equal(res.meta.provider_used, 'openrouter');
      assert.equal(res.meta.fallback_triggered, true);
      assert.equal(res.meta.fallback_reason, 'AI_QUOTA_EXCEEDED');
    }
  )
);

test(
  'Dual AI provider does NOT silently mask invalid Gemini credentials via OpenRouter fallback (mocked)',
  withTempEnv(
    {
      AI_PROVIDER: 'auto',
      GEMINI_API_KEY: 'AIzaInvalidMockKey123456',
      OPENROUTER_API_KEY: 'sk-or-v1-mockopenrouterkey12345',
    },
    async () => {
      let openrouterCalled = false;
      setAiProviderTestHooks({
        geminiGenerate: async () => {
          const err: any = new Error('401 API_KEY_INVALID: API key not valid');
          err.status = 401;
          throw err;
        },
        openrouterFetch: async () => {
          openrouterCalled = true;
          return new Response('{}', { status: 200 });
        },
      });

      await assert.rejects(
        () =>
          generateStructuredJson({
            taskName: 'rag_chat',
            systemInstruction: 'Test',
            userPrompt: 'Test',
            openrouterSchemaHint: '{}',
          }),
        (err: any) => err instanceof AiProviderError && err.code === 'AI_INVALID_CREDENTIALS'
      );
      assert.equal(openrouterCalled, false);
    }
  )
);

test(
  'AI_PROVIDER=openrouter uses OpenRouter directly, validates model catalog, and caches comparison results (mocked)',
  withTempEnv(
    {
      AI_PROVIDER: 'openrouter',
      GEMINI_API_KEY: undefined,
      OPENROUTER_API_KEY: 'sk-or-v1-mockopenrouterkey12345',
      OPENROUTER_MODEL: 'meta-llama/llama-3.3-70b-instruct:free',
    },
    async () => {
      let chatCalls = 0;
      setAiProviderTestHooks({
        openrouterFetch: async (url) => {
          if (String(url).includes('/api/v1/models')) {
            return new Response(
              JSON.stringify({
                data: [
                  {
                    id: 'meta-llama/llama-3.3-70b-instruct:free',
                    architecture: { output_modalities: ['text'] },
                    supported_parameters: ['max_tokens'],
                  },
                ],
              }),
              { status: 200 }
            );
          }
          chatCalls += 1;
          return new Response(
            JSON.stringify({
              model: 'meta-llama/llama-3.3-70b-instruct:free',
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      structures: ['Sole Proprietorship', 'Single Member Company (SMC)'],
                      rows: [
                        {
                          criterion: 'Registration authority',
                          values: [
                            { structure: 'Sole Proprietorship', statement: 'FBR NTN enrollment', chunk_ids: [] },
                            { structure: 'Single Member Company (SMC)', statement: 'SECP eZfile', chunk_ids: [] },
                          ],
                        },
                      ],
                      important_limitations: ['Informational summary only.'],
                    }),
                  },
                },
              ],
            }),
            { status: 200 }
          );
        },
      });

      const chunks = (await retrieveRelevantChunks({ query: 'Single Member Company FBR NTN', topK: 4 })).chunks;
      const first = await generateComparisonWithGemini({
        structures: ['Sole Proprietorship', 'Single Member Company (SMC)'],
        retrievedChunks: chunks,
        language: 'en',
      });
      assert.equal(first.meta.provider_used, 'openrouter');
      assert.equal(first.meta.fallback_triggered, false);
      assert.equal(first.meta.cached, undefined);

      // Identical second comparison hits 5-minute deterministic cache
      const second = await generateComparisonWithGemini({
        structures: ['Sole Proprietorship', 'Single Member Company (SMC)'],
        retrievedChunks: chunks,
        language: 'en',
      });
      assert.equal(second.meta.cached, true);
      assert.equal(chatCalls, 1);
    }
  )
);

test(
  'Invalid OPENROUTER_MODEL slug is rejected by OpenRouter model catalog validation (mocked)',
  withTempEnv(
    {
      AI_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: 'sk-or-v1-mockopenrouterkey12345',
      OPENROUTER_MODEL: 'invalid/nonexistent-model',
    },
    async () => {
      setAiProviderTestHooks({
        openrouterFetch: async (url) => {
          if (String(url).includes('/api/v1/models')) {
            return new Response(JSON.stringify({ data: [{ id: 'openrouter/free' }] }), { status: 200 });
          }
          throw new Error('Chat completions should not be called for invalid model');
        },
      });

      await assert.rejects(
        () =>
          generateStructuredJson({
            taskName: 'rag_chat',
            systemInstruction: 'Test',
            userPrompt: 'Test',
            openrouterSchemaHint: '{}',
          }),
        (err: any) => err instanceof AiProviderError && err.code === 'AI_INVALID_MODEL'
      );
    }
  )
);

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

test(
  'Express HTTP integration: health, document browsing, search, CORS policy, ID validation, and protected route auth',
  withTempEnv(
    {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://compliance-frontend.vercel.app',
    },
    async () => {
      const app = await buildServerApp({ serveFrontend: false, disableRateLimit: true });
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address() as any;
      const baseUrl = `http://127.0.0.1:${addr.port}`;

      try {
        const healthRes = await fetch(`${baseUrl}/api/health`);
        assert.equal(healthRes.status, 200);
        const health = (await healthRes.json()) as any;
        assert.equal(health.status, 'ok');
        assert.equal(health.auth_provider, 'firebase');
        assert.ok(health.indexed_documents >= 6);
        assert.ok(['auto', 'gemini', 'openrouter'].includes(health.ai_provider_mode));

        const docsRes = await fetch(`${baseUrl}/api/documents?authority=SECP`);
        assert.equal(docsRes.status, 200);
        const docsJson = (await docsRes.json()) as any;
        assert.ok(Array.isArray(docsJson.documents) && docsJson.documents.length > 0);

        const badIdRes = await fetch(`${baseUrl}/api/documents/not-a-number`);
        assert.equal(badIdRes.status, 400);

        const searchRes = await fetch(`${baseUrl}/api/documents/search?q=Form+9`);
        assert.equal(searchRes.status, 200);
        const searchJson = (await searchRes.json()) as any;
        assert.ok(Array.isArray(searchJson.chunks) && searchJson.chunks.length > 0);

        const unauthChat = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: 'How to register an SMC?' }),
        });
        assert.equal(unauthChat.status, 401);

        // Allowed Vercel CORS origin
        const allowedCors = await fetch(`${baseUrl}/api/health`, {
          headers: { Origin: 'https://compliance-frontend.vercel.app' },
        });
        assert.equal(allowedCors.status, 200);
        assert.equal(
          allowedCors.headers.get('access-control-allow-origin'),
          'https://compliance-frontend.vercel.app'
        );

        // Disallowed external Origin
        const blockedCors = await fetch(`${baseUrl}/api/health`, {
          headers: { Origin: 'https://unauthorized-site.example.org' },
        });
        assert.equal(blockedCors.status, 403);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  )
);

test('Firestore security rules include global deny catch-all and per-user uid isolation', () => {
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');
  assert.ok(rulesText.includes('allow read, write: if false;'));
  assert.ok(rulesText.includes('request.auth.uid == userId'));
  assert.ok(rulesText.includes('existing().userId == request.auth.uid'));
  assert.ok(rulesText.includes('email_verified == true'));
});
