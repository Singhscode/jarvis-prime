// Authentication Middleware
// Validates JWT tokens, checks authorization, enforces security policies
// Applied to protected routes

import { extractBearerToken } from '../modules/auth/jwt-service.js';
import { verifyToken } from '../modules/auth/auth-service.js';
import { statusCodes, authMessages } from '../modules/auth/constants.js';
import { log } from '../utils/logger.js';

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 * Populates req.user with decoded claims
 * 
 * @param {object} options - Configuration
 * @returns {Function} Middleware function
 */
export function createAuthMiddleware(options = {}) {
  const { required = true, skipOn = [] } = options;

  return function authenticateUser(req, res, next) {
    // Allow skipping for certain paths
    if (skipOn.includes(req.path)) {
      return next();
    }

    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);

    if (!token) {
      if (required) {
        log.warn('Missing authorization token', { path: req.path });
        return res.status(statusCodes.UNAUTHORIZED).json({
          error: {
            code: 'MISSING_TOKEN',
            message: authMessages.UNAUTHORIZED,
          },
        });
      }
      // Optional auth: continue without user
      req.user = null;
      return next();
    }

    // Verify token
    const claims = verifyToken(token);

    if (!claims) {
      log.warn('Invalid token', { path: req.path });
      return res.status(statusCodes.UNAUTHORIZED).json({
        error: {
          code: 'INVALID_TOKEN',
          message: authMessages.SESSION_EXPIRED,
        },
      });
    }

    // Attach claims to request
    req.user = claims;
    req.token = token;

    next();
  };
}

/**
 * Authorization middleware
 * Checks if user has required role
 * 
 * @param {string|array} requiredRoles - Role(s) needed
 * @returns {Function} Middleware
 */
export function createAuthorizationMiddleware(requiredRoles) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return function authorizeUser(req, res, next) {
    if (!req.user) {
      return res.status(statusCodes.UNAUTHORIZED).json({
        error: {
          code: 'UNAUTHORIZED',
          message: authMessages.UNAUTHORIZED,
        },
      });
    }

    if (!roles.includes(req.user.role)) {
      log.warn('Authorization failed', {
        userId: req.user.sub,
        path: req.path,
        requiredRole: roles,
        userRole: req.user.role,
      });

      return res.status(statusCodes.FORBIDDEN).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: authMessages.FORBIDDEN,
        },
      });
    }

    next();
  };
}
