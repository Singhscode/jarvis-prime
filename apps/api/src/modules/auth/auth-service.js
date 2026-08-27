// Authentication Service
// Core business logic for user registration, login, password management, and security
// Orchestrates crypto, JWT, database, and audit logging

import { createHash } from 'node:crypto';
import { config } from '../../config/config.js';
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
import { sendTransactionalEmail } from '../../integrations/email-sender.js';
import { log } from '../../utils/logger.js';

const refreshInFlight = new Map();
const REGISTRATION_ACTIVATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function configuredInitialOwnerEmail() {
  const email = normalizeEmail(process.env.INITIAL_OWNER_EMAIL);
  return isValidEmailFormat(email) && email.length <= 254 ? email : null;
}

function registrationActivationUrl(token) {
  const activationUrl = new URL('/activate', process.env.WEB_APP_URL || 'https://www.jarvisprime.me');
  activationUrl.hash = new URLSearchParams({ token }).toString();
  return activationUrl.toString();
}

async function issueRegistrationVerification(user, ipAddress, authorizedEmail) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + auth.email.verificationTokenExpiryMs).toISOString();
  await repo.issueRegistrationEmailVerificationToken(
    user.id,
    hashToken(token),
    expiresAt,
    authorizedEmail
  );

  let deliveryStatus = 'failed';
  try {
    const delivery = await sendTransactionalEmail({
      to: user.email,
      subject: 'Verify your JARVIS PRIME account',
      body: `Verify your email address within 7 days: ${registrationActivationUrl(token)}`,
    });
    if (delivery.status === 'sent' || delivery.status === 'dry_run') {
      deliveryStatus = delivery.status;
    }
  } catch {
    deliveryStatus = 'failed';
  }

  await repo.createAuditLog({
    user_id: user.id,
    event_type: auth.auditEvents.EMAIL_VERIFICATION_SENT,
    action: 'create',
    resource_type: 'email_verification',
    resource_id: user.id,
    success: deliveryStatus !== 'failed',
    error_message: deliveryStatus === 'failed' ? 'Transactional email delivery failed' : null,
    ip_address: ipAddress,
    details: { delivery_status: deliveryStatus, expires_at: expiresAt },
  });

  if (deliveryStatus === 'failed') {
    throw new Error('REGISTRATION_VERIFICATION_DELIVERY_FAILED');
  }
}

export async function activateRegisteredAccount(rawToken, ipAddress) {
  if (typeof rawToken !== 'string' || !REGISTRATION_ACTIVATION_TOKEN_PATTERN.test(rawToken)) {
    return { success: false, status: statusCodes.BAD_REQUEST, message: authMessages.INVALID_TOKEN };
  }

  const authorizedEmail = configuredInitialOwnerEmail();
  if (!authorizedEmail) {
    return {
      success: false,
      status: statusCodes.SERVICE_UNAVAILABLE,
      message: 'Account activation is temporarily unavailable.',
      error: { code: 'ACTIVATION_UNAVAILABLE' },
    };
  }

  try {
    const activated = await repo.consumeRegistrationEmailVerificationToken(
      hashToken(rawToken),
      ipAddress,
      authorizedEmail
    );
    if (!activated) {
      return { success: false, status: statusCodes.BAD_REQUEST, message: authMessages.INVALID_TOKEN };
    }
    return { success: true, status: statusCodes.OK, message: authMessages.EMAIL_VERIFIED };
  } catch {
    log.error('Account activation failed.');
    return {
      success: false,
      status: statusCodes.SERVICE_UNAVAILABLE,
      message: 'Account activation is temporarily unavailable.',
      error: { code: 'ACTIVATION_UNAVAILABLE' },
    };
  }
}

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

    const authorizedEmail = configuredInitialOwnerEmail();
    if (authorizedEmail && normalizeEmail(user.email) === authorizedEmail) {
      await issueRegistrationVerification(user, ipAddress, authorizedEmail);
    }

    log.info(`User registered: ${user.id}`);

    // Return success (don't reveal if email already exists)
    return {
      success: true,
      status: statusCodes.CREATED,
      message: authMessages.REGISTRATION_SUCCESS,
      user: sanitizeUser(user),
    };
  } catch {
    log.error('Registration failed.');
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
    const accessToken = createAccessToken(user, session, config.jwtSecret);

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
export function validatePasswordStrength(password) {
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
function generateDeviceId(ipAddress, userAgent) {
  const data = `${ipAddress}|${userAgent || ''}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Logs out a user (revokes session)
 * 
 * @param {string} sessionId - Session ID to revoke
 * @param {string} userId - User ID (for audit)
 * @param {string} ipAddress - Client IP
 */
export async function logoutUser(sessionId, userId, ipAddress) {
  await repo.revokeSession(sessionId, 'user_logout');
  await repo.revokeSessionRefreshTokens(sessionId);

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
}

/**
 * Rotates a refresh token: verifies it, issues new access + refresh tokens,
 * and revokes the old refresh token.
 *
 * If the presented token is not found among valid (non-revoked, non-expired)
 * tokens but DOES exist in the table (i.e. it was already used or revoked),
 * this is treated as token theft — all sessions and refresh tokens for that
 * user are revoked and the caller must re-authenticate.
 *
 * @param {string} rawToken - The refresh token from the client
 * @param {string} ipAddress - Client IP (for audit)
 * @returns {object} { success, tokens, message, status }
 */
export function rotateRefreshToken(rawToken, ipAddress) {
  const tokenHash = hashToken(rawToken);
  const existing = refreshInFlight.get(tokenHash);
  if (existing) return existing;

  const operation = rotateRefreshTokenOnce(tokenHash, ipAddress);
  refreshInFlight.set(tokenHash, operation);
  operation.then(
    () => refreshInFlight.delete(tokenHash),
    () => refreshInFlight.delete(tokenHash)
  );
  return operation;
}

async function rotateRefreshTokenOnce(tokenHash, ipAddress) {
  try {
    const validRecord = await repo.getRefreshToken(tokenHash);

    if (!validRecord) {
      // Token not currently valid — check if it existed at all (reuse/theft signal).
      const anyRecord = await repo.findRefreshTokenByHash(tokenHash);
      if (anyRecord) {
        await repo.revokeAllUserSessions(anyRecord.user_id, 'refresh_token_reuse_detected');
        await repo.createAuditLog({
          user_id: anyRecord.user_id,
          event_type: 'session.revoked',
          action: 'update',
          resource_type: 'refresh_token',
          success: false,
          error_message: 'Refresh token reuse detected',
          ip_address: ipAddress,
        });
        log.warn(`Refresh token reuse detected for user: ${anyRecord.user_id}`);
      }

      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: authMessages.SESSION_EXPIRED,
      };
    }

    const user = await repo.getUserById(validRecord.user_id);
    if (!user) {
      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: authMessages.SESSION_EXPIRED,
      };
    }

    const session = await repo.getSession(validRecord.session_id);
    if (!session) {
      return {
        success: false,
        status: statusCodes.UNAUTHORIZED,
        message: authMessages.SESSION_EXPIRED,
      };
    }

    // Revoke the old refresh token before issuing a new one (rotation).
    await repo.revokeRefreshToken(tokenHash);

    const newAccessToken = createAccessToken(user, session, config.jwtSecret);
    const newRefreshTokenRaw = generateToken();
    await repo.createRefreshToken({
      user_id: user.id,
      session_id: session.id,
      token_hash: hashToken(newRefreshTokenRaw),
    });

    await repo.createAuditLog({
      user_id: user.id,
      event_type: auth.auditEvents.TOKEN_REFRESHED,
      action: 'update',
      resource_type: 'refresh_token',
      success: true,
      ip_address: ipAddress,
    });

    return {
      success: true,
      status: statusCodes.OK,
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshTokenRaw,
        expiresIn: auth.jwt.accessTokenExpirySeconds,
      },
    };
  } catch (error) {
    log.error('Refresh token rotation error:', error);
    return {
      success: false,
      status: statusCodes.INTERNAL_ERROR,
      message: 'Token refresh failed.',
    };
  }
}

function passwordResetUrl(email, token) {
  const resetUrl = new URL('/employee/activate', process.env.WEB_APP_URL || 'https://www.jarvisprime.me');
  resetUrl.searchParams.set('email', email);
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
}

async function issuePasswordReset(user, ipAddress) {
  const token = generateToken();
  await repo.createPasswordResetToken(user.id, token, auth.passwordReset.tokenExpiryMs);

  let deliveryStatus = 'failed';
  try {
    const delivery = await sendTransactionalEmail({
      to: user.email,
      subject: 'Reset your JARVIS PRIME password',
      body: `Reset your password within 24 hours: ${passwordResetUrl(user.email, token)}`,
    });
    if (delivery.status === 'sent' || delivery.status === 'dry_run') deliveryStatus = delivery.status;
  } catch {
    deliveryStatus = 'failed';
  }

  await repo.createAuditLog({
    user_id: user.id,
    event_type: 'password.reset_initiated',
    action: 'create',
    resource_type: 'password_reset',
    resource_id: user.id,
    success: deliveryStatus !== 'failed',
    error_message: deliveryStatus === 'failed' ? 'Transactional email delivery failed' : null,
    ip_address: ipAddress,
    details: { delivery_status: deliveryStatus },
  });
  if (deliveryStatus === 'failed') throw new Error('PASSWORD_RESET_DELIVERY_FAILED');
  log.info(`Password reset initiated for user: ${user.id}`);
  return { delivery: deliveryStatus };
}

/**
 * Issues a password reset for a server-authorized user. The raw capability is
 * hashed before persistence and is only placed in the transactional email.
 */
export async function sendPasswordResetForUser(user, ipAddress) {
  if (!user?.id || !isValidEmailFormat(user.email)) throw new Error('PASSWORD_RESET_USER_INVALID');
  return issuePasswordReset(user, ipAddress);
}

/**
 * Initiates the public password reset flow while preserving the generic,
 * enumeration-safe response contract.
 */
export async function initiatePasswordReset(email, ipAddress) {
  try {
    const user = await repo.getUserByEmail(email);
    if (user) await sendPasswordResetForUser(user, ipAddress);
  } catch {
    log.error('Password reset initiation error.');
  }
  return {
    success: true,
    message: 'If an account exists with this email, a reset link has been sent.',
  };
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

    // Update password and store in history. Only an employee invitation may use
    // password setup as activation; pending clients require email verification.
    await repo.updatePassword(user.id, newPasswordHash, user.password_hash);
    if (user.role === 'employee') {
      await repo.activatePendingEmployee(user.id);
    }

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
  return verifyAccessToken(bearerToken, config.jwtSecret);
}
