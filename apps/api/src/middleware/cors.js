// CORS middleware — configurable cross-origin resource sharing.
//
// Extracted from runner.js for modularity. Supports:
//   - Comma-separated allowed origins from config
//   - Wildcard '*' for development
//   - Regex-based origin matching for future subdomain support
//   - Preflight caching (Access-Control-Max-Age)

import { config } from '../config/config.js';

/**
 * Create a CORS middleware instance.
 * @param {object} [options]
 * @param {string} [options.origins]       Comma-separated origins or '*'
 * @param {string[]} [options.methods]     Allowed HTTP methods
 * @param {string[]} [options.headers]     Allowed request headers
 * @param {number} [options.maxAge]        Preflight cache duration in seconds
 * @param {boolean} [options.credentials]  Allow credentials (cookies, auth headers)
 */
export function createCors(options = {}) {
  const {
    origins = config.corsOrigins || '*',
    methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    headers = ['Content-Type', 'x-automation-secret', 'x-client-id', 'Authorization'],
    maxAge = 86400,
    credentials = false,
  } = options;

  // Parse origins into a list; support regex patterns (strings starting with '/')
  const originList = origins.split(',').map((o) => o.trim()).filter(Boolean);

  return function corsMiddleware(req, res, next) {
    const requestOrigin = req.headers.origin;

    if (requestOrigin && isAllowedOrigin(requestOrigin, originList)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    } else if (originList.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
    res.setHeader('Access-Control-Max-Age', String(maxAge));

    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Respond to preflight immediately
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  };
}

/**
 * Check if a request origin is in the allowed list.
 * Supports exact match and regex patterns (prefix with '/').
 */
function isAllowedOrigin(origin, allowedList) {
  for (const allowed of allowedList) {
    if (allowed === '*') return true;
    if (allowed === origin) return true;

    // Regex pattern: '/\.jarvisprime\.me$/' matches all subdomains
    if (allowed.startsWith('/') && allowed.endsWith('/')) {
      try {
        const re = new RegExp(allowed.slice(1, -1));
        if (re.test(origin)) return true;
      } catch {
        // Invalid regex — skip
      }
    }
  }
  return false;
}

// Default instance for backward compatibility
export default createCors();
