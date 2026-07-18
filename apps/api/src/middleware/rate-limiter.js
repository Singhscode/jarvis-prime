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
 * @param {boolean} [options.skipSuccessfulRequests=false]  Count only client failures
 */
export function createRateLimiter(options = {}) {
  const {
    windowMs = 60_000,
    max = 100,
    keyFn = defaultKeyFn,
    message = 'Too many requests. Try again later.',
    skipFailedRequests = false,
    skipSuccessfulRequests = false,
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

  function setHeaders(res, entry) {
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(max - entry.count, 0)));
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());
  }

  function release(key, entry) {
    const current = store.get(key);
    if (current !== entry || current.count === 0) return;
    current.count--;
    if (current.count === 0) store.delete(key);
  }

  function shouldRelease(statusCode) {
    if (skipSuccessfulRequests && (statusCode < 400 || statusCode >= 500)) return true;
    return skipFailedRequests && statusCode >= 400;
  }

  function rateLimiterMiddleware(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      setHeaders(res, entry);
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message },
      });
    }

    entry.count++;
    setHeaders(res, entry);
    if ((skipSuccessfulRequests || skipFailedRequests) && typeof res.once === 'function') {
      res.once('finish', () => {
        if (shouldRelease(res.statusCode)) release(key, entry);
      });
    }

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

/**
 * Client-scoped key function: uses x-client-id header if present, falls back to IP.
 */
export function clientKeyFn(req) {
  return req.headers['x-client-id'] || defaultKeyFn(req);
}

// Default instance for backward compatibility (100 req/min per IP)
export default createRateLimiter();
