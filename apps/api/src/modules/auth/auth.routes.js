// Authentication Routes
// Public endpoints for registration, login, password reset, etc.
// Follows REST conventions with proper HTTP status codes

import { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  initiatePasswordReset,
  resetPassword,
  rotateRefreshToken,
} from './auth-service.js';
import { createAuthMiddleware } from '../../middleware/auth-middleware.js';
import { createRateLimiter } from '../../middleware/rate-limiter.js';
import { statusCodes, auth } from './constants.js';
import { log } from '../../utils/logger.js';

export const router = Router();

// Per-endpoint rate limiters (values per requirements.md R1.6, R2.7, R4.3).
// Reuses the existing createRateLimiter() factory — no new middleware.
const registerLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 3, message: 'Too many registration attempts. Try again later.' });
const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5, message: 'Too many login attempts. Try again later.' });
const resetLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 3, message: 'Too many password reset attempts. Try again later.' });
const refreshLimiter = createRateLimiter({ windowMs: 60_000, max: 10, message: 'Too many refresh attempts. Try again later.' });

/**
 * POST /api/auth/register
 * Register a new user account
 * 
 * Request:
 *   {
 *     email: string,
 *     password: string,
 *     full_name?: string,
 *     username?: string
 *   }
 * 
 * Response:
 *   200: { success: true, user: { id, email, full_name, ... } }
 *   400: { error: { code, message } }
 *   409: { error: { code: 'EMAIL_EXISTS' } }
 *   429: { error: { code: 'RATE_LIMITED' } }
 */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, full_name, username } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Basic input validation
    if (!email || !password) {
      return res.status(statusCodes.BAD_REQUEST).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Email and password are required.',
        },
      });
    }

    // TODO: Rate limit check (external middleware)
    // Check if IP has exceeded registration attempts

    const result = await registerUser(
      { email, password, full_name, username },
      ipAddress
    );

    return res.status(result.status || statusCodes.OK).json({
      success: result.success,
      message: result.message,
      user: result.user,
    });
  } catch (error) {
    log.error('Registration endpoint error:', error);
    return res.status(statusCodes.INTERNAL_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Registration failed. Please try again.',
      },
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user with email/password
 * 
 * Request:
 *   {
 *     email: string,
 *     password: string,
 *     deviceName?: string
 *   }
 * 
 * Response:
 *   200: {
 *     success: true,
 *     user: { id, email, ... },
 *     tokens: { accessToken, refreshToken, expiresIn },
 *     session: { id, device_name }
 *   }
 *   401: { error: { code: 'INVALID_CREDENTIALS' } }
 *   429: { error: { code: 'RATE_LIMITED' } }
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, deviceName } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    // Basic validation
    if (!email || !password) {
      return res.status(statusCodes.BAD_REQUEST).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Email and password are required.',
        },
      });
    }

    // TODO: Rate limit check
    // Check if IP has exceeded login attempts

    const result = await loginUser(
      { email, password, deviceName },
      ipAddress,
      userAgent
    );

    if (!result.success) {
      return res.status(result.status || statusCodes.UNAUTHORIZED).json({
        error: {
          code: result.error?.code || 'LOGIN_FAILED',
          message: result.message,
        },
      });
    }

    // Set secure cookie with refresh token (HttpOnly, Secure, SameSite)
    if (result.tokens?.refreshToken) {
      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: auth.login.refreshTokenExpiryMs,
        path: '/api/auth',
      });
    }

    return res.status(statusCodes.OK).json({
      success: true,
      message: result.message,
      user: result.user,
      tokens: {
        accessToken: result.tokens?.accessToken,
        expiresIn: result.tokens?.expiresIn,
      },
      session: result.session,
    });
  } catch (error) {
    log.error('Login endpoint error:', error);
    return res.status(statusCodes.INTERNAL_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Login failed. Please try again.',
      },
    });
  }
});

/**
 * POST /api/auth/logout
 * Revoke current session
 * Requires: Authorization header with valid JWT
 * 
 * Response:
 *   200: { success: true, message: 'Logged out successfully.' }
 *   401: { error: { code: 'UNAUTHORIZED' } }
 */
router.post('/logout', createAuthMiddleware(), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(statusCodes.UNAUTHORIZED).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated.',
        },
      });
    }

    const sessionId = req.user.session_id;
    const userId = req.user.sub;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await logoutUser(sessionId, userId, ipAddress);

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    return res.status(statusCodes.OK).json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    log.error('Logout endpoint error:', error);
    return res.status(statusCodes.INTERNAL_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Logout failed.',
      },
    });
  }
});

/**
 * POST /api/auth/password-reset
 * Initiate password reset
 * Public endpoint (no auth required)
 * 
 * Request:
 *   { email: string }
 * 
 * Response:
 *   200: { success: true, message: 'If account exists, reset link sent.' }
 *   400: { error: { code: 'INVALID_REQUEST' } }
 *   429: { error: { code: 'RATE_LIMITED' } }
 */
router.post('/password-reset', resetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    if (!email) {
      return res.status(statusCodes.BAD_REQUEST).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Email is required.',
        },
      });
    }

    // TODO: Rate limit check
    // Check if IP has exceeded reset requests

    const result = await initiatePasswordReset(email, ipAddress);

    // Always return success (prevents user enumeration)
    return res.status(statusCodes.OK).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    log.error('Password reset endpoint error:', error);
    return res.status(statusCodes.INTERNAL_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Password reset failed.',
      },
    });
  }
});

/**
 * POST /api/auth/password-reset/confirm
 * Complete password reset with token
 * Public endpoint (token verification acts as auth)
 * 
 * Request:
 *   {
 *     email: string,
 *     resetToken: string,
 *     newPassword: string
 *   }
 * 
 * Response:
 *   200: { success: true, message: 'Password reset successfully.' }
 *   400: { error: { code: 'INVALID_REQUEST' | 'WEAK_PASSWORD' } }
 *   401: { error: { code: 'INVALID_TOKEN' } }
 */
router.post('/password-reset/confirm', resetLimiter, async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    if (!email || !resetToken || !newPassword) {
      return res.status(statusCodes.BAD_REQUEST).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Email, reset token, and password are required.',
        },
      });
    }

    const result = await resetPassword(
      { email, resetToken, newPassword },
      ipAddress
    );

    if (!result.success) {
      return res.status(result.status || statusCodes.BAD_REQUEST).json({
        error: {
          code: result.error?.code || 'PASSWORD_RESET_FAILED',
          message: result.message,
        },
      });
    }

    return res.status(statusCodes.OK).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    log.error('Password reset confirm endpoint error:', error);
    return res.status(statusCodes.INTERNAL_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Password reset failed.',
      },
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 * Requires: Authorization header with valid JWT
 * 
 * Response:
 *   200: { user: { id, email, full_name, ... } }
 *   401: { error: { code: 'UNAUTHORIZED' } }
 */
router.get('/me', createAuthMiddleware(), async (req, res) => {
  try {
    if (!req.user) {
      return res.status(statusCodes.UNAUTHORIZED).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authenticated.',
        },
      });
    }

    return res.status(statusCodes.OK).json({
      user: req.user,
    });
  } catch (error) {
    log.error('Get user endpoint error:', error);
    return res.status(statusCodes.INTERNAL_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get user.',
      },
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 * 
 * Request:
 *   { refreshToken: string }
 * 
 * Response:
 *   200: { accessToken: string, expiresIn: number }
 *   401: { error: { code: 'INVALID_REFRESH_TOKEN' } }
 */
router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(statusCodes.UNAUTHORIZED).json({
        error: {
          code: 'MISSING_REFRESH_TOKEN',
          message: 'Refresh token is required.',
        },
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await rotateRefreshToken(refreshToken, ipAddress);

    if (!result.success) {
      res.clearCookie('refreshToken');
      return res.status(result.status || statusCodes.UNAUTHORIZED).json({
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: result.message,
        },
      });
    }

    // Rotate the cookie to the new refresh token (same options as /login).
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: auth.login.refreshTokenExpiryMs,
      path: '/api/auth',
    });

    return res.status(statusCodes.OK).json({
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
    });
  } catch (error) {
    log.error('Refresh token endpoint error:', error);
    return res.status(statusCodes.INTERNAL_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Token refresh failed.',
      },
    });
  }
});

export default router;
