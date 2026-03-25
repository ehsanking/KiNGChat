import { createResult, readJson } from "./_shared.mjs";

export function run() {
  const result = createResult('lockfile-sync');
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  const root = lock.packages?.[''] ?? {};

  for (const section of ['dependencies', 'devDependencies']) {
    const pkgSection = pkg[section] ?? {};
    const lockSection = root[section] ?? {};

    for (const [name, spec] of Object.entries(pkgSection)) {
      if (!(name in lockSection)) {
        result.errors.push(`${section}:${name} is missing from package-lock root metadata.`);
      } else if (lockSection[name] !== spec) {
        result.warnings.push(`${section}:${name} differs (package.json=${spec}, package-lock=${lockSection[name]}).`);
      }
    }

    for (const name of Object.keys(lockSection)) {
      if (!(name in pkgSection)) {
        result.warnings.push(`${section}:${name} exists in package-lock root metadata but not in package.json.`);
      }
    }
  }

  if (pkg.version !== lock.version) {
    result.warnings.push(`package version (${pkg.version}) and lockfile version (${lock.version}) differ.`);
  }

  return result;
}
