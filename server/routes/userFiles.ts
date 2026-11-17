import crypto from 'crypto';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { getServerConfig, hasAnyAiProvider, hasNeonPostgres } from '../config/env.js';
import {
  createUserFileRecord,
  deleteUserFileRecord,
  getUserFileRecordById,
  listUserFilesByOwner,
  saveUserFileSummary,
  serializeUserFileForClient,
} from '../db/userFilesRepo.js';
import { extractDocumentContent } from '../ingestion/extractor.js';
import { logAudit, requireAuth } from '../security/auth.js';
import { AiProviderError } from '../services/aiProvider.js';
import { summarizeDocumentWithGemini } from '../services/gemini.js';
import {
  deletePrivateObject,
  getPrivateObject,
  isObjectStorageAvailable,
  putPrivateObject,
} from '../services/objectStorage.js';

const router = express.Router();

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

const ALLOWED_EXTENSION_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const SAFE_INLINE_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/plain']);

function sanitizeOriginalFilename(raw: string): string {
  const base = path.basename(raw || 'document').replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_').trim();
  return (base || 'document').slice(0, 160);
}

function makeSafeKeyFilename(filename: string, ext: string): string {
  const stem = path.basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${stem || 'document'}${ext}`;
}

function validateFileExtensionAndSignature(filename: string, buffer: Buffer): { ext: string; canonicalMime: string } | null {
  const ext = path.extname(filename).toLowerCase();
  const canonicalMime = ALLOWED_EXTENSION_MIME[ext];
  if (!canonicalMime) return null;
  if (buffer.byteLength === 0) return null;

  // Magic-byte sanity check for binary formats
  if (ext === '.pdf' && !buffer.subarray(0, 8).toString('ascii').includes('%PDF-')) {
    return null;
  }
  if (ext === '.png') {
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.byteLength < 8 || !buffer.subarray(0, 8).equals(pngSig)) {
      return null;
    }
  }
  if ((ext === '.jpg' || ext === '.jpeg') && (buffer.byteLength < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff)) {
    return null;
  }
  if (ext === '.docx' && (buffer.byteLength < 2 || buffer[0] !== 0x50 || buffer[1] !== 0x4b)) {
    return null;
  }

  return { ext, canonicalMime };
}

function ensureStorageReady(res: express.Response): boolean {
  if (!hasNeonPostgres() || !isObjectStorageAvailable()) {
    res.status(503).json({
      code: 'USER_FILE_STORAGE_UNAVAILABLE',
      error:
        'Permanent private file storage is not configured on this server (requires Neon PostgreSQL and Neon Object Storage credentials).',
    });
    return false;
  }
  return true;
}

function isValidFileId(id: string): boolean {
  return typeof id === 'string' && /^[a-f0-9-]{16,64}$/i.test(id);
}

router.use('/user-files', requireAuth);

router.get('/user-files', async (req, res) => {
  try {
    if (!ensureStorageReady(res)) return;
    const ownerUid = req.user!.uid;
    const rows = await listUserFilesByOwner(ownerUid);
    res.json({
      files: rows.map((row) => serializeUserFileForClient(row, false)),
    });
  } catch (err) {
    console.error('[List User Files Error]', (err as Error).message);
    res.status(500).json({ error: `Failed to load private files: ${(err as Error).message}` });
  }
});

router.post('/user-files', upload.single('file'), async (req, res) => {
  try {
    if (!ensureStorageReady(res)) return;
    const ownerUid = req.user!.uid;
    const ownerEmail = req.user!.email || '';

    if (!req.file) {
      res.status(400).json({ error: 'Please select a file to upload.' });
      return;
    }

    const originalFilename = sanitizeOriginalFilename(req.file.originalname);
    const validated = validateFileExtensionAndSignature(originalFilename, req.file.buffer);
    if (!validated) {
      res.status(400).json({
        error: `Invalid or unsupported file. Allowed formats: ${Object.keys(ALLOWED_EXTENSION_MIME).join(', ')}`,
      });
      return;
    }

    const cfg = getServerConfig();
    const fileId = crypto.randomUUID();
    const safeFilename = makeSafeKeyFilename(originalFilename, validated.ext);
    const objectKey = `users/${ownerUid}/files/${fileId}/${safeFilename}`;
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

    let extractedText = '';
    let pageCount = 1;
    let ocrUsed = false;
    let extractionWarning = '';

    try {
      const extracted = await extractDocumentContent(
        req.file.buffer,
        originalFilename,
        validated.canonicalMime
      );
      extractedText = extracted.text || '';
      pageCount = extracted.pageCount || 1;
      ocrUsed = Boolean(extracted.ocrUsed);
    } catch (extractErr) {
      extractionWarning = (extractErr as Error).message;
    }

    const wantsSummary =
      req.body?.auto_summarize === 'true' ||
      req.body?.auto_summarize === '1' ||
      req.body?.summarize === 'true';
    const language = req.body?.language === 'ur' ? 'ur' : 'en';

    let summaryJson: any = null;
    let summaryLanguage: string | null = null;
    let summaryProviderMeta: any = null;
    let summaryWarning = '';

    if (wantsSummary) {
      if (!hasAnyAiProvider()) {
        summaryWarning = 'File stored permanently, but no AI provider key is configured to generate a summary.';
      } else if (extractedText.trim().length < 20) {
        summaryWarning =
          extractionWarning ||
          'File stored permanently, but insufficient readable text was extracted for AI summarization.';
      } else {
        try {
          const { data, meta } = await summarizeDocumentWithGemini({
            title: originalFilename,
            authority: 'User Uploaded Document (Unverified)',
            verificationStatus: 'user_uploaded_unverified',
            text: extractedText,
            language,
          });
          summaryJson = data;
          summaryLanguage = language;
          summaryProviderMeta = meta;
        } catch (sumErr) {
          summaryWarning = `File saved, but AI summary could not be generated: ${(sumErr as Error).message}`;
        }
      }
    }

    await putPrivateObject({
      key: objectKey,
      body: req.file.buffer,
      contentType: validated.canonicalMime,
      metadata: {
        owner_uid: ownerUid,
        file_id: fileId,
        sha256,
      },
    });

    let created;
    try {
      created = await createUserFileRecord({
        id: fileId,
        ownerUid,
        ownerEmail,
        originalFilename,
        safeFilename,
        mimeType: validated.canonicalMime,
        extension: validated.ext,
        sizeBytes: req.file.buffer.byteLength,
        sha256,
        bucketName: cfg.neonObjectStorageBucket || 'assets',
        objectKey,
        extractedText,
        pageCount,
        ocrUsed,
        summaryJson,
        summaryLanguage,
        summaryProviderMeta,
      });
    } catch (dbErr) {
      // Prevent orphaned object in S3 if DB insert fails
      await deletePrivateObject(objectKey).catch(() => {});
      throw dbErr;
    }

    logAudit(
      ownerUid,
      'USER_FILE_UPLOAD',
      'user_file',
      created.id,
      `Ext: ${created.extension}, Size: ${created.size_bytes}, Summarized: ${Boolean(created.summary_json)}`
    );

    res.status(201).json({
      file: serializeUserFileForClient(created, true),
      ...(extractionWarning ? { extraction_warning: extractionWarning } : {}),
      ...(summaryWarning ? { summary_warning: summaryWarning } : {}),
    });
  } catch (err) {
    console.error('[Upload User File Error]', (err as Error).message);
    res.status(500).json({ error: `Failed to store private file: ${(err as Error).message}` });
  }
});

router.get('/user-files/:id', async (req, res) => {
  try {
    if (!ensureStorageReady(res)) return;
    const id = String(req.params.id || '').trim();
    if (!isValidFileId(id)) {
      res.status(400).json({ error: 'Invalid file ID.' });
      return;
    }

    const row = await getUserFileRecordById(id);
    if (!row) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }

    if (row.owner_uid !== req.user!.uid) {
      logAudit(req.user!.uid, 'USER_FILE_FORBIDDEN_READ', 'user_file', id, 'Cross-user access blocked');
      res.status(403).json({ error: 'Access denied. This file belongs to another user.' });
      return;
    }

    res.json({ file: serializeUserFileForClient(row, true) });
  } catch (err) {
    console.error('[Get User File Error]', (err as Error).message);
    res.status(500).json({ error: `Failed to load file: ${(err as Error).message}` });
  }
});

router.get('/user-files/:id/download', async (req, res) => {
  try {
    if (!ensureStorageReady(res)) return;
    const id = String(req.params.id || '').trim();
    if (!isValidFileId(id)) {
      res.status(400).json({ error: 'Invalid file ID.' });
      return;
    }

    const row = await getUserFileRecordById(id);
    if (!row) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }

    if (row.owner_uid !== req.user!.uid) {
      logAudit(req.user!.uid, 'USER_FILE_FORBIDDEN_DOWNLOAD', 'user_file', id, 'Cross-user download blocked');
      res.status(403).json({ error: 'Access denied. This file belongs to another user.' });
      return;
    }

    const obj = await getPrivateObject(row.object_key);
    const wantsInline = req.query.inline === '1' || req.query.inline === 'true';
    const allowInline = wantsInline && SAFE_INLINE_MIMES.has(row.mime_type);
    const dispositionType = allowInline ? 'inline' : 'attachment';
    const encodedName = encodeURIComponent(row.original_filename);
    const asciiFallback = row.original_filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');

    res.setHeader('Content-Type', row.mime_type || obj.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(obj.buffer.byteLength));
    res.setHeader(
      'Content-Disposition',
      `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');

    res.send(obj.buffer);
  } catch (err) {
    console.error('[Download User File Error]', (err as Error).message);
    res.status(500).json({ error: `Failed to retrieve file from private storage: ${(err as Error).message}` });
  }
});

router.post('/user-files/:id/summarize', async (req, res) => {
  try {
    if (!ensureStorageReady(res)) return;
    const id = String(req.params.id || '').trim();
    if (!isValidFileId(id)) {
      res.status(400).json({ error: 'Invalid file ID.' });
      return;
    }

    const row = await getUserFileRecordById(id);
    if (!row) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }

    if (row.owner_uid !== req.user!.uid) {
      logAudit(req.user!.uid, 'USER_FILE_FORBIDDEN_SUMMARIZE', 'user_file', id, 'Cross-user summarize blocked');
      res.status(403).json({ error: 'Access denied. This file belongs to another user.' });
      return;
    }

    const language = req.body?.language === 'ur' ? 'ur' : 'en';
    const forceRegenerate = Boolean(req.body?.force);

    if (row.summary_json && row.summary_language === language && !forceRegenerate) {
      res.json({
        file: serializeUserFileForClient(row, true),
        summary: row.summary_json,
        provider_meta: row.summary_provider_meta,
        cached_in_db: true,
      });
      return;
    }

    if (!hasAnyAiProvider()) {
      res.status(503).json({
        code: 'AI_PROVIDER_UNAVAILABLE',
        error: 'No AI provider key (GEMINI_API_KEY or OPENROUTER_API_KEY) is configured on the server for document summarization.',
      });
      return;
    }

    let textToSummarize = row.extracted_text;
    if (textToSummarize.trim().length < 20) {
      const obj = await getPrivateObject(row.object_key);
      const reExtracted = await extractDocumentContent(obj.buffer, row.original_filename, row.mime_type);
      textToSummarize = reExtracted.text || '';
    }

    if (textToSummarize.trim().length < 20) {
      res.status(422).json({
        error: 'Insufficient readable text in this uploaded file to generate an AI summary.',
      });
      return;
    }

    const { data: summary, meta: providerMeta } = await summarizeDocumentWithGemini({
      title: row.original_filename,
      authority: 'User Uploaded Document (Unverified)',
      verificationStatus: 'user_uploaded_unverified',
      text: textToSummarize,
      language,
    });

    const updated = await saveUserFileSummary({
      id: row.id,
      ownerUid: req.user!.uid,
      summaryJson: summary,
      summaryLanguage: language,
      summaryProviderMeta: providerMeta,
    });

    if (!updated) {
      res.status(404).json({ error: 'File no longer exists.' });
      return;
    }

    logAudit(req.user!.uid, 'USER_FILE_SUMMARIZE', 'user_file', row.id, `Lang: ${language}`);

    res.json({
      file: serializeUserFileForClient(updated, true),
      summary: updated.summary_json,
      provider_meta: updated.summary_provider_meta,
      cached_in_db: false,
    });
  } catch (err) {
    console.error('[Summarize User File Error]', (err as Error).message);
    if (err instanceof AiProviderError) {
      res.status(err.status).json({ code: err.code, error: err.message });
      return;
    }
    res.status(502).json({ error: `Summarization failed: ${(err as Error).message}` });
  }
});

router.delete('/user-files/:id', async (req, res) => {
  try {
    if (!ensureStorageReady(res)) return;
    const id = String(req.params.id || '').trim();
    if (!isValidFileId(id)) {
      res.status(400).json({ error: 'Invalid file ID.' });
      return;
    }

    const row = await getUserFileRecordById(id);
    if (!row) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }

    if (row.owner_uid !== req.user!.uid) {
      logAudit(req.user!.uid, 'USER_FILE_FORBIDDEN_DELETE', 'user_file', id, 'Cross-user delete blocked');
      res.status(403).json({ error: 'Access denied. This file belongs to another user.' });
      return;
    }

    await deletePrivateObject(row.object_key);
    await deleteUserFileRecord(row.id, req.user!.uid);

    logAudit(req.user!.uid, 'USER_FILE_DELETE', 'user_file', row.id, row.original_filename);
    res.json({ deleted: true, id: row.id });
  } catch (err) {
    console.error('[Delete User File Error]', (err as Error).message);
    res.status(500).json({ error: `Failed to delete private file: ${(err as Error).message}` });
  }
});

export default router;
