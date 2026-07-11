// Error handling middleware — structured error responses.
//
// Extracted from runner.js. Improvements:
//   - AppError class with statusCode, code, and isOperational properties
//   - Structured error response format: { error: { code, message, requestId } }
//   - Separate not-found handler
//   - Stack traces only in development mode

import { log } from 'jarvis-logger';
import { config } from '../config.js';

/**
 * Structured application error.
 * Use this to throw errors with specific HTTP status codes and error codes.
 *
 * @example
 *   throw new AppError('Prospect not found', 404, 'PROSPECT_NOT_FOUND');
 */
export class AppError extends Error {
  /**
   * @param {string} message       Human-readable error message
   * @param {number} statusCode    HTTP status code (default: 500)
   * @param {string} code          Machine-readable error code (default: 'INTERNAL_ERROR')
   * @param {boolean} isOperational  Whether this is an expected error (default: true)
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
  }
}

/**
 * 404 Not Found handler — mount after all routes.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
      hint: 'GET /api for available endpoints',
      requestId: req.id || undefined,
    },
  });
}

/**
 * Global error handler — mount as the last middleware.
 * Express requires the (err, req, res, next) signature to recognize it as an error handler.
 */
export function errorHandler(err, req, res, _next) {
  // Determine status and code
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';

  // Log the error
  if (statusCode >= 500) {
    log.error(`[${code}] ${err.message}${req.id ? ` [req:${req.id.slice(0, 8)}]` : ''}`);
    if (config.env === 'development' && err.stack) {
      log.error(err.stack);
    }
  } else {
    log.warn(`[${code}] ${err.message}${req.id ? ` [req:${req.id.slice(0, 8)}]` : ''}`);
  }

  // Build response
  const response = {
    error: {
      code,
      message: err.isOperational !== false ? err.message : 'Internal server error',
      requestId: req.id || undefined,
    },
  };

  // Include stack trace in development only
  if (config.env === 'development' && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}
