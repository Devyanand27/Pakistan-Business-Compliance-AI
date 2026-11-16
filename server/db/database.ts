import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getServerConfig } from '../config/env.js';

const dbPath = getServerConfig().databasePath;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ur')),
      theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      privacy_analytics INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS business_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      business_name TEXT DEFAULT '',
      business_type TEXT NOT NULL,
      legal_structure TEXT NOT NULL,
      industry TEXT NOT NULL,
      province TEXT NOT NULL,
      city TEXT NOT NULL,
      business_activity TEXT NOT NULL,
      ownership_count INTEGER NOT NULL DEFAULT 1,
      has_employees INTEGER NOT NULL DEFAULT 0,
      sells_goods INTEGER NOT NULL DEFAULT 0,
      provides_services INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS authorities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      official_domain TEXT NOT NULL,
      website_url TEXT NOT NULL,
      authority_type TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      authority_id INTEGER REFERENCES authorities(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      document_type TEXT NOT NULL,
      document_number TEXT DEFAULT '',
      publication_date TEXT DEFAULT '',
      effective_date TEXT DEFAULT '',
      last_updated_date TEXT DEFAULT '',
      retrieval_date TEXT NOT NULL DEFAULT (datetime('now')),
      language TEXT NOT NULL DEFAULT 'en',
      version TEXT NOT NULL DEFAULT '1.0',
      page_count INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'superseded', 'outdated', 'conflict_review')),
      verification_status TEXT NOT NULL DEFAULT 'verified_official' CHECK (verification_status IN ('verified_official', 'user_uploaded_unverified')),
      is_superseded INTEGER NOT NULL DEFAULT 0,
      superseded_by_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      previous_version_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      conflict_note TEXT DEFAULT '',
      checksum TEXT NOT NULL UNIQUE,
      file_path TEXT DEFAULT '',
      raw_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_documents_authority ON documents(authority_id);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

    CREATE TABLE IF NOT EXISTS document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_text TEXT NOT NULL,
      page_number INTEGER NOT NULL DEFAULT 1,
      section_title TEXT NOT NULL DEFAULT 'General',
      chunk_index INTEGER NOT NULL,
      embedding BLOB,
      embedding_dim INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      chunk_text,
      section_title,
      content='document_chunks',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON document_chunks BEGIN
      INSERT INTO chunks_fts(rowid, chunk_text, section_title) VALUES (new.id, new.chunk_text, new.section_title);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON document_chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text, section_title) VALUES('delete', old.id, old.chunk_text, old.section_title);
    END;
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON document_chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text, section_title) VALUES('delete', old.id, old.chunk_text, old.section_title);
      INSERT INTO chunks_fts(rowid, chunk_text, section_title) VALUES (new.id, new.chunk_text, new.section_title);
    END;

    CREATE TABLE IF NOT EXISTS ingestion_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'url', 'seed')),
      source_input TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      ocr_used INTEGER NOT NULL DEFAULT 0,
      error_message TEXT DEFAULT '',
      chunks_created INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      is_saved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      structured_json TEXT DEFAULT '{}',
      evidence_level TEXT DEFAULT 'none',
      warning_text TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

    CREATE TABLE IF NOT EXISTS citations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_id INTEGER NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
      citation_text TEXT NOT NULL,
      page_number INTEGER NOT NULL DEFAULT 1,
      section_reference TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_citations_message ON citations(message_id);

    CREATE TABLE IF NOT EXISTS checklists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_profile_id INTEGER REFERENCES business_profiles(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_checklists_user ON checklists(user_id);

    CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      applicable_business_type TEXT DEFAULT 'All',
      authority_name TEXT DEFAULT 'General',
      source_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      source_chunk_id INTEGER REFERENCES document_chunks(id) ON DELETE SET NULL,
      citation_label TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'needs_review')),
      is_user_created INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      last_reviewed_at TEXT DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist ON checklist_items(checklist_id);

    CREATE TABLE IF NOT EXISTS saved_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL CHECK (item_type IN ('conversation', 'answer', 'citation', 'document')),
      item_reference_id INTEGER NOT NULL,
      folder_name TEXT NOT NULL DEFAULT 'General Research',
      title TEXT NOT NULL,
      excerpt TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_saved_items_user ON saved_items(user_id);

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
      rating TEXT NOT NULL CHECK (rating IN ('helpful', 'not_helpful', 'inaccurate', 'outdated', 'general')),
      comment TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_uid TEXT DEFAULT '',
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Ensure actor_uid column exists on pre-existing databases
  const auditCols = db.prepare(`PRAGMA table_info(audit_logs)`).all() as Array<{ name: string }>;
  if (!auditCols.some((c) => c.name === 'actor_uid')) {
    db.exec(`ALTER TABLE audit_logs ADD COLUMN actor_uid TEXT DEFAULT ''`);
  }
}
