import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { getServerConfig, hasNeonPostgres } from '../config/env.js';

let pooledPool: pg.Pool | null = null;
let cachedPoolUrl = '';
let schemaPromise: Promise<void> | null = null;
let schemaUrl = '';

function resolveConnectionSsl(connectionString: string): pg.PoolConfig['ssl'] {
  if (/localhost|127\.0\.0\.1/i.test(connectionString) && !/sslmode=require/i.test(connectionString)) {
    return undefined;
  }
  return { rejectUnauthorized: true };
}

function getPooledUrl(): string {
  const cfg = getServerConfig();
  return cfg.neonDatabaseUrl;
}

function getDirectMigrationUrl(): string {
  const cfg = getServerConfig();
  return cfg.neonDatabaseUnpooledUrl || cfg.neonDatabaseUrl;
}

export function getPostgresPool(): pg.Pool {
  const connStr = getPooledUrl();
  if (!connStr) {
    throw new Error('NEON_POSTGRES_UNAVAILABLE: NEON_DATABASE_URL / DATABASE_URL is not configured.');
  }

  if (pooledPool && cachedPoolUrl === connStr) {
    return pooledPool;
  }

  if (pooledPool) {
    pooledPool.end().catch(() => {});
    pooledPool = null;
  }

  pooledPool = new pg.Pool({
    connectionString: connStr,
    ssl: resolveConnectionSsl(connStr),
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  cachedPoolUrl = connStr;
  return pooledPool;
}

export async function runPostgresMigrations(): Promise<string[]> {
  const directUrl = getDirectMigrationUrl();
  if (!directUrl) {
    return [];
  }

  const migrationsDir = path.resolve(process.cwd(), 'server/db/migrations');
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    return [];
  }

  const client = new pg.Client({
    connectionString: directUrl,
    ssl: resolveConnectionSsl(directUrl),
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  const newlyApplied: string[] = [];

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const appliedRes = await client.query<{ version: string }>(`SELECT version FROM schema_migrations`);
    const appliedSet = new Set(appliedRes.rows.map((r) => r.version));

    for (const file of migrationFiles) {
      if (appliedSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`, [
          file,
        ]);
        await client.query('COMMIT');
        newlyApplied.push(file);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      }
    }
  } finally {
    await client.end().catch(() => {});
  }

  return newlyApplied;
}

export async function ensurePostgresSchema(): Promise<void> {
  if (!hasNeonPostgres()) return;
  const currentUrl = getDirectMigrationUrl();
  if (schemaPromise && schemaUrl === currentUrl) {
    return schemaPromise;
  }

  schemaUrl = currentUrl;
  schemaPromise = runPostgresMigrations().then((applied) => {
    if (applied.length > 0) {
      console.log(`[Neon Postgres] Applied migrations: ${applied.join(', ')}`);
    }
  }).catch((err) => {
    schemaPromise = null;
    throw err;
  });

  return schemaPromise;
}

export async function verifyPostgresConnection(): Promise<boolean> {
  if (!hasNeonPostgres()) return false;
  const pool = getPostgresPool();
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}

export async function closePostgresPools(): Promise<void> {
  if (pooledPool) {
    await pooledPool.end().catch(() => {});
    pooledPool = null;
    cachedPoolUrl = '';
  }
  schemaPromise = null;
  schemaUrl = '';
}
