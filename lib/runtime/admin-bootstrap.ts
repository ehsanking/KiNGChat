import { initializeAdmin } from '../auth-utils';
import { logger } from '../logger';

export async function runAdminBootstrapOrExit() {
  const adminBootstrap = await initializeAdmin();
  const strictAdminBootstrap = (process.env.ADMIN_BOOTSTRAP_STRICT ?? 'false').toLowerCase() === 'true';

  if (!adminBootstrap.ok || (strictAdminBootstrap && adminBootstrap.action === 'skipped')) {
    logger.error('Admin bootstrap failed strict startup checks.', {
      strictAdminBootstrap,
      action: adminBootstrap.action,
      reason: adminBootstrap.reason ?? null,
    });
    process.exit(1);
  }

  logger.info('Admin bootstrap finished.', {
    action: adminBootstrap.action,
    strictAdminBootstrap,
  });
}
