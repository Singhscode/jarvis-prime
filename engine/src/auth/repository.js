// Authentication Repository
// Data access layer for users, tokens, sessions, and audit logs
// Abstracts database operations, ensures security at storage layer

import { db } from '../lib/db.js';
import { normalizeEmail, hashToken } from './crypto.js';
import { auth } from './constants.js';

/**
 * Creates a new user account
 * 
 * @param {object} userData - { email, emailNormalized, password_hash, full_name }
 * @returns {object} Created user
 */
export async function createUser(userData) {
  const { error, data } = await db
    .from('users')
    .insert([{
      email: userData.email,
      email_normalized: normalizeEmail(userData.email),
      username: userData.username || null,
      full_name: userData.full_name || null,
      password_hash: userData.password_hash || null,
      status: auth.accountStatus.PENDING_VERIFICATION,
      email_verification_attempts: 0,
      failed_login_attempts: 0,
      mfa_enabled: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Finds user by email (normalized)
 * 
 * @param {string} email - User email
 * @returns {object|null} User or null if not found
 */
export async function getUserByEmail(email) {
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('email_normalized', normalizeEmail(email))
    .single();

  if (error && error.code !== 'PGRST116') throw error;  // Not found is expected
  return data || null;
}

/**
 * Finds user by ID
 * 
 * @param {string} userId - User ID
 * @returns {object|null} User or null
 */
export async function getUserById(userId) {
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Updates user status
 * 
 * @param {string} userId - User ID
 * @param {string} status - New status
 */
export async function updateUserStatus(userId, status) {
  const { error } = await db
    .from('users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Updates user profile information
 * 
 * @param {string} userId - User ID
 * @param {object} updates - { full_name, avatar_url, etc }
 */
export async function updateUserProfile(userId, updates) {
  const { error } = await db
    .from('users')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Marks email as verified
 * 
 * @param {string} userId - User ID
 */
export async function verifyUserEmail(userId) {
  const { error } = await db
    .from('users')
    .update({
      email_verified_at: new Date().toISOString(),
      status: auth.accountStatus.ACTIVE,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Records failed login attempt
 * 
 * @param {string} userId - User ID
 */
export async function recordFailedLogin(userId) {
  const { error } = await db
    .from('users')
    .update({
      failed_login_attempts: db.raw('failed_login_attempts + 1'),
      last_failed_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Locks account after max failed attempts
 * 
 * @param {string} userId - User ID
 * @param {number} lockoutDurationMs - How long to lock
 */
export async function lockAccount(userId, lockoutDurationMs) {
  const unlockAt = new Date(Date.now() + lockoutDurationMs).toISOString();
  
  const { error } = await db
    .from('users')
    .update({
      account_locked_until: unlockAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Unlocks account
 * 
 * @param {string} userId - User ID
 */
export async function unlockAccount(userId) {
  const { error } = await db
    .from('users')
    .update({
      account_locked_until: null,
      failed_login_attempts: 0,
      last_failed_login_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Creates email verification token
 * 
 * @param {string} userId - User ID
 * @param {string} token - Raw token
 * @param {number} expiryMs - Expiry in milliseconds
 */
export async function createEmailVerificationToken(userId, token, expiryMs) {
  const { error } = await db
    .from('email_verification_tokens')
    .insert([{
      user_id: userId,
      token_hash: hashToken(token),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + expiryMs).toISOString(),
      attempts: 0,
    }])
    .select()
    .single();

  if (error) throw error;
}

/**
 * Finds valid email verification token
 * 
 * @param {string} userId - User ID
 * @returns {object|null} Token record or null
 */
export async function getEmailVerificationToken(userId) {
  const { data, error } = await db
    .from('email_verification_tokens')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Marks email verification token as used
 * 
 * @param {string} tokenId - Token ID
 * @param {string} ipAddress - IP address that verified
 */
export async function markEmailTokenVerified(tokenId, ipAddress) {
  const { error } = await db
    .from('email_verification_tokens')
    .update({
      verified_at: new Date().toISOString(),
      verification_ip: ipAddress,
    })
    .eq('id', tokenId);

  if (error) throw error;
}

/**
 * Creates password reset token
 * 
 * @param {string} userId - User ID
 * @param {string} token - Raw token
 * @param {number} expiryMs - Expiry in milliseconds
 */
export async function createPasswordResetToken(userId, token, expiryMs) {
  const { error } = await db
    .from('password_resets')
    .insert([{
      user_id: userId,
      token_hash: hashToken(token),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + expiryMs).toISOString(),
      attempts: 0,
    }])
    .select()
    .single();

  if (error) throw error;
}

/**
 * Finds valid password reset token
 * 
 * @param {string} userId - User ID
 */
export async function getPasswordResetToken(userId) {
  const { data, error } = await db
    .from('password_resets')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Marks password reset token as used
 * 
 * @param {string} tokenId - Token ID
 * @param {string} ipAddress - IP address
 */
export async function markPasswordResetUsed(tokenId, ipAddress) {
  const { error } = await db
    .from('password_resets')
    .update({
      used_at: new Date().toISOString(),
      used_ip: ipAddress,
    })
    .eq('id', tokenId);

  if (error) throw error;
}

/**
 * Updates user password and stores old hash in history
 * 
 * @param {string} userId - User ID
 * @param {string} newPasswordHash - New password hash
 * @param {string|null} oldPasswordHash - Previous hash (for history)
 */
export async function updatePassword(userId, newPasswordHash, oldPasswordHash = null) {
  // Store old password in history (prevent reuse)
  if (oldPasswordHash) {
    await db
      .from('password_history')
      .insert([{
        user_id: userId,
        password_hash: oldPasswordHash,
        created_at: new Date().toISOString(),
      }]);
  }

  // Update current password
  const { error } = await db
    .from('users')
    .update({
      password_hash: newPasswordHash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Gets recent password history for reuse check
 * 
 * @param {string} userId - User ID
 * @param {number} count - How many previous passwords to check
 */
export async function getPasswordHistory(userId, count = 5) {
  const { data, error } = await db
    .from('password_history')
    .select('password_hash')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(count);

  if (error) throw error;
  return data || [];
}

/**
 * Creates a user session
 * 
 * @param {object} sessionData - { user_id, device_id, device_name, ip_address, user_agent }
 */
export async function createSession(sessionData) {
  const expiryMs = auth.login.sessionTimeoutMs;
  
  const { data, error } = await db
    .from('sessions')
    .insert([{
      user_id: sessionData.user_id,
      device_id: sessionData.device_id,
      device_name: sessionData.device_name || null,
      device_type: sessionData.device_type || auth.deviceType.WEB,
      ip_address: sessionData.ip_address,
      user_agent: sessionData.user_agent || null,
      created_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + expiryMs).toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Finds active session by ID
 * 
 * @param {string} sessionId - Session ID
 */
export async function getSession(sessionId) {
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Gets all active sessions for a user
 * 
 * @param {string} userId - User ID
 */
export async function getUserSessions(userId) {
  const { data, error } = await db
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());

  if (error) throw error;
  return data || [];
}

/**
 * Revokes a session
 * 
 * @param {string} sessionId - Session ID
 * @param {string} reason - Why session was revoked
 */
export async function revokeSession(sessionId, reason = 'user_logout') {
  const { error } = await db
    .from('sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .eq('id', sessionId);

  if (error) throw error;
}

/**
 * Revokes all sessions for a user
 * 
 * @param {string} userId - User ID
 * @param {string} reason - Why sessions were revoked
 */
export async function revokeAllUserSessions(userId, reason = 'user_logout') {
  const { error } = await db
    .from('sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error) throw error;
}

/**
 * Creates a refresh token record
 * 
 * @param {object} tokenData - { user_id, session_id, token_hash, device_id }
 */
export async function createRefreshToken(tokenData) {
  const expiryMs = auth.login.refreshTokenExpiryMs;
  
  const { data, error } = await db
    .from('refresh_tokens')
    .insert([{
      user_id: tokenData.user_id,
      session_id: tokenData.session_id,
      token_hash: tokenData.token_hash,
      device_id: tokenData.device_id,
      token_family_id: null,  // Will be set on first rotation
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + expiryMs).toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Gets refresh token by hash
 * 
 * @param {string} tokenHash - Hash of the token
 */
export async function getRefreshToken(tokenHash) {
  const { data, error } = await db
    .from('refresh_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

/**
 * Logs an audit event
 * Never log passwords, tokens, or sensitive data
 * 
 * @param {object} auditData - { user_id, event_type, resource_type, success, details, ip_address }
 */
export async function createAuditLog(auditData) {
  const { error } = await db
    .from('audit_logs')
    .insert([{
      user_id: auditData.user_id || null,
      event_type: auditData.event_type,
      action: auditData.action || 'create',
      resource_type: auditData.resource_type || null,
      resource_id: auditData.resource_id || null,
      success: auditData.success !== false,
      error_message: auditData.error_message || null,
      ip_address: auditData.ip_address || null,
      user_agent: auditData.user_agent || null,
      details: auditData.details || {},
      created_at: new Date().toISOString(),
    }]);

  if (error) throw error;
}

/**
 * Gets user audit logs
 * 
 * @param {string} userId - User ID
 * @param {number} limit - Number of records
 */
export async function getUserAuditLogs(userId, limit = 50) {
  const { data, error } = await db
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Creates OAuth account linkage
 * 
 * @param {object} oauthData - { user_id, provider, provider_user_id, email, name, picture_url }
 */
export async function linkOAuthAccount(oauthData) {
  const { data, error } = await db
    .from('oauth_accounts')
    .insert([{
      user_id: oauthData.user_id,
      provider: oauthData.provider,
      provider_user_id: oauthData.provider_user_id,
      email: oauthData.email || null,
      name: oauthData.name || null,
      picture_url: oauthData.picture_url || null,
      raw_data: oauthData.raw_data || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Finds OAuth account
 * 
 * @param {string} provider - Provider name (google, microsoft, etc)
 * @param {string} provider_user_id - User ID from provider
 */
export async function getOAuthAccount(provider, provider_user_id) {
  const { data, error } = await db
    .from('oauth_accounts')
    .select('*')
    .eq('provider', provider)
    .eq('provider_user_id', provider_user_id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}
