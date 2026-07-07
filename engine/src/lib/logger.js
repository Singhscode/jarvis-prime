// Structured logger with timestamps, log levels, JSON mode, and context binding.
//
// Upgraded from the original tiny logger. Features:
//   - Configurable log levels: LOG_LEVEL=debug|info|warn|error
//   - JSON output mode: LOG_FORMAT=json (for production log aggregation)
//   - Context binding: log.child({ requestId, clientId }) for scoped logging
//   - Performance timing: log.time(label) / log.timeEnd(label)
//   - Keeps emoji console format as default for dev readability

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;
const isJson = process.env.LOG_FORMAT === 'json';

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const timers = new Map();

function shouldLog(level) {
  return (LOG_LEVELS[level] ?? 1) >= currentLevel;
}

function formatJson(level, msg, context = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message: msg,
    ...context,
  });
}

function createLogger(context = {}) {
  const ctx = context;

  const contextSuffix = () => {
    const parts = [];
    if (ctx.requestId) parts.push(`[req:${ctx.requestId.slice(0, 8)}]`);
    if (ctx.clientId) parts.push(`[client:${ctx.clientId.slice(0, 12)}]`);
    return parts.length > 0 ? ' ' + parts.join(' ') : '';
  };

  const logger = {
    debug: (msg, ...rest) => {
      if (!shouldLog('debug')) return;
      if (isJson) return console.log(formatJson('debug', msg, ctx));
      console.log(`[${ts()}] 🐛 ${msg}${contextSuffix()}`, ...rest);
    },
    info: (msg, ...rest) => {
      if (!shouldLog('info')) return;
      if (isJson) return console.log(formatJson('info', msg, ctx));
      console.log(`[${ts()}] ℹ️  ${msg}${contextSuffix()}`, ...rest);
    },
    ok: (msg, ...rest) => {
      if (!shouldLog('info')) return;
      if (isJson) return console.log(formatJson('info', msg, { ...ctx, status: 'ok' }));
      console.log(`[${ts()}] ✅ ${msg}${contextSuffix()}`, ...rest);
    },
    warn: (msg, ...rest) => {
      if (!shouldLog('warn')) return;
      if (isJson) return console.warn(formatJson('warn', msg, ctx));
      console.warn(`[${ts()}] ⚠️  ${msg}${contextSuffix()}`, ...rest);
    },
    error: (msg, ...rest) => {
      if (!shouldLog('error')) return;
      if (isJson) return console.error(formatJson('error', msg, ctx));
      console.error(`[${ts()}] ❌ ${msg}${contextSuffix()}`, ...rest);
    },
    step: (msg, ...rest) => {
      if (!shouldLog('info')) return;
      if (isJson) return console.log(formatJson('info', msg, { ...ctx, type: 'step' }));
      console.log(`[${ts()}] ▶️  ${msg}${contextSuffix()}`, ...rest);
    },
    dry: (msg, ...rest) => {
      if (!shouldLog('info')) return;
      if (isJson) return console.log(formatJson('info', msg, { ...ctx, dryRun: true }));
      console.log(`[${ts()}] 🧪 [DRY-RUN] ${msg}${contextSuffix()}`, ...rest);
    },

    /**
     * Create a child logger with additional context.
     * @param {object} childContext  Additional context (requestId, clientId, etc.)
     * @returns {object} A new logger instance with merged context
     *
     * @example
     *   const reqLog = log.child({ requestId: req.id, clientId: req.clientId });
     *   reqLog.info('Processing request'); // includes requestId in output
     */
    child(childContext) {
      return createLogger({ ...ctx, ...childContext });
    },

    /**
     * Start a performance timer.
     * @param {string} label  Timer label
     */
    time(label) {
      timers.set(label, Date.now());
    },

    /**
     * End a performance timer and log the duration.
     * @param {string} label  Timer label (must match a previous time() call)
     */
    timeEnd(label) {
      const start = timers.get(label);
      if (!start) {
        logger.warn(`Timer "${label}" does not exist`);
        return;
      }
      const duration = Date.now() - start;
      timers.delete(label);
      logger.info(`⏱ ${label}: ${duration}ms`);
    },
  };

  return logger;
}

export const log = createLogger();
