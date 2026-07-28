// Cryptographic utilities for secure authentication
// Includes hashing, token generation, encryption, and secure comparison

import crypto from 'node:crypto';
import { scryptSync } from 'node:crypto';
import { auth } from './constants.js';

// For Argon2id hashing (when available via native module or external package)
let argon2 = null;
try {
  argon2 = (await import('argon2')).default;
} catch {
  // Fallback to scrypt if argon2 not available
}

/**
 * Hashes a password using Argon2id (or scrypt fallback)
 * Never stores plaintext passwords.
 * 
 * Security notes:
 * - Argon2id is OWASP recommended (resistant to GPU/ASIC attacks)
 * - Scrypt is used as fallback with high work factor
 * - Never return hash timing information to prevent timing attacks
 * 
 * @param {string} password - Raw password (max 128 chars)
 * @returns {Promise<string>} Hash suitable for storage
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  if (password.length < auth.password.minLength
    || password.length > auth.password.maxLength) {
    throw new Error(
      `Password must be ${auth.password.minLength}-${auth.password.maxLength} characters`
    );
  }

  if (argon2) {
    // Argon2id: 2 iterations, 19 parallelism, 65MB memory
    return await argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: 2,
      memoryCost: 65536, // 64 MB
      parallelism: 4,
    });
  }

  // Fallback: scrypt with high work factor
  // scrypt is OWASP approved and built into Node.js
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64, {
    N: 16384,  // CPU/memory cost
    r: 8,
    p: 1,
  });
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a password against a stored hash
 * Constant-time comparison prevents timing attacks
 * 
 * @param {string} password - Raw password to verify
 * @param {string} hash - Stored hash from database
 * @returns {Promise<boolean>} True if password matches
 */
export async function verifyPassword(password, hash) {
  if (!password || !hash) return false;

  if (argon2 && hash.startsWith('$argon2')) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  if (hash.startsWith('scrypt:')) {
    try {
      const [, salt, storedKey] = hash.split(':');
      const derivedKey = scryptSync(password, salt, 64, {
        N: 16384,
        r: 8,
        p: 1,
      });
      // Constant-time comparison
      return crypto.timingSafeEqual(
        Buffer.from(storedKey, 'hex'),
        derivedKey
      );
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Generates a cryptographically secure random token
 * Used for email verification, password reset, etc.
 * 
 * @param {number} lengthBytes - Length in bytes (default 32 = 256 bits)
 * @returns {string} URL-safe base64 token
 */
export function generateToken(lengthBytes = 32) {
  const token = crypto.randomBytes(lengthBytes).toString('base64url');
  return token;
}

/**
 * Hashes a token for secure storage in database
 * Never store plaintext tokens
 * 
 * @param {string} token - Raw token
 * @returns {string} SHA-256 hash of token
 */
export function hashToken(token) {
  if (!token) throw new Error('Token is required');
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Validates that a token matches its stored hash
 * Constant-time comparison
 * 
 * @param {string} token - Raw token to verify
 * @param {string} storedHash - Hash from database
 * @returns {boolean} True if token matches
 */
export function verifyTokenHash(token, storedHash) {
  if (!token || !storedHash) return false;
  
  try {
    const tokenHash = hashToken(token);
    return crypto.timingSafeEqual(
      Buffer.from(tokenHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Sanitizes email for safe storage and comparison
 * Normalizes case, trims whitespace
 * 
 * @param {string} email - Raw email
 * @returns {string} Normalized email
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.toLowerCase().trim();
}

/**
 * Validates email format (simple check, full validation in schema)
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} True if format looks valid
 */
export function isValidEmailFormat(email) {
  if (!email || typeof email !== 'string') return false;
  // Simple regex, database constraint enforces strict validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
