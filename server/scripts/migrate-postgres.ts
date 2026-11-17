import { validateServerConfig, hasNeonPostgres } from '../config/env.js';
import { closePostgresPools, runPostgresMigrations } from '../db/postgres.js';

async function main() {
  validateServerConfig();
  if (!hasNeonPostgres()) {
    console.error('NEON_DATABASE_URL or DATABASE_URL is not configured.');
    process.exit(1);
  }

  const applied = await runPostgresMigrations();
  if (applied.length === 0) {
    console.log('Neon PostgreSQL schema is already up to date.');
  } else {
    console.log(`Applied PostgreSQL migrations: ${applied.join(', ')}`);
  }
}

main()
  .catch((err) => {
    console.error('PostgreSQL migration failed:', (err as Error).message);
    process.exit(1);
  })
  .finally(async () => {
    await closePostgresPools();
  });
