type PinoTransportTarget = { target: string; options?: Record<string, unknown> };

const parseDestinations = () => (process.env.LOG_DESTINATIONS ?? 'stdout').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);

export const resolveLogFormat = () => {
  const raw = (process.env.LOG_FORMAT ?? '').toLowerCase();
  if (raw === 'pretty' || raw === 'json') return raw;
  return process.env.NODE_ENV === 'production' ? 'json' : 'pretty';
};

export const buildTransportTargets = (): PinoTransportTarget[] | undefined => {
  const destinations = parseDestinations();
  const format = resolveLogFormat();
  const targets: PinoTransportTarget[] = [];

  if (destinations.includes('stdout')) {
    if (format === 'pretty' && process.env.NODE_ENV !== 'production') {
      targets.push({ target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } });
    }
  }

  if (destinations.includes('file')) {
    targets.push({
      target: 'pino/file',
      options: { destination: `./logs/app-${new Date().toISOString().slice(0, 10)}.log`, mkdir: true, append: true },
    });
  }

  if (destinations.includes('loki')) {
    targets.push({
      target: 'pino-loki',
      options: {
        host: process.env.LOKI_URL,
        labels: { app: 'elahe-messenger', env: process.env.NODE_ENV ?? 'development' },
        interval: 5,
      },
    });
  }

  return targets.length > 0 ? targets : undefined;
};

export const pruneOldLogFiles = async () => {
  const retentionDays = Number(process.env.LOG_FILE_RETENTION_DAYS ?? 30);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;

  const { readdir, stat, unlink } = await import('node:fs/promises');
  const path = await import('node:path');
  const logsDir = path.join(process.cwd(), 'logs');
  const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const files = await readdir(logsDir).catch(() => [] as string[]);
  for (const file of files) {
    if (!file.startsWith('app-') || !file.endsWith('.log')) continue;
    const filePath = path.join(logsDir, file);
    const meta = await stat(filePath).catch(() => null);
    if (meta && meta.mtimeMs < threshold) await unlink(filePath).catch(() => {});
  }
};
