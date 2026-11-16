import { validateServerConfig } from './server/config/env.js';
import { buildServerApp } from './server/app.js';

const config = validateServerConfig();

async function startServer() {
  const app = await buildServerApp({ serveFrontend: true });

  app.listen(config.port, '0.0.0.0', () => {
    console.log(
      `Pakistan Business Compliance AI listening on http://0.0.0.0:${config.port} (Firebase project: ${config.firebase.projectId}, AI mode: ${config.aiProvider})`
    );
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
