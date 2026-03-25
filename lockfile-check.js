const fs = require('node:fs');

if (!fs.existsSync('package-lock.json')) {
  console.error('[hardening] package-lock.json is required for deterministic production builds.');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const root = (lock.packages && lock.packages['']) || {};

let problems = 0;
for (const section of ['dependencies', 'devDependencies']) {
  const pkgSection = pkg[section] || {};
  const lockSection = root[section] || {};

  for (const [name, spec] of Object.entries(pkgSection)) {
    if (!(name in lockSection)) {
      console.error(`[hardening] package-lock root metadata is missing ${section}:${name}`);
      problems += 1;
      continue;
    }
    if (lockSection[name] !== spec) {
      console.error(`[hardening] ${section}:${name} mismatch (package.json=${spec}, package-lock=${lockSection[name]})`);
      problems += 1;
    }
  }
}

if (problems > 0) {
  console.error('[hardening] package-lock.json is out of sync with package.json. Regenerate the lockfile before building.');
  process.exit(1);
}

console.log('[hardening] package-lock.json metadata matches package.json.');
