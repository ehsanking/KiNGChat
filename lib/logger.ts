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

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    return pinoFactory({
      level: resolveLogLevel(),
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pinoFactory({
    level: resolveLogLevel(),
  });
};

const withRequestIdFirst = (context?: LogContext): LogContext | undefined => {
  if (!context) return undefined;
  const requestId = typeof context.requestId === 'string' ? context.requestId : undefined;
  if (!requestId) return context;

  const rest = { ...context };
  delete rest.requestId;
  return {
    requestId,
    ...rest,
  };
};

const bindLogger = (base: PinoLikeLogger): LoggerApi => {
  const log = (level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: LogContext) => {
    const payload = withRequestIdFirst(context);
    if (payload) {
      base[level](payload, message);
      return;
    }
    base[level](message);
  };

  return {
    debug: (message, context) => log('debug', message, context),
    info: (message, context) => log('info', message, context),
    warn: (message, context) => log('warn', message, context),
    error: (message, context) => log('error', message, context),
    child: (bindings = {}) => bindLogger(base.child(withRequestIdFirst(bindings) ?? {})),
  };
};

export const logger = bindLogger(createBaseLogger());
