/**
 * db-setup.ts
 *
 * Smart database setup script that automatically detects the database type
 * from DATABASE_URL and runs the appropriate Prisma commands.
 *
 * Usage: tsx scripts/db-setup.ts
 *
 * - If DATABASE_URL starts with "file:" (SQLite), uses schema.sqlite.prisma
 * - Otherwise, uses the default schema.prisma (PostgreSQL)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

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

function getEffectiveDatabaseUrl(): string {
  // Priority: process.env > .env.local > fallback to SQLite
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envLocal = readEnvLocal();
  if (envLocal.DATABASE_URL) return envLocal.DATABASE_URL;

  // Default to SQLite in non-production
  if (process.env.NODE_ENV !== 'production') {
    return 'file:./prisma/dev.db';
  }

  console.error('❌  DATABASE_URL is required in production.');
  process.exit(1);
}

function isSqlite(url: string): boolean {
  return url.trim().startsWith('file:');
}

const databaseUrl = getEffectiveDatabaseUrl();
const sqlite = isSqlite(databaseUrl);

// Set env so Prisma picks it up
process.env.DATABASE_URL = databaseUrl;

const schemaPath = sqlite
  ? path.join(ROOT, 'prisma', 'schema.sqlite.prisma')
  : path.join(ROOT, 'prisma', 'schema.prisma');

const schemaArg = `--schema=${schemaPath}`;

console.log(`\n🗄️  Elahe Messenger DB Setup`);
console.log(`   Provider : ${sqlite ? 'SQLite (local dev)' : 'PostgreSQL'}`);
console.log(`   Schema   : ${schemaPath}`);
console.log(`   URL      : ${databaseUrl.replace(/:\/\/[^@]+@/, '://*****@')}\n`);

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

// 1. Generate Prisma client
run(`npx prisma generate ${schemaArg}`, 'Generating Prisma client');

// 2. Push schema (SQLite) or migrate deploy (PostgreSQL)
if (sqlite) {
  run(
    `npx prisma db push ${schemaArg} --accept-data-loss`,
    'Pushing schema to SQLite database'
  );
} else {
  run(
    `npx prisma migrate deploy ${schemaArg}`,
    'Deploying database migrations'
  );
}

console.log('🎉  Database setup complete!\n');
