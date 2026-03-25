import { printResult } from './diagnostics/_shared.mjs';
import { run as runLockfile } from './diagnostics/check-lockfile-sync.mjs';
import { run as runComposeInstaller } from './diagnostics/check-compose-installer.mjs';
import { run as runModularity } from './diagnostics/check-modularity.mjs';

const results = [runLockfile(), runComposeInstaller(), runModularity()];
for (const result of results) printResult(result);

const errorCount = results.reduce((sum, result) => sum + result.errors.length, 0);
const warningCount = results.reduce((sum, result) => sum + result.warnings.length, 0);
console.log(`
KiNGChat doctor summary: ${errorCount} error(s), ${warningCount} warning(s)`);
process.exit(errorCount > 0 ? 1 : 0);
