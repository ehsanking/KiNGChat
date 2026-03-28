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
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

type SetupMode = 'init-dev' | 'migrate-prod';

function readEnvLocal(): Record<string, string> {
  const envLocalPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envLocalPath)) return {};

  const lines = fs.readFileSync(envLocalPath, 'utf8').split('\n');
  const result: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    result[key] = val;
  }

  return result;
}

function getEffectiveDatabaseUrl(mode: SetupMode): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envLocal = readEnvLocal();
  if (envLocal.DATABASE_URL) return envLocal.DATABASE_URL;

  if (mode === 'init-dev') {
    return 'file:./prisma/dev.db';
  }

  console.error('❌ DATABASE_URL is required for migrate-prod.');
  process.exit(1);
}

function isSqlite(url: string): boolean {
  return url.trim().startsWith('file:');
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

const mode = resolveMode(process.argv[2]);
const databaseUrl = getEffectiveDatabaseUrl(mode);
const sqlite = isSqlite(databaseUrl);

process.env.DATABASE_URL = databaseUrl;

if (mode === 'init-dev' && !sqlite) {
  console.error('❌ init-dev only supports SQLite DATABASE_URL values (file:...).');
  process.exit(1);
}

if (mode === 'migrate-prod' && sqlite) {
  console.error('❌ migrate-prod requires a non-SQLite database URL.');
  process.exit(1);
}

const schemaPath = sqlite
  ? path.join(ROOT, 'prisma', 'schema.sqlite.prisma')
  : path.join(ROOT, 'prisma', 'schema.prisma');
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
