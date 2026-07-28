// Authentication Repository
// Data access layer for users, tokens, sessions, and audit logs
// All queries go through the Supabase client from lib/db.js
//
// Uses getDb() to get the Supabase client — the same pattern used
// everywhere else in the engine (see lib/db.js).

import { getDb } from '../../database/db.js';
import { normalizeEmail, hashToken } from './crypto.js';
import { auth } from './constants.js';

/**
 * Returns the live Supabase client.
 * Auth operations always require a real database — no in-memory fallback.
 * @throws {Error} if database is not configured
 */
function client() {
  const { client: db, usingMemory } = getDb();
  if (usingMemory) {
    throw new Error(
      'Auth requires a Supabase database. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.'
    );
  }
  return db;
}

// ── Users ──────────────────────────────────────────────────────────────────

export async function createUser(userData) {
  const { data, error } = await client()
    .from('users')
    .insert([{
      email: userData.email,
      email_normalized: normalizeEmail(userData.email),
      username: userData.username || null,
      full_name: userData.full_name || null,
      password_hash: userData.password_hash || null,
      status: auth.accountStatus.PENDING_VERIFICATION,
      failed_login_attempts: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Creates the single active, verified Owner inside a caller-owned transaction.
 * Registration continues to use createUser() and its pending-verification state.
 */
export async function createInitialOwner(transaction, userData) {
  const normalizedEmail = normalizeEmail(userData.email);
  const { rows: [user] } = await transaction.query(`insert into public.users
    (email, email_normalized, full_name, password_hash, status, role,
     email_verified_at, failed_login_attempts, last_failed_login_at,
     account_locked_until, created_at, updated_at)
    values ($1, $2, $3, $4, 'active', 'client', now(), 0, null, null, now(), now())
    returning id, email, email_normalized, full_name, status, role, email_verified_at`,
  [userData.email, normalizedEmail, userData.full_name, userData.password_hash]);
  return user;
}

export async function findUserByNormalizedEmailForUpdate(transaction, email) {
  const { rows } = await transaction.query(`select id, email, role, status
    from public.users where email_normalized = $1 for update`, [normalizeEmail(email)]);
  return rows[0] || null;
}

export async function findOwnerBootstrapAuditForUpdate(transaction) {
  const { rows } = await transaction.query(`select id, user_id, event_type, action,
    resource_type, resource_id, success, details, created_at
    from public.audit_logs
    where event_type = 'owner.bootstrap_completed' and success = true
    order by created_at, id
    limit 1 for update`);
  return rows[0] || null;
}

export async function getUserByEmail(email) {
  const { data, error } = await client()
    .from('users')
    .select('*')
    .eq('email_normalized', normalizeEmail(email))
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function getUserById(userId) {
  const { data, error } = await client()
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function updateUserStatus(userId, status) {
  const { error } = await client()
    .from('users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

export async function updateUserProfile(userId, updates) {
  const { error } = await client()
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

export async function verifyUserEmail(userId) {
  const { error } = await client()
    .from('users')
    .update({
      email_verified_at: new Date().toISOString(),
      status: auth.accountStatus.ACTIVE,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

export async function recordFailedLogin(userId) {
  // Use a PostgreSQL-safe increment: fetch current count, increment, update.
  // db.raw() does not exist in the Supabase JS SDK — use an RPC instead.
  const { data: user, error: fetchError } = await client()
    .from('users')
    .select('failed_login_attempts')
    .eq('id', userId)
    .single();

  if (fetchError) throw fetchError;

  const { error } = await client()
    .from('users')
    .update({
      failed_login_attempts: (user.failed_login_attempts || 0) + 1,
      last_failed_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

export async function lockAccount(userId, lockoutDurationMs) {
  const unlockAt = new Date(Date.now() + lockoutDurationMs).toISOString();

  const { error } = await client()
    .from('users')
    .update({
      account_locked_until: unlockAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

export async function unlockAccount(userId) {
  const { error } = await client()
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

// ── Email Verification ─────────────────────────────────────────────────────

export async function createEmailVerificationToken(userId, token, expiryMs) {
  const { error } = await client()
    .from('email_verification_tokens')
    .insert([{
      user_id: userId,
      token_hash: hashToken(token),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + expiryMs).toISOString(),
      attempts: 0,
    }]);

  if (error) throw error;
}

export async function getEmailVerificationToken(userId) {
  const { data, error } = await client()
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

export async function markEmailTokenVerified(tokenId, ipAddress) {
  const { error } = await client()
    .from('email_verification_tokens')
    .update({
      verified_at: new Date().toISOString(),
      verification_ip: ipAddress,
    })
    .eq('id', tokenId);

  if (error) throw error;
}

// ── Password Reset ─────────────────────────────────────────────────────────

export async function createPasswordResetToken(userId, token, expiryMs) {
  const { error } = await client()
    .from('password_resets')
    .insert([{
      user_id: userId,
      token_hash: hashToken(token),
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + expiryMs).toISOString(),
      attempts: 0,
    }]);

  if (error) throw error;
}

export async function getPasswordResetToken(userId) {
  const { data, error } = await client()
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

export async function markPasswordResetUsed(tokenId, ipAddress) {
  const { error } = await client()
    .from('password_resets')
    .update({
      used_at: new Date().toISOString(),
      used_ip: ipAddress,
    })
    .eq('id', tokenId);

  if (error) throw error;
}

// ── Password History ───────────────────────────────────────────────────────

export async function updatePassword(userId, newPasswordHash, oldPasswordHash = null) {
  if (oldPasswordHash) {
    await client()
      .from('password_history')
      .insert([{
        user_id: userId,
        password_hash: oldPasswordHash,
        created_at: new Date().toISOString(),
      }]);
  }

  const { error } = await client()
    .from('users')
    .update({
      password_hash: newPasswordHash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;
}

export async function getPasswordHistory(userId, count = 5) {
  const { data, error } = await client()
    .from('password_history')
    .select('password_hash')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(count);

  if (error) throw error;
  return data || [];
}

// ── Sessions ───────────────────────────────────────────────────────────────

export async function createSession(sessionData) {
  const { data, error } = await client()
    .from('sessions')
    .insert([{
      user_id: sessionData.user_id,
      device_id: sessionData.device_id,
      device_name: sessionData.device_name || null,
      ip_address: sessionData.ip_address,
      user_agent: sessionData.user_agent || null,
      created_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + auth.login.sessionTimeoutMs).toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getSession(sessionId) {
  const { data, error } = await client()
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function revokeSession(sessionId, reason = 'user_logout') {
  const { error } = await client()
    .from('sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .eq('id', sessionId);

  if (error) throw error;
}

export async function revokeSessionRefreshTokens(sessionId) {
  const { error } = await client()
    .from('refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .is('revoked_at', null);

  if (error) throw error;
}

export async function revokeAllUserSessions(userId, reason = 'user_logout') {
  const { error } = await client()
    .from('sessions')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    })
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error) throw error;
}

// ── Refresh Tokens ─────────────────────────────────────────────────────────

export async function createRefreshToken(tokenData) {
  const { data, error } = await client()
    .from('refresh_tokens')
    .insert([{
      user_id: tokenData.user_id,
      session_id: tokenData.session_id,
      token_hash: tokenData.token_hash,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + auth.login.refreshTokenExpiryMs).toISOString(),
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getRefreshToken(tokenHash) {
  const { data, error } = await client()
    .from('refresh_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

// Looks up a refresh token regardless of revoked/expired status.
// Used only to detect reuse of an already-revoked token (theft detection).
export async function findRefreshTokenByHash(tokenHash) {
  const { data, error } = await client()
    .from('refresh_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function revokeRefreshToken(tokenHash) {
  const { error } = await client()
    .from('refresh_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', tokenHash);

  if (error) throw error;
}

export async function activateEmployeeInvitation(tokenHash, passwordHash) {
  const { data, error } = await client().rpc('activate_employee_invitation', {
    p_token_hash: tokenHash,
    p_password_hash: passwordHash,
  });
  if (error) throw error;
  return data;
}

// ── Audit Logs ─────────────────────────────────────────────────────────────

/**
 * Creates an audit log entry.
 * Never log passwords, tokens, secrets, or raw personally sensitive data.
 */
export async function createAuditLog(auditData, transaction = null) {
  const record = {
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
  };

  if (transaction) {
    const { rows: [audit] } = await transaction.query(`insert into public.audit_logs
      (user_id, event_type, action, resource_type, resource_id, success,
       error_message, ip_address, user_agent, details, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`, [
      record.user_id, record.event_type, record.action, record.resource_type,
      record.resource_id, record.success, record.error_message, record.ip_address,
      record.user_agent, record.details, record.created_at,
    ]);
    return audit;
  }

  const { error } = await client().from('audit_logs').insert([record]);
  if (error) throw error;
  return null;
}
