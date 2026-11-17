import { ensurePostgresSchema, getPostgresPool } from './postgres.js';

export interface UserFileRecordRow {
  id: string;
  owner_uid: string;
  owner_email: string;
  original_filename: string;
  safe_filename: string;
  mime_type: string;
  extension: string;
  size_bytes: number;
  sha256: string;
  bucket_name: string;
  object_key: string;
  extracted_text: string;
  page_count: number;
  ocr_used: boolean;
  summary_json: any | null;
  summary_language: string | null;
  summary_provider_meta: any | null;
  summarized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateUserFileInput {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  originalFilename: string;
  safeFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  bucketName: string;
  objectKey: string;
  extractedText: string;
  pageCount: number;
  ocrUsed: boolean;
  summaryJson?: any | null;
  summaryLanguage?: string | null;
  summaryProviderMeta?: any | null;
}

function mapRow(row: any): UserFileRecordRow {
  return {
    id: String(row.id),
    owner_uid: String(row.owner_uid),
    owner_email: String(row.owner_email || ''),
    original_filename: String(row.original_filename),
    safe_filename: String(row.safe_filename),
    mime_type: String(row.mime_type),
    extension: String(row.extension),
    size_bytes: Number(row.size_bytes || 0),
    sha256: String(row.sha256),
    bucket_name: String(row.bucket_name || 'assets'),
    object_key: String(row.object_key),
    extracted_text: String(row.extracted_text || ''),
    page_count: Number(row.page_count || 1),
    ocr_used: Boolean(row.ocr_used),
    summary_json: row.summary_json ?? null,
    summary_language: row.summary_language ? String(row.summary_language) : null,
    summary_provider_meta: row.summary_provider_meta ?? null,
    summarized_at: row.summarized_at ? new Date(row.summarized_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

export function serializeUserFileForClient(row: UserFileRecordRow, includeFullText = false) {
  return {
    id: row.id,
    original_filename: row.original_filename,
    mime_type: row.mime_type,
    extension: row.extension,
    size_bytes: row.size_bytes,
    sha256: row.sha256,
    page_count: row.page_count,
    ocr_used: row.ocr_used,
    has_extracted_text: row.extracted_text.trim().length > 0,
    extracted_text_preview: row.extracted_text.slice(0, 320),
    ...(includeFullText ? { extracted_text: row.extracted_text } : {}),
    has_summary: Boolean(row.summary_json),
    summary_json: row.summary_json,
    summary_language: row.summary_language,
    summary_provider_meta: row.summary_provider_meta,
    summarized_at: row.summarized_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    verification_status: 'user_uploaded_unverified' as const,
  };
}

export async function createUserFileRecord(input: CreateUserFileInput): Promise<UserFileRecordRow> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const hasSummary = Boolean(input.summaryJson);

  const res = await pool.query(
    `INSERT INTO user_files (
       id, owner_uid, owner_email, original_filename, safe_filename,
       mime_type, extension, size_bytes, sha256, bucket_name, object_key,
       extracted_text, page_count, ocr_used, summary_json, summary_language,
       summary_provider_meta, summarized_at
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16,
       $17, ${hasSummary ? 'NOW()' : 'NULL'}
     )
     RETURNING *`,
    [
      input.id,
      input.ownerUid,
      input.ownerEmail,
      input.originalFilename,
      input.safeFilename,
      input.mimeType,
      input.extension,
      input.sizeBytes,
      input.sha256,
      input.bucketName,
      input.objectKey,
      input.extractedText,
      input.pageCount,
      input.ocrUsed,
      input.summaryJson ? JSON.stringify(input.summaryJson) : null,
      input.summaryLanguage || (hasSummary ? 'en' : null),
      input.summaryProviderMeta ? JSON.stringify(input.summaryProviderMeta) : null,
    ]
  );

  return mapRow(res.rows[0]);
}

export async function listUserFilesByOwner(ownerUid: string): Promise<UserFileRecordRow[]> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const res = await pool.query(
    `SELECT * FROM user_files WHERE owner_uid = $1 ORDER BY created_at DESC`,
    [ownerUid]
  );
  return res.rows.map(mapRow);
}

export async function getUserFileRecordById(id: string): Promise<UserFileRecordRow | null> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const res = await pool.query(`SELECT * FROM user_files WHERE id = $1`, [id]);
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0]);
}

export async function saveUserFileSummary(params: {
  id: string;
  ownerUid: string;
  summaryJson: any;
  summaryLanguage: string;
  summaryProviderMeta: any;
}): Promise<UserFileRecordRow | null> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const res = await pool.query(
    `UPDATE user_files
     SET summary_json = $1,
         summary_language = $2,
         summary_provider_meta = $3,
         summarized_at = NOW(),
         updated_at = NOW()
     WHERE id = $4 AND owner_uid = $5
     RETURNING *`,
    [
      JSON.stringify(params.summaryJson),
      params.summaryLanguage,
      JSON.stringify(params.summaryProviderMeta || {}),
      params.id,
      params.ownerUid,
    ]
  );
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0]);
}

export async function deleteUserFileRecord(id: string, ownerUid: string): Promise<UserFileRecordRow | null> {
  await ensurePostgresSchema();
  const pool = getPostgresPool();
  const res = await pool.query(
    `DELETE FROM user_files WHERE id = $1 AND owner_uid = $2 RETURNING *`,
    [id, ownerUid]
  );
  if (res.rows.length === 0) return null;
  return mapRow(res.rows[0]);
}
