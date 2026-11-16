import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

export type AiProviderMode = 'auto' | 'gemini' | 'openrouter';

export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  appUrl: string;
  databasePath: string;
  databaseUrl: string;
  storagePath: string;
  llmModel: string;
  embeddingModel: string;
  aiProvider: AiProviderMode;
  openrouterModel: string;
  aiRequestTimeoutMs: number;
  aiMaxContextChars: number;
  aiMaxOutputTokens: number;
  adminEmails: string[];
  corsOrigins: string[];
  firebase: FirebaseAppletConfig;
}

let cachedConfig: ServerConfig | null = null;

export function resetServerConfigCache(): void {
  cachedConfig = null;
}

export function hasGeminiKey(): boolean {
  const k = process.env.GEMINI_API_KEY;
  return Boolean(k && k.trim().length > 10 && k !== 'MY_GEMINI_API_KEY' && k !== 'your_gemini_api_key_here');
}

export function hasOpenRouterKey(): boolean {
  const k = process.env.OPENROUTER_API_KEY;
  return Boolean(
    k &&
      k.trim().length > 10 &&
      k !== 'MY_OPENROUTER_API_KEY' &&
      k !== 'your_openrouter_api_key_here'
  );
}

export function hasAnyAiProvider(): boolean {
  const mode = (process.env.AI_PROVIDER || 'auto').trim().toLowerCase();
  if (mode === 'gemini') return hasGeminiKey();
  if (mode === 'openrouter') return hasOpenRouterKey();
  return hasGeminiKey() || hasOpenRouterKey();
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      'CONFIGURATION_ERROR: firebase-applet-config.json is missing. Run Firebase setup to provision project configuration.'
    );
  }
  let parsed: any;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    throw new Error(`CONFIGURATION_ERROR: Failed to parse firebase-applet-config.json: ${(err as Error).message}`);
  }
  if (!parsed?.projectId || !parsed?.firestoreDatabaseId || !parsed?.apiKey) {
    throw new Error(
      'CONFIGURATION_ERROR: firebase-applet-config.json is incomplete (projectId, apiKey, and firestoreDatabaseId are required).'
    );
  }
  return parsed as FirebaseAppletConfig;
}

function ensureWritableDirectory(dirPath: string, varName: string): void {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
  } catch (err) {
    throw new Error(
      `CONFIGURATION_ERROR: ${varName} directory "${dirPath}" is not writable: ${(err as Error).message}`
    );
  }
}

export function getServerConfig(): ServerConfig {
  if (cachedConfig) return cachedConfig;

  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`CONFIGURATION_ERROR: PORT "${process.env.PORT}" must be a valid port between 1 and 65535.`);
  }

  const nodeEnv = process.env.NODE_ENV || 'development';
  const rawAppUrl = (process.env.APP_URL || '').trim();
  const appUrl =
    rawAppUrl && rawAppUrl !== 'MY_APP_URL' ? rawAppUrl.replace(/\/+$/, '') : `http://localhost:${port}`;

  const databasePath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/compliance.db');
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  const storagePath = path.resolve(process.cwd(), process.env.STORAGE_PATH || './data/uploads');
  const llmModel = (process.env.LLM_MODEL || 'gemini-4-hydrogen').trim();
  const embeddingModel = (process.env.EMBEDDING_MODEL || 'gemini-embedding-2').trim();

  if (!llmModel || !embeddingModel) {
    throw new Error('CONFIGURATION_ERROR: LLM_MODEL and EMBEDDING_MODEL cannot be empty.');
  }

  const rawProvider = (process.env.AI_PROVIDER || 'auto').trim().toLowerCase();
  if (!['auto', 'gemini', 'openrouter'].includes(rawProvider)) {
    throw new Error(
      `CONFIGURATION_ERROR: AI_PROVIDER "${process.env.AI_PROVIDER}" must be one of "auto", "gemini", or "openrouter".`
    );
  }
  const aiProvider = rawProvider as AiProviderMode;

  const openrouterModel = (process.env.OPENROUTER_MODEL || 'openrouter/free').trim();
  if (!openrouterModel) {
    throw new Error('CONFIGURATION_ERROR: OPENROUTER_MODEL cannot be empty.');
  }

  const aiRequestTimeoutMs = Math.min(120000, Math.max(5000, Number(process.env.AI_REQUEST_TIMEOUT_MS || 30000) || 30000));
  const aiMaxContextChars = Math.min(60000, Math.max(4000, Number(process.env.AI_MAX_CONTEXT_CHARS || 16000) || 16000));
  const aiMaxOutputTokens = Math.min(8192, Math.max(300, Number(process.env.AI_MAX_OUTPUT_TOKENS || 1800) || 1800));

  ensureWritableDirectory(path.dirname(databasePath), 'DATABASE_PATH');
  ensureWritableDirectory(storagePath, 'STORAGE_PATH');

  const firebase = loadFirebaseConfig();
  const adminEmails = Array.from(
    new Set(
      (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && e !== 'admin@example.com')
    )
  );

  const corsOrigins = Array.from(
    new Set(
      [rawAppUrl, ...(process.env.CORS_ORIGINS || '').split(',')]
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter((o) => o && o !== 'MY_APP_URL')
    )
  );

  cachedConfig = {
    port,
    nodeEnv,
    appUrl,
    databasePath,
    databaseUrl,
    storagePath,
    llmModel,
    embeddingModel,
    aiProvider,
    openrouterModel,
    aiRequestTimeoutMs,
    aiMaxContextChars,
    aiMaxOutputTokens,
    adminEmails,
    corsOrigins,
    firebase,
  };

  return cachedConfig;
}

export function validateServerConfig(): ServerConfig {
  const cfg = getServerConfig();
  const geminiOk = hasGeminiKey();
  const openrouterOk = hasOpenRouterKey();

  if (!geminiOk && !openrouterOk) {
    console.warn(
      '[Config Warning] Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is configured. Official document browsing and Firestore persistence remain operational, while AI chat, comparison, checklists, and summarization require at least one configured AI provider key.'
    );
  } else if (cfg.aiProvider === 'gemini' && !geminiOk) {
    console.warn('[Config Warning] AI_PROVIDER=gemini is set, but GEMINI_API_KEY is missing.');
  } else if (cfg.aiProvider === 'openrouter' && !openrouterOk) {
    console.warn('[Config Warning] AI_PROVIDER=openrouter is set, but OPENROUTER_API_KEY is missing.');
  }

  return cfg;
}

