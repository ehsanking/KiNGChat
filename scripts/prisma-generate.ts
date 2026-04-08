import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { loadApplicationEnvironment, readProjectEnv } from '../lib/env-loader';
import { resolvePrismaSchemaPath } from '../lib/prisma-schema';

const ROOT = path.join(__dirname, '..');

const resolveDatabaseUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envValues = readProjectEnv({
    cwd: ROOT,
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  });
  if (envValues.DATABASE_URL) return envValues.DATABASE_URL;
  // Default to PostgreSQL schema generation so Prisma Client types match the
  // production feature set even when DATABASE_URL is missing at install time.
  return 'postgresql://postgres:postgres@localhost:5432/elahe_messenger';
};


const hasGeneratedPrismaClient = () => {
  const clientEntrypoint = path.join(ROOT, 'node_modules', '@prisma', 'client', 'index.js');
  const generatedClientEntrypoint = path.join(ROOT, 'node_modules', '.prisma', 'client', 'index.js');
  return fs.existsSync(clientEntrypoint) && fs.existsSync(generatedClientEntrypoint);
};

const runPrismaGenerate = (
  schemaPath: string,
  additionalArgs: string[] = [],
  envOverrides: Record<string, string> = {},
) => {
  const args = ['generate', `--schema=${schemaPath}`, ...additionalArgs].join(' ');
  execSync(`npx prisma ${args}`, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...envOverrides },
  });
};

loadApplicationEnvironment({ cwd: ROOT, forceMode: process.env.NODE_ENV === 'production' ? 'production' : 'development' });
const databaseUrl = resolveDatabaseUrl();
const schemaPath = resolvePrismaSchemaPath(ROOT, databaseUrl);

process.env.DATABASE_URL = databaseUrl;

try {
  runPrismaGenerate(schemaPath);
} catch (error) {
  console.warn('⚠️ Prisma generate failed. Retrying client generation with --no-engine for restricted/offline environments.');
  try {
    runPrismaGenerate(schemaPath, ['--no-engine'], { PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING: '1' });
  } catch {
    if (!hasGeneratedPrismaClient()) {
      throw error;
    }

    console.warn('⚠️ Prisma client generation skipped due to blocked engine download. Using existing generated Prisma client.');
  }
}
