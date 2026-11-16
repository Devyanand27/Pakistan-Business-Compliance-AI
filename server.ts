import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { validateServerConfig } from './server/config/env.js';
import { db, initSchema } from './server/db/database.js';
import { seedDatabase } from './server/db/seed.js';
import adminRoutes from './server/routes/admin.js';
import chatRoutes from './server/routes/chat.js';
import checklistRoutes from './server/routes/checklists.js';
import documentRoutes from './server/routes/documents.js';
import { hasGeminiKey } from './server/services/gemini.js';

const config = validateServerConfig();

async function startServer() {
  initSchema();
  await seedDatabase();

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

  // Health check endpoint (returns non-secret operational configuration diagnostics)
  app.get('/api/health', (_req, res) => {
    try {
      const docs = (db.prepare(`SELECT COUNT(*) as c FROM documents`).get() as any).c;
      const chunks = (db.prepare(`SELECT COUNT(*) as c FROM document_chunks`).get() as any).c;
      res.json({
        status: 'ok',
        database: 'connected',
        auth_provider: 'firebase',
        firebase_project_id: config.firebase.projectId,
        indexed_documents: docs,
        indexed_chunks: chunks,
        llm_model: config.llmModel,
        embedding_model: config.embeddingModel,
        ai_provider_configured: hasGeminiKey(),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ status: 'error', error: (err as Error).message });
    }
  });

  // Protected & Public Regulatory / RAG API routers (Firebase ID Token authenticated)
  app.use('/api', chatRoutes);
  app.use('/api', documentRoutes);
  app.use('/api', checklistRoutes);
  app.use('/api/admin', adminRoutes);

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server Error]', err?.message || err);
    res.status(err?.status || 500).json({
      error: err?.message || 'Unexpected internal server error.',
    });
  });

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

  app.listen(config.port, '0.0.0.0', () => {
    console.log(
      `Pakistan Business Compliance AI listening on http://0.0.0.0:${config.port} (Firebase project: ${config.firebase.projectId})`
    );
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
