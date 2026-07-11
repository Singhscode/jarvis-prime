// Authentication Middleware
// Validates JWT tokens, checks authorization, enforces security policies
// Applied to protected routes

import { extractBearerToken } from '../auth/jwt-service.js';
import { verifyToken } from '../auth/auth-service.js';
import { statusCodes, authMessages } from '../auth/constants.js';
import { log } from 'jarvis-logger';

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

/**
 * MFA verification middleware
 * Requires user to have MFA enabled and verified for sensitive operations
 * 
 * @returns {Function} Middleware
 */
export function createMfaMiddleware() {
  return function requireMfa(req, res, next) {
    if (!req.user) {
      return res.status(statusCodes.UNAUTHORIZED).json({
        error: {
          code: 'UNAUTHORIZED',
          message: authMessages.UNAUTHORIZED,
        },
      });
    }

    if (!req.user.mfa_enabled) {
      return res.status(statusCodes.FORBIDDEN).json({
        error: {
          code: 'MFA_REQUIRED',
          message: 'Multi-factor authentication is required for this action.',
        },
      });
    }

    // TODO: Verify MFA code from request headers/body
    // Check if MFA code is present and valid
    const mfaCode = req.headers['x-mfa-code'];
    if (!mfaCode) {
      return res.status(statusCodes.FORBIDDEN).json({
        error: {
          code: 'MFA_CODE_REQUIRED',
          message: 'MFA verification code is required.',
        },
      });
    }

    next();
  };
}

/**
 * Device binding middleware
 * Verifies request comes from expected device
 * Prevents session theft/hijacking
 * 
 * @returns {Function} Middleware
 */
export function createDeviceBindingMiddleware() {
  return function verifyDevice(req, res, next) {
    if (!req.user) {
      return next();
    }

    // Extract device fingerprint from request
    const deviceId = req.headers['x-device-id'];
    
    // If device ID provided, verify it matches session
    if (deviceId && req.user.device_id) {
      if (deviceId !== req.user.device_id) {
        log.warn('Device mismatch detected', {
          userId: req.user.sub,
          providedDevice: deviceId,
          sessionDevice: req.user.device_id,
          ipAddress: req.ip,
        });

        return res.status(statusCodes.FORBIDDEN).json({
          error: {
            code: 'DEVICE_MISMATCH',
            message: 'Request originated from unexpected device.',
          },
        });
      }
    }

    next();
  };
}

/**
 * Security headers middleware
 * Applies OWASP recommended security headers
 * 
 * @returns {Function} Middleware
 */
export function createSecurityHeadersMiddleware() {
  return function addSecurityHeaders(req, res, next) {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Content Security Policy (strict)
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    );

    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()'
    );

    // Strict Transport Security (HTTPS only)
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}

/**
 * Request sanitization middleware
 * Prevents injection attacks
 * 
 * @returns {Function} Middleware
 */
export function createSanitizationMiddleware() {
  return function sanitizeRequest(req, res, next) {
    // Sanitize request body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    next();
  };
}

/**
 * Recursively sanitizes an object to prevent injection attacks
 * 
 * @param {*} obj - Object to sanitize
 * @returns {*} Sanitized object
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Remove null bytes
    let sanitized = obj.replace(/\0/g, '');
    // Remove control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    return sanitized;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Error handling middleware for auth errors
 * Consistent error responses
 * 
 * @returns {Function} Middleware
 */
export function createAuthErrorHandler() {
  return function handleAuthError(err, req, res, next) {
    if (err.code === 'INVALID_TOKEN') {
      return res.status(statusCodes.UNAUTHORIZED).json({
        error: {
          code: 'INVALID_TOKEN',
          message: authMessages.SESSION_EXPIRED,
        },
      });
    }

    if (err.code === 'TOKEN_EXPIRED') {
      return res.status(statusCodes.UNAUTHORIZED).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: authMessages.SESSION_EXPIRED,
        },
      });
    }

    if (err.code === 'INSUFFICIENT_PERMISSIONS') {
      return res.status(statusCodes.FORBIDDEN).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: authMessages.FORBIDDEN,
        },
      });
    }

    // Pass other errors to next handler
    next(err);
  };
}
