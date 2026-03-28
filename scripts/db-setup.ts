/**
 * db-setup.ts
 *
 * Explicit database workflows:
 * - init-dev:     SQLite/local development bootstrap
 * - migrate-prod: PostgreSQL/production migration deploy (fail-fast)
 *
 * Usage:
 *   tsx scripts/db-setup.ts init-dev
 *   tsx scripts/db-setup.ts migrate-prod
 */

import { execSync } from 'child_process';
import path from 'path';
import { loadApplicationEnvironment, readProjectEnv } from '../lib/env-loader';
import { isSqliteUrl, resolvePrismaSchemaPath } from '../lib/prisma-schema';

const ROOT = path.join(__dirname, '..');

type SetupMode = 'init-dev' | 'migrate-prod';

function getEffectiveDatabaseUrl(mode: SetupMode): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envValues = readProjectEnv({ cwd: ROOT, mode: process.env.NODE_ENV === 'production' ? 'production' : 'development' });
  if (envValues.DATABASE_URL) return envValues.DATABASE_URL;

  if (mode === 'init-dev') {
    return 'file:./prisma/dev.db';
  }

  console.error('❌ DATABASE_URL is required for migrate-prod.');
  process.exit(1);
}

function run(cmd: string, description: string) {
  console.log(`▶  ${description}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT, env: process.env });
    console.log(`✅  ${description} — done\n`);
  } catch (error) {
    console.error(`❌  ${description} — failed`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function resolveMode(rawMode: string | undefined): SetupMode {
  if (rawMode === 'init-dev' || rawMode === 'migrate-prod') {
    return rawMode;
  }

  console.error('❌ Invalid mode. Use one of: init-dev, migrate-prod');
  process.exit(1);
}

loadApplicationEnvironment({ cwd: ROOT, forceMode: process.env.NODE_ENV === 'production' ? 'production' : 'development' });

const mode = resolveMode(process.argv[2]);
const databaseUrl = getEffectiveDatabaseUrl(mode);
const sqlite = isSqliteUrl(databaseUrl);

process.env.DATABASE_URL = databaseUrl;

if (mode === 'init-dev' && !sqlite) {
  console.error('❌ init-dev only supports SQLite DATABASE_URL values (file:...).');
  process.exit(1);
}

if (mode === 'migrate-prod' && sqlite) {
  console.error('❌ migrate-prod requires a non-SQLite database URL.');
  process.exit(1);
}

const schemaPath = resolvePrismaSchemaPath(ROOT, databaseUrl);
const schemaArg = `--schema=${schemaPath}`;

console.log(`\n🗄️  Elahe Messenger DB Setup`);
console.log(`   Mode     : ${mode}`);
console.log(`   Provider : ${sqlite ? 'SQLite (local dev)' : 'PostgreSQL'}`);
console.log(`   Schema   : ${schemaPath}`);
console.log(`   URL      : ${databaseUrl.replace(/:\/\/[^@]+@/, '://*****@')}\n`);

run(`npx prisma generate ${schemaArg}`, 'Generating Prisma client');

if (mode === 'init-dev') {
  run(`npx prisma db push ${schemaArg}`, 'Initializing SQLite development schema');
} else {
  run(`npx prisma migrate deploy ${schemaArg}`, 'Deploying PostgreSQL migrations');
}

console.log('🎉  Database setup complete!\n');
