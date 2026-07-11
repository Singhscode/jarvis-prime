// Authentication Service
// Core business logic for user registration, login, password management, and security
// Orchestrates crypto, JWT, database, and audit logging

import {
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
  verifyTokenHash,
  normalizeEmail,
  isValidEmailFormat,
} from './crypto.js';
import {
  createAccessToken,
  verifyAccessToken,
  extractBearerToken,
} from './jwt-service.js';
import * as repo from './repository.js';
import { auth, authMessages, statusCodes } from './constants.js';
import { log } from 'jarvis-logger';

/**
 * Registers a new user account
 * Implements: account creation, password hashing, email verification setup, audit logging
 * 
 * OWASP: Secure account creation, input validation, rate limiting (external)
 * 
 * @param {object} params - { email, password, full_name }
 * @param {string} ipAddress - Client IP for audit trail
 * @returns {object} { success, user, message }
 */
export async function registerUser(params, ipAddress) {
  try {
    const { email, password, full_name, username } = params;

    // Input validation
    if (!email || !password) {
      return {
        success: false,
        status: statusCodes.BAD_REQUEST,
        message: 'Email and password are required.',
      };
    }

    if (!isValidEmailFormat(email)) {
      return {
        success: false,
        status: statusCodes.BAD_REQUEST,
        message: 'Invalid email format.',
      };
    }

    if (password.length < auth.password.minLength) {
      return {
        success: false,
        status: statusCodes.BAD_REQUEST,
        message: `Password must be at least ${auth.password.minLength} characters.`,
      };
    }

    // Check password strength
    const strengthCheck = validatePasswordStrength(password);
    if (!strengthCheck.valid) {
      return {
        success: false,
        status: statusCodes.BAD_REQUEST,
        message: strengthCheck.message,
      };
    }

    // Check for existing user (avoid enumeration in response)
    const existingUser = await repo.getUserByEmail(email);
    if (existingUser) {
      // Return generic message to prevent user enumeration
      await repo.createAuditLog({
        event_type: 'user.registration_attempted',
        action: 'create',
        success: false,
        error_message: 'Email already exists',
        ip_address: ipAddress,
        details: { email_normalized: normalizeEmail(email) },
      });

      return {
        success: false,
        status: statusCodes.CONFLICT,
        message: authMessages.REGISTRATION_SUCCESS, // Generic success message
      };
    }

    // Hash password securely
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await repo.createUser({
      email,
      username: username || null,
      full_name: full_name || null,
      password_hash: passwordHash,
    });

    // Log successful registration
    await repo.createAuditLog({
      user_id: user.id,
      event_type: auth.auditEvents.USER_CREATED,
      action: 'create',
      resource_type: 'user',
      resource_id: user.id,
      success: true,
      ip_address: ipAddress,
      details: { email: normalizeEmail(email) },
    });

    log.info(`User registered: ${user.id}`);

    // Return success (don't reveal if email already exists)
    return {
      success: true,
      status: statusCodes.CREATED,
      message: authMessages.REGISTRATION_SUCCESS,
      user: sanitizeUser(user),
    };
  } catch (error) {
    log.error('Registration error:', error);
    return {
      success: false,
      status: statusCodes.INTERNAL_ERROR,
      message: 'Registration failed. Please try again.',
    };
  }
}

/**
 * Authenticates user with email and password
 * Implements: login, failed attempt tracking, account lockout, session creation
 * 
 * OWASP: Account lockout, brute-force protection, generic error messages
 * 
 * @param {object} params - { email, password }
 * @param {string} ipAddress - Client IP
 * @param {string} userAgent - User agent
 * @returns {object} { success, user, tokens, message }
 */
export async function loginUser(params, ipAddress, userAgent) {
  try {
    const { email, password, deviceName } = params;

    if (!email || !password) {
      return {
        success: false,
        status: statusCodes.BAD_REQUEST,
        message: authMessages.INVALID_CREDENTIALS,
      };
    }

    // Find user (normalize email)
    const user = await repo.getUserByEmail(email);

    // Check if account exists and is active
    if (!user) {
      // Log failed login attempt (no user found)
      await repo.createAuditLog({
        event_type: auth.auditEvents.LOGIN_FAILED,
        action: 'read',
        success: false,
        error_message: 'User not found',
        ip_address: ipAddress,
        user_agent: userAgent,
        details: { email_normalized: normalizeEmail(email), reason: 'no_user' },
      });

      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: authMessages.INVALID_CREDENTIALS, // Generic message
      };
    }

    // Check email verification
    if (user.status === auth.accountStatus.PENDING_VERIFICATION) {
      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: 'Please verify your email before logging in.',
      };
    }

    // Check account status
    if (user.status === auth.accountStatus.SUSPENDED) {
      await repo.createAuditLog({
        user_id: user.id,
        event_type: auth.auditEvents.LOGIN_FAILED,
        action: 'read',
        success: false,
        error_message: 'Account suspended',
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: authMessages.ACCOUNT_SUSPENDED,
      };
    }

    if (user.status === auth.accountStatus.DELETED) {
      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: authMessages.INVALID_CREDENTIALS,
      };
    }

    // Check if account is locked
    if (user.account_locked_until) {
      const lockoutExpiry = new Date(user.account_locked_until);
      if (lockoutExpiry > new Date()) {
        await repo.createAuditLog({
          user_id: user.id,
          event_type: auth.auditEvents.LOGIN_FAILED,
          action: 'read',
          success: false,
          error_message: 'Account locked',
          ip_address: ipAddress,
          user_agent: userAgent,
        });

        return {
          success: false,
          status: statusCodes.UNAUTHORIZED,
          message: 'Account is locked due to failed login attempts. Try again later.',
        };
      } else {
        // Unlock expired lockout
        await repo.unlockAccount(user.id);
      }
    }

    // Verify password
    const passwordMatch = await verifyPassword(password, user.password_hash);

    if (!passwordMatch) {
      // Record failed attempt
      await repo.recordFailedLogin(user.id);

      // Check if should lock account
      const updatedUser = await repo.getUserById(user.id);
      if (updatedUser.failed_login_attempts >= auth.login.maxFailedAttempts) {
        await repo.lockAccount(user.id, auth.login.lockoutDurationMs);

        await repo.createAuditLog({
          user_id: user.id,
          event_type: auth.auditEvents.ACCOUNT_LOCKED,
          action: 'update',
          resource_type: 'user',
          resource_id: user.id,
          success: false,
          ip_address: ipAddress,
          user_agent: userAgent,
          details: { failed_attempts: auth.login.maxFailedAttempts },
        });

        return {
          success: false,
          status: statusCodes.UNAUTHORIZED,
          message: 'Too many failed attempts. Account locked.',
        };
      }

      // Log failed login
      await repo.createAuditLog({
        user_id: user.id,
        event_type: auth.auditEvents.LOGIN_FAILED,
        action: 'read',
        success: false,
        error_message: 'Invalid password',
        ip_address: ipAddress,
        user_agent: userAgent,
        details: { attempt: updatedUser.failed_login_attempts + 1 },
      });

      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: authMessages.INVALID_CREDENTIALS,
      };
    }

    // Password is correct - reset failed attempts
    if (user.failed_login_attempts > 0) {
      await repo.unlockAccount(user.id);
    }

    // Create session
    const session = await repo.createSession({
      user_id: user.id,
      device_id: await generateDeviceId(ipAddress, userAgent),
      device_name: deviceName || null,
      device_type: 'web',
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // Generate tokens
    const accessToken = createAccessToken(user, session, process.env.JWT_SECRET);

    // Create refresh token (stored in DB)
    const refreshTokenRaw = generateToken();
    const refreshTokenRecord = await repo.createRefreshToken({
      user_id: user.id,
      session_id: session.id,
      token_hash: hashToken(refreshTokenRaw),
      device_id: session.device_id,
    });

    // Update session with access token hash (for invalidation tracking)
    // In production, you'd typically return refresh token to client for secure storage

    // Log successful login
    await repo.createAuditLog({
      user_id: user.id,
      event_type: auth.auditEvents.USER_LOGIN,
      action: 'create',
      resource_type: 'session',
      resource_id: session.id,
      success: true,
      ip_address: ipAddress,
      user_agent: userAgent,
      details: { device_name: deviceName },
    });

    log.info(`User logged in: ${user.id}`);

    return {
      success: true,
      status: statusCodes.OK,
      message: authMessages.LOGIN_SUCCESS,
      user: sanitizeUser(user),
      tokens: {
        accessToken,
        refreshToken: refreshTokenRaw,
        expiresIn: auth.jwt.accessTokenExpirySeconds,
      },
      session: {
        id: session.id,
        device_name: session.device_name,
      },
    };
  } catch (error) {
    log.error('Login error:', error);
    return {
      success: false,
      status: statusCodes.INTERNAL_ERROR,
      message: 'Login failed. Please try again.',
    };
  }
}

/**
 * Validates password strength (OWASP criteria)
 * 
 * @param {string} password - Password to validate
 * @returns {object} { valid, message }
 */
function validatePasswordStrength(password) {
  // Check length
  if (password.length < auth.password.minLength) {
    return {
      valid: false,
      message: `Password must be at least ${auth.password.minLength} characters.`,
    };
  }

  // Check uppercase
  if (auth.password.requireUppercase && !/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain an uppercase letter.',
    };
  }

  // Check lowercase
  if (auth.password.requireLowercase && !/[a-z]/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain a lowercase letter.',
    };
  }

  // Check numbers
  if (auth.password.requireNumbers && !/\d/.test(password)) {
    return {
      valid: false,
      message: 'Password must contain a number.',
    };
  }

  // Check special characters
  if (auth.password.requireSpecialChars) {
    const specialCharacters = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const hasSpecial = Array.from(specialCharacters).some((character) => password.includes(character));
    if (!hasSpecial) {
      return {
        valid: false,
        message: 'Password must contain a special character (!@#$%^&*).',
      };
    }
  }

  // Check blacklist
  for (const blacklistedPassword of auth.password.blacklist) {
    if (password.toLowerCase().includes(blacklistedPassword)) {
      return {
        valid: false,
        message: 'Password is too common. Choose a more unique password.',
      };
    }
  }

  return { valid: true };
}

/**
 * Generates a device fingerprint from network metadata
 * 
 * @param {string} ipAddress - Client IP
 * @param {string} userAgent - User agent string
 * @returns {string} Device ID
 */
async function generateDeviceId(ipAddress, userAgent) {
  const crypto = await import('node:crypto');
  const data = `${ipAddress}|${userAgent || ''}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Logs out a user (revokes session)
 * 
 * @param {string} sessionId - Session ID to revoke
 * @param {string} userId - User ID (for audit)
 * @param {string} ipAddress - Client IP
 */
export async function logoutUser(sessionId, userId, ipAddress) {
  try {
    await repo.revokeSession(sessionId, 'user_logout');

    await repo.createAuditLog({
      user_id: userId,
      event_type: auth.auditEvents.USER_LOGOUT,
      action: 'update',
      resource_type: 'session',
      resource_id: sessionId,
      success: true,
      ip_address: ipAddress,
    });

    return { success: true, message: authMessages.LOGOUT_SUCCESS };
  } catch (error) {
    log.error('Logout error:', error);
    return { success: false, message: 'Logout failed.' };
  }
}

/**
 * Initiates password reset flow
 * Sends reset token via email
 * 
 * @param {string} email - User email
 * @param {string} ipAddress - Client IP
 */
export async function initiatePasswordReset(email, ipAddress) {
  try {
    const user = await repo.getUserByEmail(email);

    if (!user) {
      // Generic response (prevent user enumeration)
      return {
        success: true,
        message: 'If an account exists with this email, a reset link has been sent.',
      };
    }

    // Generate reset token
    const token = generateToken();
    await repo.createPasswordResetToken(
      user.id,
      token,
      auth.passwordReset.tokenExpiryMs
    );

    // In production, send email with reset link
    // The token should be: `${resetUrl}?token=${token}&email=${encodeURIComponent(email)}`

    await repo.createAuditLog({
      user_id: user.id,
      event_type: 'password.reset_initiated',
      action: 'create',
      resource_type: 'password_reset',
      success: true,
      ip_address: ipAddress,
    });

    log.info(`Password reset initiated for user: ${user.id}`);

    return {
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.',
      // In production client: provide reset token via secure email link
      resetToken: token, // TODO: Remove in production (send via email only)
    };
  } catch (error) {
    log.error('Password reset initiation error:', error);
    return {
      success: false,
      message: 'Failed to initiate password reset.',
    };
  }
}

/**
 * Completes password reset
 * 
 * @param {object} params - { email, resetToken, newPassword }
 * @param {string} ipAddress - Client IP
 */
export async function resetPassword(params, ipAddress) {
  try {
    const { email, resetToken, newPassword } = params;

    if (!email || !resetToken || !newPassword) {
      return {
        success: false,
        status: statusCodes.BAD_REQUEST,
        message: 'Email, reset token, and password are required.',
      };
    }

    // Find user
    const user = await repo.getUserByEmail(email);
    if (!user) {
      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: authMessages.INVALID_TOKEN,
      };
    }

    // Get reset token
    const resetRecord = await repo.getPasswordResetToken(user.id);
    if (!resetRecord) {
      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: authMessages.INVALID_TOKEN,
      };
    }

    // Verify token
    if (!verifyTokenHash(resetToken, resetRecord.token_hash)) {
      // Increment attempts
      // In production: check max attempts and add delay
      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: authMessages.INVALID_TOKEN,
      };
    }

    // Validate new password
    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      return {
        success: false,
        status: statusCodes.BAD_REQUEST,
        message: strengthCheck.message,
      };
    }

    // Check password history (prevent reuse)
    const history = await repo.getPasswordHistory(user.id);
    const newPasswordHash = await hashPassword(newPassword);

    for (const historyRecord of history) {
      const matches = await verifyPassword(newPassword, historyRecord.password_hash);
      if (matches) {
        return {
          success: false,
          status: statusCodes.BAD_REQUEST,
          message: 'Cannot reuse a recent password.',
        };
      }
    }

    // Update password and store in history
    await repo.updatePassword(user.id, newPasswordHash, user.password_hash);

    // Mark reset token as used
    await repo.markPasswordResetUsed(resetRecord.id, ipAddress);

    // Revoke all existing sessions (force re-login for security)
    await repo.revokeAllUserSessions(user.id, 'password_reset');

    // Log password reset
    await repo.createAuditLog({
      user_id: user.id,
      event_type: auth.auditEvents.PASSWORD_RESET,
      action: 'update',
      resource_type: 'user',
      resource_id: user.id,
      success: true,
      ip_address: ipAddress,
    });

    log.info(`Password reset completed for user: ${user.id}`);

    return {
      success: true,
      status: statusCodes.OK,
      message: authMessages.PASSWORD_RESET_SUCCESS,
    };
  } catch (error) {
    log.error('Password reset error:', error);
    return {
      success: false,
      status: statusCodes.INTERNAL_ERROR,
      message: 'Password reset failed.',
    };
  }
}

/**
 * Removes sensitive fields from user object before sending to client
 * 
 * @param {object} user - User database record
 * @returns {object} Sanitized user
 */
export function sanitizeUser(user) {
  const { password_hash, ...sanitized } = user;
  return sanitized;
}

/**
 * Verifies JWT token and returns decoded claims
 * 
 * @param {string} token - JWT access token
 * @returns {object|null} Decoded payload or null if invalid
 */
export function verifyToken(token) {
  const bearerToken = extractBearerToken(`Bearer ${token}`) || token;
  return verifyAccessToken(bearerToken, process.env.JWT_SECRET);
}
