import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import {
  getServerConfig,
  hasAnyAiProvider,
  hasGeminiKey,
  hasNeonPostgres,
  hasOpenRouterKey,
} from './config/env.js';
import { db, initSchema } from './db/database.js';
import { ensurePostgresSchema } from './db/postgres.js';
import { seedDatabase } from './db/seed.js';
import adminRoutes from './routes/admin.js';
import chatRoutes from './routes/chat.js';
import checklistRoutes from './routes/checklists.js';
import documentRoutes from './routes/documents.js';
import userFilesRoutes from './routes/userFiles.js';
import { isObjectStorageAvailable } from './services/objectStorage.js';

export interface BuildAppOptions {
  serveFrontend?: boolean;
  disableRateLimit?: boolean;
}

export async function buildServerApp(options: BuildAppOptions = {}): Promise<express.Express> {
  const config = getServerConfig();
  initSchema();
  await seedDatabase();
  if (hasNeonPostgres()) {
    try {
      await ensurePostgresSchema();
    } catch (err) {
      console.error('[Neon Postgres Init Warning]', (err as Error).message);
    }
  }

  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: false,
    })
  );
  app.use(express.json({ limit: '2mb' }));

  // Explicit CORS policy for API endpoints (allows same-origin, configured APP_URL/CORS_ORIGINS, and dev localhost)
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }
    const cleanOrigin = origin.replace(/\/+$/, '');
    const hostOrigin = req.headers.host ? `${req.protocol}://${req.headers.host}` : '';
    const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin);
    const currentCors = getServerConfig().corsOrigins;
    const isAllowed =
      cleanOrigin === hostOrigin ||
      currentCors.includes(cleanOrigin) ||
      (config.nodeEnv !== 'production' && isLocalOrigin);

    if (!isAllowed) {
      res.status(403).json({ error: 'Cross-origin API request denied by CORS policy.' });
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  if (!options.disableRateLimit) {
    const apiLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Please slow down and retry shortly.' },
    });

    const aiLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 25,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'AI query rate limit reached. Please wait a minute before retrying.' },
    });

    app.use('/api', apiLimiter);
    app.use(
      [
        '/api/chat',
        '/api/compare',
        '/api/checklists/generate',
        '/api/documents/summarize',
        '/api/user-files/:id/summarize',
      ],
      aiLimiter
    );
  }

  // Health check endpoint (returns non-secret operational configuration diagnostics)
  app.get('/api/health', (_req, res) => {
    try {
      const currentCfg = getServerConfig();
      const docs = (db.prepare(`SELECT COUNT(*) as c FROM documents`).get() as any).c;
      const chunks = (db.prepare(`SELECT COUNT(*) as c FROM document_chunks`).get() as any).c;
      res.json({
        status: 'ok',
        database: 'connected',
        database_mode: currentCfg.neonDatabaseUrl ? 'postgres_configured_sqlite_active' : 'sqlite_fts5',
        neon_postgres_configured: hasNeonPostgres(),
        neon_object_storage_configured: isObjectStorageAvailable(),
        neon_storage_bucket: currentCfg.neonObjectStorageBucket,
        auth_provider: 'firebase',
        firebase_project_id: currentCfg.firebase.projectId,
        indexed_documents: docs,
        indexed_chunks: chunks,
        llm_model: currentCfg.llmModel,
        embedding_model: currentCfg.embeddingModel,
        ai_provider_mode: currentCfg.aiProvider,
        openrouter_model: currentCfg.openrouterModel,
        gemini_configured: hasGeminiKey(),
        openrouter_configured: hasOpenRouterKey(),
        ai_provider_configured: hasAnyAiProvider(),
        cors_origins_configured: currentCfg.corsOrigins.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: (err as Error).message });
    }
  });

  // Protected & Public Regulatory / RAG API routers (Firebase ID Token authenticated)
  app.use('/api', chatRoutes);
  app.use('/api', documentRoutes);
  app.use('/api', userFilesRoutes);
  app.use('/api', checklistRoutes);
  app.use('/api/admin', adminRoutes);

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server Error]', err?.message || err);
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Uploaded file exceeds the 10 MB size limit.' });
      return;
    }
    res.status(err?.status || 500).json({
      error: err?.message || 'Unexpected internal server error.',
    });
  });

  if (options.serveFrontend !== false) {
    if (config.nodeEnv !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distDir = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  return app;
}
