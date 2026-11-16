import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

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
  databasePath: string;
  storagePath: string;
  llmModel: string;
  embeddingModel: string;
  adminEmails: string[];
  firebase: FirebaseAppletConfig;
}

let cachedConfig: ServerConfig | null = null;

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
  const databasePath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/compliance.db');
  const storagePath = path.resolve(process.cwd(), process.env.STORAGE_PATH || './data/uploads');
  const llmModel = (process.env.LLM_MODEL || 'gemini-4-hydrogen').trim();
  const embeddingModel = (process.env.EMBEDDING_MODEL || 'gemini-embedding-2').trim();

  if (!llmModel || !embeddingModel) {
    throw new Error('CONFIGURATION_ERROR: LLM_MODEL and EMBEDDING_MODEL cannot be empty.');
  }

  ensureWritableDirectory(path.dirname(databasePath), 'DATABASE_PATH');
  ensureWritableDirectory(storagePath, 'STORAGE_PATH');

  const firebase = loadFirebaseConfig();
  const extraAdmins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const adminEmails = Array.from(new Set(['nanddevya27@gmail.com', ...extraAdmins]));

  cachedConfig = {
    port,
    nodeEnv,
    databasePath,
    storagePath,
    llmModel,
    embeddingModel,
    adminEmails,
    firebase,
  };

  return cachedConfig;
}

export function validateServerConfig(): ServerConfig {
  const cfg = getServerConfig();
  const geminiOk = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY.trim().length > 10 &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );
  if (!geminiOk) {
    console.warn(
      '[Config Warning] GEMINI_API_KEY is not injected in the environment. Official document browsing and Firestore persistence remain operational, while AI RAG chat/comparison/summarization require GEMINI_API_KEY.'
    );
  }
  return cfg;
}
