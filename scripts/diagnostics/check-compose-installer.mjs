import { createResult, readText } from "./_shared.mjs";

function parseComposeServices(composeText) {
  const lines = composeText.split(/\r?\n/);
  const services = [];
  let inServices = false;

  for (const line of lines) {
    if (!inServices) {
      if (/^services:\s*$/.test(line)) inServices = true;
      continue;
    }

    if (/^[^\s]/.test(line) && !/^services:\s*$/.test(line)) {
      break;
    }

    const match = line.match(/^\s{2}([a-zA-Z0-9_-]+):\s*$/);
    if (match) services.push(match[1]);
  }

  return services;
}

function parseServiceEnvironment(composeText, serviceName) {
  const lines = composeText.split(/\r?\n/);
  let inService = false;
  let serviceIndent = 0;
  let inEnvironment = false;
  let envIndent = 0;
  const envKeys = new Set();

  for (const line of lines) {
    const indent = (line.match(/^\s*/) || [""])[0].length;

    if (!inService) {
      if (new RegExp(`^\\s{2}${serviceName}:\\s*$`).test(line)) {
        inService = true;
        serviceIndent = indent;
      }
      continue;
    }

    if (indent <= serviceIndent && /^\s*[a-zA-Z0-9_-]+:\s*$/.test(line)) {
      break;
    }

    if (!inEnvironment) {
      if (/^\s+environment:\s*$/.test(line)) {
        inEnvironment = true;
        envIndent = indent;
      }
      continue;
    }

    if (indent <= envIndent) {
      inEnvironment = false;
      continue;
    }

    const envMatch = line.match(/^\s*-\s*([A-Z0-9_]+)=/);
    if (envMatch) envKeys.add(envMatch[1]);
  }

  return envKeys;
}

function findMissingInstallerMentions(installerText, keys) {
  return Array.from(keys).filter((key) => !installerText.includes(key));
}

export function run() {
  const result = createResult('compose-installer');
  const compose = readText('docker-compose.yml');
  const installer = readText('install.sh');

  const serviceMatches = parseComposeServices(compose);
  const serviceSet = new Set(serviceMatches);
  result.info.push(`compose services: ${serviceMatches.join(', ')}`);

  if (installer.includes('compose_service_exists "minio"') && !serviceSet.has('minio')) {
    result.info.push('installer checks for MinIO dynamically and does not require it.');
  }

  if (!installer.includes('compose_service_exists')) {
    result.errors.push('installer does not contain dynamic compose service detection.');
  }

  const writesLocalObjectStorageDriver =
    installer.includes('OBJECT_STORAGE_DRIVER=local')
    || /env_set_(?:if_missing|explicit)\("OBJECT_STORAGE_DRIVER"\s*,\s*"local"\)/.test(installer)
    || /env_set_(?:if_missing|explicit)\s+"OBJECT_STORAGE_DRIVER"\s+"local"/.test(installer);

  if (!writesLocalObjectStorageDriver) {
    result.warnings.push('installer does not write an explicit local object storage driver to .env.');
  }

  const appEnv = parseServiceEnvironment(compose, 'app');
  const dbEnv = parseServiceEnvironment(compose, 'db');

  const criticalDbEnv = new Set([
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'APP_DB_USER',
    'APP_DB_PASSWORD',
  ]);

  const criticalAppDbEnv = new Set([
    'DATABASE_URL',
    'MIGRATION_DATABASE_URL',
    // lib/env-security.ts independently validates APP_DB_USER and
    // APP_DB_PASSWORD in production, so the app container must receive
    // them in addition to DATABASE_URL.
    'APP_DB_USER',
    'APP_DB_PASSWORD',
  ]);

  const missingDbComposeKeys = Array.from(criticalDbEnv).filter((key) => !dbEnv.has(key));
  if (missingDbComposeKeys.length > 0) {
    result.errors.push(`docker-compose.yml db service is missing critical DB env keys: ${missingDbComposeKeys.join(', ')}`);
  }

  const missingAppComposeKeys = Array.from(criticalAppDbEnv).filter((key) => !appEnv.has(key));
  if (missingAppComposeKeys.length > 0) {
    result.errors.push(`docker-compose.yml app service is missing critical database URL env keys: ${missingAppComposeKeys.join(', ')}`);
  }

  const installerCriticalDbEnv = new Set([...criticalDbEnv, ...criticalAppDbEnv]);
  const missingInstallerKeys = findMissingInstallerMentions(installer, installerCriticalDbEnv);
  if (missingInstallerKeys.length > 0) {
    result.errors.push(`install.sh does not provision or validate critical DB env keys: ${missingInstallerKeys.join(', ')}`);
  }

  return result;
}
