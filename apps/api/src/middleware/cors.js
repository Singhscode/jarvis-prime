// CORS middleware — configurable cross-origin resource sharing.
// Credentialed requests require an explicit, exact allowed origin.

import { config } from '../config/config.js';

export function createCors(options = {}) {
  const {
    origins = config.corsOrigins,
    methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    headers = ['Content-Type', 'x-automation-secret', 'x-client-id', 'Authorization'],
    maxAge = 86400,
    credentials = false,
  } = options;
  const originList = String(origins || '').split(',').map((origin) => origin.trim()).filter(Boolean);

  if (credentials && originList.includes('*')) {
    throw new Error('Credentialed CORS requires explicit allowed origins.');
  }

  return function corsMiddleware(req, res, next) {
    const requestOrigin = req.headers.origin;
    const allowed = Boolean(requestOrigin) && isAllowedOrigin(requestOrigin, originList, !credentials);

    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.vary('Origin');
      if (credentials) res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (!credentials && originList.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
    res.setHeader('Access-Control-Max-Age', String(maxAge));

    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  };
}

function isAllowedOrigin(origin, allowedList, allowPatterns) {
  for (const allowed of allowedList) {
    if (allowed === origin || allowed === '*') return true;
    if (allowPatterns && allowed.startsWith('/') && allowed.endsWith('/')) {
      try {
        if (new RegExp(allowed.slice(1, -1)).test(origin)) return true;
      } catch {
        // Invalid patterns never grant access.
      }
    }
  }
  return false;
}

export default createCors();
