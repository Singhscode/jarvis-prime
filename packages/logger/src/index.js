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

  // Shared implementation for every log level below. Each level only differs
  // in: the level used for shouldLog()/JSON output, which console fn to use,
  // the emoji prefix, and any extra JSON context fields.
  function emit(level, consoleFn, prefix, jsonExtra, msg, rest) {
    if (!shouldLog(level)) return;
    if (isJson) return consoleFn(formatJson(level, msg, { ...ctx, ...jsonExtra }));
    consoleFn(`[${ts()}] ${prefix}${msg}${contextSuffix()}`, ...rest);
  }

  const logger = {
    debug: (msg, ...rest) => emit('debug', console.log, '🐛 ', undefined, msg, rest),
    info: (msg, ...rest) => emit('info', console.log, 'ℹ️  ', undefined, msg, rest),
    ok: (msg, ...rest) => emit('info', console.log, '✅ ', { status: 'ok' }, msg, rest),
    warn: (msg, ...rest) => emit('warn', console.warn, '⚠️  ', undefined, msg, rest),
    error: (msg, ...rest) => emit('error', console.error, '❌ ', undefined, msg, rest),
    step: (msg, ...rest) => emit('info', console.log, '▶️  ', { type: 'step' }, msg, rest),
    dry: (msg, ...rest) => emit('info', console.log, '🧪 [DRY-RUN] ', { dryRun: true }, msg, rest),

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
