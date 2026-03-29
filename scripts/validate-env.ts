import { loadApplicationEnvironment } from '../lib/env-loader';
import { validateProductionEnvironment } from '../lib/env-security';

const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : (process.env.APP_ENV || process.env.NODE_ENV || 'development');

if (mode === 'production') {
  process.env.APP_ENV = 'production';
}

loadApplicationEnvironment({ forceMode: mode === 'production' ? 'production' : 'development' });

try {
  const result = validateProductionEnvironment();
  if (result.isProduction) {
    console.log('✅ Production environment validation passed.');
  } else {
    console.log('✅ Development environment loaded. Production-only checks were skipped.');
  }
} catch (error) {
  console.error(`❌ Environment validation failed: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Action: set missing/weak variables in your env file, then rerun npm run validate:env -- --mode=production');
  process.exit(1);
}
