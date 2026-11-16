import express from 'express';
import multer from 'multer';
import { db } from '../db/database.js';
import { ingestDocumentBuffer, ingestDocumentFromUrl, retryIngestionJob } from '../ingestion/pipeline.js';
import { logAudit, requireAdmin } from '../security/auth.js';
import { sanitizeTextInput } from '../security/ssrf.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.html', '.htm', '.csv', '.png', '.jpg', '.jpeg'];

router.use(requireAdmin);

router.post('/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No document file uploaded.' });
      return;
    }

    const lowerName = req.file.originalname.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      res.status(400).json({
        error: `Unsupported file format. Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}`,
      });
      return;
    }

    const title = sanitizeTextInput(req.body?.title, 200);
    const authorityCode = sanitizeTextInput(req.body?.authority_code, 30);
    const sourceUrl = sanitizeTextInput(req.body?.source_url, 400) || `uploaded://${req.file.originalname}`;
    const documentType = sanitizeTextInput(req.body?.document_type || 'Official Document', 80);
    const documentNumber = sanitizeTextInput(req.body?.document_number, 80);
    const publicationDate = sanitizeTextInput(req.body?.publication_date, 30);
    const effectiveDate = sanitizeTextInput(req.body?.effective_date, 30);
    const language = req.body?.language === 'ur' ? 'ur' : 'en';
    const status = req.body?.status === 'draft' ? 'draft' : 'published';

    const result = await ingestDocumentBuffer(req.file.buffer, req.file.originalname, req.file.mimetype, {
      authorityCode,
      title: title || undefined,
      sourceUrl,
      documentType,
      documentNumber,
      publicationDate,
      effectiveDate,
      language,
      verificationStatus: 'verified_official',
      status,
      sourceType: 'upload',
    });

    logAudit(
      req.user!.uid,
      'ADMIN_UPLOAD_DOCUMENT',
      'document',
      result.documentId,
      `Chunks: ${result.chunksCreated}, Duplicate: ${result.duplicate}`
    );

    res.status(201).json(result);
  } catch (err) {
    console.error('[Admin Upload Error]', (err as Error).message);
    res.status(422).json({ error: `Document ingestion failed: ${(err as Error).message}` });
  }
});

router.post('/documents/ingest-url', async (req, res) => {
  try {
    const url = sanitizeTextInput(req.body?.url, 500);
    if (!url) {
      res.status(400).json({ error: 'Official source URL is required.' });
      return;
    }

    const title = sanitizeTextInput(req.body?.title, 200);
    const authorityCode = sanitizeTextInput(req.body?.authority_code, 30);
    const documentType = sanitizeTextInput(req.body?.document_type || 'Official Web Page', 80);
    const publicationDate = sanitizeTextInput(req.body?.publication_date, 30);
    const effectiveDate = sanitizeTextInput(req.body?.effective_date, 30);
    const language = req.body?.language === 'ur' ? 'ur' : 'en';

    const result = await ingestDocumentFromUrl(url, {
      authorityCode,
      title: title || undefined,
      documentType,
      publicationDate,
      effectiveDate,
      language,
      verificationStatus: 'verified_official',
      status: 'published',
    });

    logAudit(req.user!.uid, 'ADMIN_INGEST_URL', 'document', result.documentId, url);
    res.status(201).json(result);
  } catch (err) {
    res.status(422).json({
      error: (err as Error).message,
      jobId: (err as any).jobId || null,
    });
  }
});

router.get('/ingestion-jobs', (_req, res) => {
  const jobs = db
    .prepare(
      `SELECT j.*, d.title as document_title, d.status as document_status
       FROM ingestion_jobs j
       LEFT JOIN documents d ON d.id = j.document_id
       ORDER BY j.id DESC LIMIT 60`
    )
    .all();
  res.json({ jobs });
});

router.post('/ingestion-jobs/:id/retry', async (req, res) => {
  try {
    const jobId = Number(req.params.id);
    const result = await retryIngestionJob(jobId);
    logAudit(req.user!.uid, 'ADMIN_RETRY_JOB', 'ingestion_job', jobId);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

router.patch('/documents/:id/status', (req, res) => {
  const docId = Number(req.params.id);
  const status = req.body?.status;
  if (!['published', 'draft', 'superseded', 'outdated', 'conflict_review'].includes(status)) {
    res.status(400).json({ error: 'Invalid document status.' });
    return;
  }

  const conflictNote = sanitizeTextInput(req.body?.conflict_note, 500);
  const isSuperseded = status === 'superseded' || status === 'outdated' ? 1 : 0;

  const info = db
    .prepare(
      `UPDATE documents SET status = ?, is_superseded = ?, conflict_note = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(status, isSuperseded, conflictNote, docId);

  if (info.changes === 0) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  logAudit(req.user!.uid, 'ADMIN_UPDATE_DOCUMENT_STATUS', 'document', docId, `Status=${status}`);
  const doc = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(docId);
  res.json({ document: doc });
});

router.get('/analytics', (_req, res) => {
  const counts = {
    documents: (db.prepare(`SELECT COUNT(*) as c FROM documents`).get() as any).c,
    published_documents: (db.prepare(`SELECT COUNT(*) as c FROM documents WHERE status = 'published'`).get() as any).c,
    superseded_documents: (db.prepare(`SELECT COUNT(*) as c FROM documents WHERE is_superseded = 1`).get() as any).c,
    conflict_documents: (db.prepare(`SELECT COUNT(*) as c FROM documents WHERE status = 'conflict_review'`).get() as any).c,
    chunks: (db.prepare(`SELECT COUNT(*) as c FROM document_chunks`).get() as any).c,
    vector_embedded_chunks: (db.prepare(`SELECT COUNT(*) as c FROM document_chunks WHERE embedding_dim > 0`).get() as any).c,
    failed_jobs: (db.prepare(`SELECT COUNT(*) as c FROM ingestion_jobs WHERE status = 'failed'`).get() as any).c,
  };

  const recentAudits = db
    .prepare(
      `SELECT id, actor_uid, action, target_type, target_id, details, created_at
       FROM audit_logs
       ORDER BY id DESC LIMIT 25`
    )
    .all();

  res.json({ counts, recentAudits });
});

export default router;
