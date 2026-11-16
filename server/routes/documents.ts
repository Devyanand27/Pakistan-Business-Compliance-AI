import express from 'express';
import multer from 'multer';
import { db } from '../db/database.js';
import { extractDocumentContent } from '../ingestion/extractor.js';
import { retrieveRelevantChunks } from '../rag/retriever.js';
import { requireAuth } from '../security/auth.js';
import { sanitizeTextInput } from '../security/ssrf.js';
import {
  generateComparisonWithGemini,
  hasGeminiKey,
  summarizeDocumentWithGemini,
} from '../services/gemini.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/documents/authorities', (_req, res) => {
  const authorities = db.prepare(`SELECT * FROM authorities WHERE is_active = 1 ORDER BY id ASC`).all();
  res.json({ authorities });
});

router.get('/documents/search', async (req, res) => {
  const query = sanitizeTextInput(req.query.q as string, 300);
  const authorityCode = sanitizeTextInput(req.query.authority as string, 30);
  if (!query) {
    res.status(400).json({ error: 'Search query "q" is required.' });
    return;
  }
  const { chunks, retrievalMode } = await retrieveRelevantChunks({
    query,
    topK: 12,
    authorityCode: authorityCode || undefined,
  });
  res.json({ chunks, retrievalMode });
});

router.get('/documents', (req, res) => {
  const q = sanitizeTextInput(req.query.q as string, 160);
  const authority = sanitizeTextInput(req.query.authority as string, 30);
  const docType = sanitizeTextInput(req.query.type as string, 60);
  const language = sanitizeTextInput(req.query.language as string, 10);
  const status = sanitizeTextInput(req.query.status as string, 30);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
  const offset = (page - 1) * limit;

  const clauses = [`d.verification_status = 'verified_official'`];
  const params: any[] = [];

  if (status) {
    clauses.push(`d.status = ?`);
    params.push(status);
  } else {
    clauses.push(`d.status IN ('published', 'superseded', 'outdated', 'conflict_review')`);
  }

  if (authority) {
    clauses.push(`a.code = ?`);
    params.push(authority.toUpperCase());
  }
  if (docType) {
    clauses.push(`d.document_type = ?`);
    params.push(docType);
  }
  if (language) {
    clauses.push(`d.language = ?`);
    params.push(language);
  }
  if (q) {
    clauses.push(`(d.title LIKE ? OR d.raw_text LIKE ? OR d.document_number LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const where = clauses.join(' AND ');
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM documents d LEFT JOIN authorities a ON a.id = d.authority_id WHERE ${where}`
      )
      .get(...params) as any
  ).c;

  const documents = db
    .prepare(
      `SELECT d.id, d.title, d.source_url, d.document_type, d.document_number,
              d.publication_date, d.effective_date, d.retrieval_date, d.language,
              d.version, d.page_count, d.status, d.verification_status,
              d.is_superseded, d.superseded_by_id, d.previous_version_id, d.conflict_note,
              d.created_at, d.updated_at,
              a.code as authority_code, a.name as authority_name,
              (SELECT COUNT(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunk_count
       FROM documents d
       LEFT JOIN authorities a ON a.id = d.authority_id
       WHERE ${where}
       ORDER BY d.is_superseded ASC, d.updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  res.json({
    documents,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

router.get('/documents/:id', (req, res) => {
  const docId = Number(req.params.id);
  const doc = db
    .prepare(
      `SELECT d.id, d.title, d.source_url, d.document_type, d.document_number,
              d.publication_date, d.effective_date, d.last_updated_date, d.retrieval_date,
              d.language, d.version, d.page_count, d.status, d.verification_status,
              d.is_superseded, d.superseded_by_id, d.previous_version_id, d.conflict_note,
              d.checksum, d.created_at, d.updated_at,
              a.code as authority_code, a.name as authority_name, a.website_url as authority_website
       FROM documents d
       LEFT JOIN authorities a ON a.id = d.authority_id
       WHERE d.id = ?`
    )
    .get(docId) as any;

  if (!doc) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  const chunks = db
    .prepare(
      `SELECT id, chunk_index, page_number, section_title, chunk_text
       FROM document_chunks WHERE document_id = ? ORDER BY chunk_index ASC`
    )
    .all(docId);

  res.json({ document: doc, chunks });
});

router.get('/documents/:id/versions', (req, res) => {
  const docId = Number(req.params.id);
  const current = db.prepare(`SELECT id, title, previous_version_id, superseded_by_id FROM documents WHERE id = ?`).get(docId) as any;
  if (!current) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  const versions = db
    .prepare(
      `SELECT id, title, version, status, is_superseded, publication_date, effective_date, retrieval_date, checksum
       FROM documents
       WHERE id = ? OR id = ? OR id = ? OR previous_version_id = ? OR superseded_by_id = ?
       ORDER BY id DESC`
    )
    .all(docId, current.previous_version_id || -1, current.superseded_by_id || -1, docId, docId);

  res.json({ versions });
});

router.post('/documents/summarize', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!hasGeminiKey()) {
      res.status(503).json({
        code: 'AI_PROVIDER_UNAVAILABLE',
        error: 'GEMINI_API_KEY is not configured on the server for document summarization.',
      });
      return;
    }

    const language = req.body?.language === 'ur' ? 'ur' : 'en';

    if (req.file) {
      const extracted = await extractDocumentContent(req.file.buffer, req.file.originalname, req.file.mimetype);
      const summary = await summarizeDocumentWithGemini({
        title: req.file.originalname,
        authority: 'User Uploaded Document (Unverified)',
        verificationStatus: 'user_uploaded_unverified',
        text: extracted.text,
        language,
      });

      res.json({
        source: {
          title: req.file.originalname,
          verification_status: 'user_uploaded_unverified',
          notice:
            'This document was uploaded by you and has NOT been verified as an official government regulation.',
          page_count: extracted.pageCount,
          ocr_used: extracted.ocrUsed,
        },
        summary,
      });
      return;
    }

    const documentId = Number(req.body?.document_id);
    if (!documentId) {
      res.status(400).json({ error: 'Please select an indexed document or upload a file to summarize.' });
      return;
    }

    const doc = db
      .prepare(
        `SELECT d.*, COALESCE(a.name, 'Official Authority') as authority_name
         FROM documents d LEFT JOIN authorities a ON a.id = d.authority_id
         WHERE d.id = ?`
      )
      .get(documentId) as any;

    if (!doc) {
      res.status(404).json({ error: 'Selected document not found.' });
      return;
    }

    const summary = await summarizeDocumentWithGemini({
      title: doc.title,
      authority: doc.authority_name,
      verificationStatus: doc.verification_status,
      text: doc.raw_text,
      language,
    });

    res.json({
      source: {
        id: doc.id,
        title: doc.title,
        authority_name: doc.authority_name,
        source_url: doc.source_url,
        verification_status: doc.verification_status,
        is_superseded: Boolean(doc.is_superseded),
        page_count: doc.page_count,
      },
      summary,
    });
  } catch (err) {
    console.error('[Summarize Error]', (err as Error).message);
    res.status(502).json({ error: `Summarization failed: ${(err as Error).message}` });
  }
});

router.post('/compare', requireAuth, async (req, res) => {
  try {
    const structures: string[] = Array.isArray(req.body?.structures)
      ? req.body.structures.map((s: any) => sanitizeTextInput(s, 80)).filter(Boolean)
      : [];

    if (structures.length < 2 || structures.length > 4) {
      res.status(400).json({ error: 'Please select between 2 and 4 business structures to compare.' });
      return;
    }

    if (!hasGeminiKey()) {
      res.status(503).json({
        code: 'AI_PROVIDER_UNAVAILABLE',
        error: 'GEMINI_API_KEY is required on the server to synthesize grounded structure comparisons.',
      });
      return;
    }

    const language = req.body?.language === 'ur' ? 'ur' : 'en';
    const retrieval = await retrieveRelevantChunks({
      query: `${structures.join(' ')} incorporation registration requirements taxes annual return authority`,
      topK: 10,
    });

    const comparison = await generateComparisonWithGemini({
      structures,
      retrievedChunks: retrieval.chunks,
      language,
    });

    const chunkMap = new Map(retrieval.chunks.map((c) => [c.chunk_id, c]));
    const sourcesUsed = Array.from(
      new Map(
        retrieval.chunks.map((c) => [
          c.chunk_id,
          {
            chunk_id: c.chunk_id,
            document_id: c.document_id,
            document_title: c.document_title,
            authority_name: c.authority_name,
            page_number: c.page_number,
            section_title: c.section_title,
            source_url: c.source_url,
          },
        ])
      ).values()
    );

    // Strip any invalid chunk_ids
    for (const row of comparison.rows || []) {
      for (const val of row.values || []) {
        val.chunk_ids = (val.chunk_ids || []).filter((id) => chunkMap.has(id));
      }
    }

    res.json({ comparison, sources: sourcesUsed });
  } catch (err) {
    console.error('[Compare Error]', (err as Error).message);
    res.status(502).json({ error: `Comparison generation failed: ${(err as Error).message}` });
  }
});

export default router;
