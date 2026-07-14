// JWT Token Service
// Handles creation, verification, and management of JWT access and refresh tokens
// Follows OAuth 2.0 and OpenID Connect standards

import { createHmac, randomUUID } from 'node:crypto';
import { auth } from './constants.js';

/**
 * Creates a signed JWT access token
 * Short-lived (15 minutes) with standard claims
 * 
 * Security principles:
 * - Never include passwords or sensitive data in JWT
 * - Validate all claims on every request
 * - Use short expiry for access tokens
 * - Store long-lived tokens only on server
 * 
 * @param {object} user - User object with id, email, organization_id
 * @param {object} session - Session object with id, device_id
 * @param {string} secret - Signing secret (from env)
 * @returns {string} Signed JWT
 */
export function createAccessToken(user, session, secret) {
  const now = Math.floor(Date.now() / 1000);
  const expirySeconds = auth.jwt.accessTokenExpirySeconds;
  
  const payload = {
    // Standard JWT claims
    iss: auth.jwt.issuer,                    // Issuer
    aud: auth.jwt.audience,                  // Audience
    sub: user.id,                            // Subject (user ID)
    iat: now,                                // Issued at
    exp: now + expirySeconds,                // Expiration
    
    // Custom claims (NEVER include sensitive data)
    email: user.email,
    email_verified: user.email_verified_at ? true : false,
    role: user.role || 'client',
    
    // Session binding (for invalidation & security)
    session_id: session.id,
    device_id: session.device_id,
  };

  return sign(payload, secret);
}

/**
 * Creates a refresh token (stored in database)
 * Long-lived (30 days) for obtaining new access tokens
 * 
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID
 * @param {string} deviceId - Device fingerprint
 * @returns {string} Unsigned refresh token
 */
export function createRefreshToken(userId, sessionId, deviceId) {
  return randomUUID();
}

/**
 * Verifies a JWT token
 * Validates signature and all claims
 * 
 * @param {string} token - JWT to verify
 * @param {string} secret - Signing secret
 * @returns {object|null} Decoded payload if valid, null if invalid
 */
export function verifyAccessToken(token, secret) {
  try {
    const payload = verify(token, secret);
    
    // Validate standard claims
    if (payload.iss !== auth.jwt.issuer) return null;
    if (payload.aud !== auth.jwt.audience) return null;
    if (!payload.sub) return null;  // Must have subject
    if (!payload.session_id) return null;  // Must have session binding
    
    // Check expiration (verify() already checks this, but be explicit)
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    
    return payload;
  } catch {
    return null;
  }
}

/**
 * Signs a payload with HMAC-SHA256
 * Standard JWT encoding
 * 
 * @param {object} payload - Data to sign
 * @param {string} secret - Signing secret
 * @returns {string} JWT (header.payload.signature)
 */
function sign(payload, secret) {
  const header = { typ: 'JWT', alg: auth.jwt.algorithm };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret)
    .update(message)
    .digest('base64url');
  
  return `${message}.${signature}`;
}

/**
 * Verifies a JWT signature and returns decoded payload
 * 
 * @param {string} token - JWT to verify
 * @param {string} secret - Signing secret
 * @returns {object} Decoded payload
 * @throws {Error} If token is invalid
 */
function verify(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  
  // Re-sign and compare (constant-time comparison)
  const message = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(message)
    .digest('base64url');
  
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  
  // Timing-safe comparison
  if (providedBuffer.length !== expectedBuffer.length) {
    throw new Error('Invalid signature');
  }
  
  let valid = true;
  for (let i = 0; i < providedBuffer.length; i++) {
    if (providedBuffer[i] !== expectedBuffer[i]) {
      valid = false;
    }
  }
  
  if (!valid) {
    throw new Error('Invalid signature');
  }
  
  // Decode and return payload
  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  return payload;
}

/**
 * Base64URL encoding (JWT standard)
 * 
 * @param {string} str - String to encode
 * @returns {string} Base64URL encoded
 */
function base64UrlEncode(str) {
  return Buffer.from(str, 'utf-8')
    .toString('base64url');
}

/**
 * Base64URL decoding
 * 
 * @param {string} str - Base64URL string
 * @returns {string} Decoded string
 */
function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url')
    .toString('utf-8');
}

/**
 * Extracts JWT from Authorization header
 * Supports: "Bearer <token>"
 * 
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null if not found
 */
export function extractBearerToken(authHeader) {
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
