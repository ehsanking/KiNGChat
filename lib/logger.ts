import { getCurrentRequestId } from '@/lib/request-context';
import { buildTransportTargets, pruneOldLogFiles, resolveLogFormat } from '@/lib/logger/transports';

type LogContext = Record<string, unknown>;
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type PinoLikeLogger = {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  child: (bindings: Record<string, unknown>) => PinoLikeLogger;
};

type LoggerApi = {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  child: (bindings?: LogContext) => LoggerApi;
};

const resolveLogLevel = () => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel === 'trace' || envLevel === 'debug' || envLevel === 'info' || envLevel === 'warn' || envLevel === 'error' || envLevel === 'fatal') {
    return envLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

const withRequestId = (context?: LogContext): LogContext | undefined => {
  const requestId = typeof context?.requestId === 'string' ? context.requestId : getCurrentRequestId();
  if (!requestId) return context;
  return { requestId, ...context };
};

const createBaseLogger = () => {
  type PinoFactory = (options: Record<string, unknown>) => PinoLikeLogger;
  let pinoFactory: PinoFactory | null = null;
  try {
    const req = globalThis.Function('return require')() as (id: string) => unknown;
    const loaded = req('pino') as { default?: PinoFactory } | PinoFactory;
    pinoFactory = (typeof loaded === 'function' ? loaded : loaded?.default) ?? null;
  } catch {
    pinoFactory = null;
  }

  if (!pinoFactory) {
    const fallback = (level: LogLevel, message: string, context?: LogContext) => {
      const output = context ? [message, context] : [message];
      if (level === 'error') console.error(...output);
      else if (level === 'warn') console.warn(...output);
      else if (level === 'info') console.info(...output);
      else console.debug(...output);
    };
    const fallbackLogger: PinoLikeLogger = {
      debug: (obj, msg) => fallback('debug', msg ?? String(obj), msg ? (obj as LogContext) : undefined),
      info: (obj, msg) => fallback('info', msg ?? String(obj), msg ? (obj as LogContext) : undefined),
      warn: (obj, msg) => fallback('warn', msg ?? String(obj), msg ? (obj as LogContext) : undefined),
      error: (obj, msg) => fallback('error', msg ?? String(obj), msg ? (obj as LogContext) : undefined),
      child: () => fallbackLogger,
    };
    return fallbackLogger;
  }

  const transportTargets = buildTransportTargets();
  void pruneOldLogFiles();
  const format = resolveLogFormat();

  return pinoFactory({
    level: resolveLogLevel(),
    ...(process.env.NODE_ENV === 'production' || format === 'json' ? { formatters: { level: (label: string) => ({ level: label }) } } : {}),
    ...(transportTargets ? { transport: transportTargets.length === 1 ? transportTargets[0] : { targets: transportTargets } } : {}),
  });
};

const bindLogger = (base: PinoLikeLogger): LoggerApi => {
  const log = (level: LogLevel, message: string, context?: LogContext) => {
    const payload = withRequestId(context);
    if (payload) return base[level](payload, message);
    return base[level](message);
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
    child: (bindings = {}) => bindLogger(base.child(withRequestId(bindings) ?? {})),
  };
};

export const logger = bindLogger(createBaseLogger());
export const authLogger = logger.child({ module: 'auth' });
export const messagingLogger = logger.child({ module: 'messaging' });
export const e2eeLogger = logger.child({ module: 'e2ee' });
export const adminLogger = logger.child({ module: 'admin' });
export const socketLogger = logger.child({ module: 'socket' });
