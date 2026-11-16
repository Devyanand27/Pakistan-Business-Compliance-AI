import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getServerConfig } from '../config/env.js';
import { db } from '../db/database.js';
import { validateOfficialUrl } from '../security/ssrf.js';
import { embedTexts } from '../services/gemini.js';
import { chunkDocumentText, extractDocumentContent } from './extractor.js';

const STORAGE_DIR = getServerConfig().storagePath;
fs.mkdirSync(STORAGE_DIR, { recursive: true });

export interface IngestOptions {
  authorityCode?: string;
  title?: string;
  sourceUrl: string;
  documentType: string;
  documentNumber?: string;
  publicationDate?: string;
  effectiveDate?: string;
  language?: 'en' | 'ur';
  verificationStatus?: 'verified_official' | 'user_uploaded_unverified';
  status?: 'published' | 'draft';
  sourceType: 'upload' | 'url' | 'seed';
}

function resolveAuthorityId(authorityCode?: string, sourceUrl?: string): number | null {
  if (authorityCode) {
    const row = db.prepare(`SELECT id FROM authorities WHERE code = ?`).get(authorityCode.toUpperCase()) as any;
    if (row) return row.id;
  }
  if (sourceUrl) {
    const lower = sourceUrl.toLowerCase();
    const rows = db.prepare(`SELECT id, official_domain FROM authorities`).all() as any[];
    for (const r of rows) {
      if (lower.includes(r.official_domain.toLowerCase())) {
        return r.id;
      }
    }
  }
  return null;
}

export async function ingestDocumentBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  options: IngestOptions
): Promise<{
  documentId: number;
  jobId: number;
  duplicate: boolean;
  chunksCreated: number;
  ocrUsed: boolean;
  version: string;
}> {
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  const existingSameHash = db.prepare(`SELECT id, version FROM documents WHERE checksum = ?`).get(checksum) as any;
  if (existingSameHash) {
    const existingCount = (
      db.prepare(`SELECT COUNT(*) as c FROM document_chunks WHERE document_id = ?`).get(existingSameHash.id) as any
    ).c;
    const jobRes = db
      .prepare(
        `INSERT INTO ingestion_jobs (document_id, source_type, source_input, status, ocr_used, chunks_created, started_at, completed_at)
         VALUES (?, ?, ?, 'completed', 0, ?, datetime('now'), datetime('now'))`
      )
      .run(existingSameHash.id, options.sourceType, filename, existingCount);

    return {
      documentId: existingSameHash.id,
      jobId: Number(jobRes.lastInsertRowid),
      duplicate: true,
      chunksCreated: existingCount,
      ocrUsed: false,
      version: existingSameHash.version,
    };
  }

  // Save raw file outside public directory
  const safeBase = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const storedPath = path.join(STORAGE_DIR, `${checksum.slice(0, 12)}_${safeBase}`);
  fs.writeFileSync(storedPath, buffer);

  const authorityId = resolveAuthorityId(options.authorityCode, options.sourceUrl);
  const tentativeTitle = (options.title || filename.replace(/\.[^.]+$/, '')).trim();

  // Check for earlier version by same source_url or same title+authority
  const previousDoc = db
    .prepare(
      `SELECT id, version FROM documents
       WHERE is_superseded = 0 AND verification_status = 'verified_official'
       AND (
         (source_url = ? AND source_url != '' AND source_url NOT LIKE 'uploaded://%')
         OR (LOWER(title) = LOWER(?) AND authority_id IS ?)
       )
       ORDER BY id DESC LIMIT 1`
    )
    .get(options.sourceUrl, tentativeTitle, authorityId) as any;

  const nextVersion = previousDoc
    ? `${(parseFloat(previousDoc.version || '1.0') + 1.0).toFixed(1)}`
    : '1.0';

  const insertDoc = db
    .prepare(
      `INSERT INTO documents (
        authority_id, title, source_url, document_type, document_number,
        publication_date, effective_date, retrieval_date, language, version,
        status, verification_status, previous_version_id, checksum, file_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      authorityId,
      tentativeTitle,
      options.sourceUrl,
      options.documentType,
      options.documentNumber || '',
      options.publicationDate || '',
      options.effectiveDate || '',
      options.language || 'en',
      nextVersion,
      options.status || 'published',
      options.verificationStatus || 'verified_official',
      previousDoc ? previousDoc.id : null,
      checksum,
      storedPath
    );

  const documentId = Number(insertDoc.lastInsertRowid);

  const jobRes = db
    .prepare(
      `INSERT INTO ingestion_jobs (document_id, source_type, source_input, status, started_at)
       VALUES (?, ?, ?, 'processing', datetime('now'))`
    )
    .run(documentId, options.sourceType, options.sourceType === 'url' ? options.sourceUrl : filename);

  const jobId = Number(jobRes.lastInsertRowid);

  try {
    const extracted = await extractDocumentContent(buffer, filename, mimeType);
    const finalTitle =
      options.title && options.title.trim().length > 2
        ? options.title.trim()
        : extracted.detectedTitle || tentativeTitle;

    const chunks = chunkDocumentText(extracted.text);
    const embeddings = await embedTexts(chunks.map((c) => `${finalTitle} — ${c.sectionTitle}\n${c.chunkText}`));

    const insertChunk = db.prepare(
      `INSERT INTO document_chunks (document_id, chunk_text, page_number, section_title, chunk_index, embedding, embedding_dim, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE documents SET title = ?, page_count = ?, raw_text = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(finalTitle, extracted.pageCount, extracted.text, documentId);

      chunks.forEach((chunk, idx) => {
        const vec = embeddings?.[idx];
        const blob = vec ? Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength) : null;
        insertChunk.run(
          documentId,
          chunk.chunkText,
          chunk.pageNumber,
          chunk.sectionTitle,
          chunk.chunkIndex,
          blob,
          vec ? vec.length : 0,
          JSON.stringify({
            title: finalTitle,
            source_url: options.sourceUrl,
            page: chunk.pageNumber,
            section: chunk.sectionTitle,
          })
        );
      });

      if (previousDoc) {
        db.prepare(
          `UPDATE documents SET is_superseded = 1, superseded_by_id = ?, status = 'superseded', updated_at = datetime('now') WHERE id = ?`
        ).run(documentId, previousDoc.id);
      }

      db.prepare(
        `UPDATE ingestion_jobs SET status = 'completed', ocr_used = ?, chunks_created = ?, completed_at = datetime('now') WHERE id = ?`
      ).run(extracted.ocrUsed ? 1 : 0, chunks.length, jobId);
    });

    tx();

    return {
      documentId,
      jobId,
      duplicate: false,
      chunksCreated: chunks.length,
      ocrUsed: extracted.ocrUsed,
      version: nextVersion,
    };
  } catch (err) {
    const message = (err as Error).message || 'Unknown ingestion error';
    db.prepare(
      `UPDATE ingestion_jobs SET status = 'failed', error_message = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(message, jobId);
    db.prepare(`UPDATE documents SET status = 'draft' WHERE id = ?`).run(documentId);
    throw err;
  }
}

export async function ingestDocumentFromUrl(
  rawUrl: string,
  options: Omit<IngestOptions, 'sourceUrl' | 'sourceType'>
): Promise<{
  documentId: number;
  jobId: number;
  duplicate: boolean;
  chunksCreated: number;
  ocrUsed: boolean;
  version: string;
}> {
  const check = await validateOfficialUrl(rawUrl);
  if (!check.ok || !check.url) {
    const jobRes = db
      .prepare(
        `INSERT INTO ingestion_jobs (document_id, source_type, source_input, status, error_message, started_at, completed_at)
         VALUES (NULL, 'url', ?, 'failed', ?, datetime('now'), datetime('now'))`
      )
      .run(rawUrl, check.error || 'Blocked URL');
    const err = new Error(check.error || 'URL rejected by security policy.');
    (err as any).jobId = Number(jobRes.lastInsertRowid);
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(check.url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'PakistanBusinessComplianceAI/1.0 (Official-Source-Indexer)',
        Accept: 'text/html,application/pdf,text/plain,*/*',
      },
      redirect: 'follow',
    });

    if (!resp.ok) {
      throw new Error(`Official server returned HTTP ${resp.status} ${resp.statusText}.`);
    }

    const contentType = resp.headers.get('content-type') || '';
    const arrayBuf = await resp.arrayBuffer();
    if (arrayBuf.byteLength > 10 * 1024 * 1024) {
      throw new Error('Remote document exceeds the 10 MB size limit.');
    }

    const buffer = Buffer.from(arrayBuf);
    const urlPath = check.url.pathname.split('/').pop() || 'official_page.html';
    const filename = contentType.includes('pdf') && !urlPath.endsWith('.pdf') ? `${urlPath}.pdf` : urlPath;

    return await ingestDocumentBuffer(buffer, filename, contentType, {
      ...options,
      sourceUrl: check.url.toString(),
      sourceType: 'url',
      verificationStatus: 'verified_official',
    });
  } catch (err) {
    const message = (err as Error).message || 'URL fetch failed';
    // Record failed job if not already created inside ingestDocumentBuffer
    const existingJob = db
      .prepare(`SELECT id FROM ingestion_jobs WHERE source_input = ? ORDER BY id DESC LIMIT 1`)
      .get(rawUrl) as any;
    if (!existingJob) {
      db.prepare(
        `INSERT INTO ingestion_jobs (document_id, source_type, source_input, status, error_message, started_at, completed_at)
         VALUES (NULL, 'url', ?, 'failed', ?, datetime('now'), datetime('now'))`
      ).run(rawUrl, message);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function retryIngestionJob(jobId: number): Promise<any> {
  const job = db.prepare(`SELECT * FROM ingestion_jobs WHERE id = ?`).get(jobId) as any;
  if (!job) throw new Error('Ingestion job not found.');

  if (job.source_type === 'url') {
    const doc = job.document_id
      ? (db.prepare(`SELECT * FROM documents WHERE id = ?`).get(job.document_id) as any)
      : null;
    return ingestDocumentFromUrl(job.source_input, {
      title: doc?.title,
      documentType: doc?.document_type || 'Official Web Guidance',
      language: doc?.language || 'en',
      status: 'published',
    });
  }

  if (job.document_id) {
    const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(job.document_id) as any;
    if (doc?.file_path && fs.existsSync(doc.file_path)) {
      const buffer = fs.readFileSync(doc.file_path);
      const extracted = await extractDocumentContent(buffer, path.basename(doc.file_path));
      const chunks = chunkDocumentText(extracted.text);
      const embeddings = await embedTexts(chunks.map((c) => `${doc.title} — ${c.sectionTitle}\n${c.chunkText}`));

      const tx = db.transaction(() => {
        db.prepare(`DELETE FROM document_chunks WHERE document_id = ?`).run(doc.id);
        const insertChunk = db.prepare(
          `INSERT INTO document_chunks (document_id, chunk_text, page_number, section_title, chunk_index, embedding, embedding_dim, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        chunks.forEach((chunk, idx) => {
          const vec = embeddings?.[idx];
          const blob = vec ? Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength) : null;
          insertChunk.run(
            doc.id,
            chunk.chunkText,
            chunk.pageNumber,
            chunk.sectionTitle,
            chunk.chunkIndex,
            blob,
            vec ? vec.length : 0,
            JSON.stringify({ title: doc.title, source_url: doc.source_url, page: chunk.pageNumber })
          );
        });
        db.prepare(`UPDATE documents SET status = 'published', raw_text = ?, page_count = ? WHERE id = ?`).run(
          extracted.text,
          extracted.pageCount,
          doc.id
        );
        db.prepare(
          `UPDATE ingestion_jobs SET status = 'completed', error_message = '', chunks_created = ?, ocr_used = ?, completed_at = datetime('now') WHERE id = ?`
        ).run(chunks.length, extracted.ocrUsed ? 1 : 0, jobId);
      });
      tx();
      return { retried: true, chunksCreated: chunks.length };
    }
  }

  throw new Error('Cannot retry job: original source file or URL could not be located.');
}
