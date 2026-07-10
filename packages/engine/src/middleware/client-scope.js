// Client scope middleware — multi-tenancy readiness.
//
// Extracts the client ID from the request and attaches it for downstream use.
// All DB queries can then be automatically scoped to the authenticated client.
//
// Header: x-client-id
// If present, req.clientId is set for route handlers and services.

import { log } from '../lib/logger.js';

/**
 * Create a client-scope middleware.
 * @param {object} [options]
 * @param {boolean} [options.required=false]  If true, return 400 when x-client-id is missing
 */
export function createClientScope(options = {}) {
  const { required = false } = options;

  return function clientScope(req, res, next) {
    const clientId = req.headers['x-client-id'] || req.query?.clientId;

    if (clientId) {
      req.clientId = clientId;
    } else if (required) {
      return res.status(400).json({
        error: {
          code: 'CLIENT_ID_REQUIRED',
          message: 'x-client-id header or clientId query parameter is required',
        },
      });
    }

    next();
  };
}

export default createClientScope();
