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

  if (!installer.includes('OBJECT_STORAGE_DRIVER=local')) {
    result.warnings.push('installer does not write an explicit local object storage driver to .env.');
  }

  return result;
}
