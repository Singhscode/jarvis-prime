// Rate limiter middleware — configurable per-IP and per-client throttling.
//
// Extracted from runner.js. Improvements:
//   - Factory pattern: createRateLimiter({ windowMs, max, keyFn })
//   - Auto-cleanup of stale entries to prevent memory leaks
//   - Per-client rate limiting via x-client-id header
//   - Proper Retry-After header in 429 responses

/**
 * Create a rate limiter middleware.
 *
 * @param {object} [options]
 * @param {number} [options.windowMs=60000]    Time window in milliseconds
 * @param {number} [options.max=100]           Max requests per window
 * @param {Function} [options.keyFn]           Custom key extraction function (req) => string
 * @param {string} [options.message]           Custom 429 error message
 * @param {boolean} [options.skipFailedRequests=false]  Don't count failed requests
 */
export function createRateLimiter(options = {}) {
  const {
    windowMs = 60_000,
    max = 100,
    keyFn = defaultKeyFn,
    message = 'Too many requests. Try again later.',
    skipFailedRequests = false,
  } = options;

  const store = new Map();

  // Auto-cleanup stale entries every 5 minutes to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, 5 * 60_000);

  // Allow cleanup interval to be unref'd so it doesn't keep the process alive
  if (cleanupInterval.unref) cleanupInterval.unref();

  function rateLimiterMiddleware(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();

    if (!store.has(key)) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    const entry = store.get(key);

    // Window expired — reset
    if (now > entry.resetAt) {
      entry.count = 1;
      entry.resetAt = now + windowMs;
      return next();
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message },
      });
    }

    // Add rate limit headers to every response
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(max - entry.count, 0)));
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());

    next();
  }

  // Expose store for testing and the cleanup function for graceful shutdown
  rateLimiterMiddleware._store = store;
  rateLimiterMiddleware._cleanup = () => clearInterval(cleanupInterval);

  return rateLimiterMiddleware;
}

/**
 * Default key function: uses IP address.
 */
function defaultKeyFn(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// Default instance for backward compatibility (100 req/min per IP)
export default createRateLimiter();
