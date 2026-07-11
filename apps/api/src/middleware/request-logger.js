// Request logger middleware — assigns request IDs and logs HTTP traffic.
//
// Extracted from runner.js. Improvements:
//   - Assigns a unique requestId (UUID-like) to every request
//   - Attaches requestId to response header X-Request-Id for client debugging
//   - Logs method, path, status code, and duration
//   - Uses the upgraded logger (supports JSON and context binding)

import { log } from '../utils/logger.js';
import crypto from 'node:crypto';

/**
 * Create a request logger middleware.
 * @param {object} [options]
 * @param {boolean} [options.logBody=false]     Log request body (redacted in production)
 * @param {string[]} [options.skipPaths=[]]     Paths to skip logging (e.g., /health)
 */
export function createRequestLogger(options = {}) {
  const { logBody = false, skipPaths = ['/health', '/favicon.ico'] } = options;

  return function requestLogger(req, res, next) {
    // Generate and attach request ID
    const requestId = generateRequestId();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);

    // Skip logging for certain paths
    if (skipPaths.includes(req.path)) {
      return next();
    }

    const start = Date.now();

    // Log on response finish
    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

      log[level](
        `${req.method} ${req.path} ${res.statusCode} (${duration}ms)` +
          (req.clientId ? ` [client:${req.clientId}]` : '') +
          ` [req:${requestId.slice(0, 8)}]`
      );
    });

    next();
  };
}

/**
 * Generate a short, unique request ID.
 * Uses crypto.randomUUID if available, otherwise a hex string.
 */
function generateRequestId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

// Default instance
export default createRequestLogger();
