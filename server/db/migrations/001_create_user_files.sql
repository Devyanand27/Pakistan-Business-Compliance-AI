CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_files (
  id TEXT PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  owner_email TEXT NOT NULL DEFAULT '',
  original_filename TEXT NOT NULL,
  safe_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  bucket_name TEXT NOT NULL DEFAULT 'assets',
  object_key TEXT NOT NULL UNIQUE,
  extracted_text TEXT NOT NULL DEFAULT '',
  page_count INTEGER NOT NULL DEFAULT 1,
  ocr_used BOOLEAN NOT NULL DEFAULT FALSE,
  summary_json JSONB,
  summary_language TEXT DEFAULT 'en',
  summary_provider_meta JSONB,
  summarized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_files_owner_created
  ON user_files (owner_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_files_owner_sha256
  ON user_files (owner_uid, sha256);
