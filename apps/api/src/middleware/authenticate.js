// Authentication middleware — verifies API access.
//
// Extracted from runner.js. Improvements:
//   - Supports both x-automation-secret header AND Bearer token auth
//   - Extracts x-client-id from header for per-client scoping
//   - Returns structured error responses with proper codes
//   - Configurable via options

import { config } from '../config/config.js';

/**
 * Create an authentication middleware.
 * @param {object} [options]
 * @param {string} [options.secret]           Override the automation secret
 * @param {boolean} [options.extractClientId]  Extract x-client-id from headers
 */
export function createAuth(options = {}) {
  const { secret = config.automationSecret, extractClientId = true } = options;

  return function authenticate(req, res, next) {
    // Check x-automation-secret header (original method)
    const headerSecret = req.headers['x-automation-secret'];

    // Check Authorization: Bearer <token> header
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Either authentication method works
    const isAuthenticated = (headerSecret && headerSecret === secret) || (bearerToken && bearerToken === secret);

    if (!isAuthenticated) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing authentication. Provide x-automation-secret header or Bearer token.',
        },
      });
    }

    // Extract client ID for multi-tenancy scoping
    if (extractClientId && req.headers['x-client-id']) {
      req.clientId = req.headers['x-client-id'];
    }

    next();
  };
}

// Default instance for backward compatibility
export default createAuth();
