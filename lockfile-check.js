const fs = require('node:fs');
if (!fs.existsSync('package-lock.json')) {
  console.error('[hardening] package-lock.json is required for deterministic production builds.');
  process.exit(1);
}
console.log('[hardening] package-lock.json found.');
