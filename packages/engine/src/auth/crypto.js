// Cryptographic utilities for secure authentication
// Includes hashing, token generation, encryption, and secure comparison

import crypto from 'node:crypto';
import { createHmac, scryptSync } from 'node:crypto';

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

  if (password.length < 12 || password.length > 128) {
    throw new Error('Password must be 12-128 characters');
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
 * Generates a TOTP secret for MFA setup
 * Returns both secret and QR code URL
 * 
 * @param {string} userEmail - User's email for TOTP label
 * @param {string} issuer - Issuer name for authenticator app
 * @returns {object} { secret, qrCodeUrl }
 */
export function generateTotpSecret(userEmail, issuer = 'JARVIS PRIME') {
  // TOTP secret: 32 bytes = 256 bits (recommended)
  const secret = crypto.randomBytes(20).toString('base64');
  
  // Standard TOTP label format: issuer (email)
  const label = `${issuer} (${userEmail})`;
  const encodedLabel = encodeURIComponent(label);
  const encodedSecret = encodeURIComponent(secret);
  
  // QR code URL for Google Authenticator, Authy, Microsoft Authenticator, etc.
  const qrCodeUrl = `otpauth://totp/${encodedLabel}?secret=${encodedSecret}&issuer=${encodeURIComponent(issuer)}`;
  
  return { secret, qrCodeUrl };
}

/**
 * Encrypts sensitive data (TOTP secrets, recovery codes)
 * Uses AES-256-GCM with authenticated encryption
 * 
 * @param {string} plaintext - Data to encrypt
 * @param {string} encryptionKey - 32-byte hex key (from env)
 * @returns {string} JSON with iv, authTag, ciphertext (all hex)
 */
export function encryptSensitiveData(plaintext, encryptionKey) {
  if (!plaintext || !encryptionKey) {
    throw new Error('Plaintext and encryption key are required');
  }

  const key = Buffer.from(encryptionKey, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (256 bits)');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let ciphertext = cipher.update(plaintext, 'utf-8', 'hex');
  ciphertext += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return JSON.stringify({
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext,
  });
}

/**
 * Decrypts sensitive data
 * Verifies authentication tag to detect tampering
 * 
 * @param {string} encrypted - JSON string from encryptSensitiveData
 * @param {string} encryptionKey - 32-byte hex key (from env)
 * @returns {string} Decrypted plaintext
 * @throws {Error} If decryption fails or data is tampered
 */
export function decryptSensitiveData(encrypted, encryptionKey) {
  if (!encrypted || !encryptionKey) {
    throw new Error('Encrypted data and encryption key are required');
  }

  const key = Buffer.from(encryptionKey, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (256 bits)');
  }

  const { iv: ivHex, authTag: authTagHex, ciphertext } = JSON.parse(encrypted);
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(ciphertext, 'hex', 'utf-8');
  plaintext += decipher.final('utf-8');
  
  return plaintext;
}

/**
 * Generates recovery codes for MFA backup
 * 8 codes, 8 characters each (alphanumeric)
 * 
 * @param {number} count - Number of codes to generate
 * @returns {array<string>} Recovery codes
 */
export function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // Generate random code: 8 alphanumeric characters
    const code = crypto
      .randomBytes(6)
      .toString('base64url')
      .substring(0, 8)
      .toUpperCase();
    codes.push(code);
  }
  return codes;
}

/**
 * Creates a device fingerprint from request metadata
 * Used for session tracking and security
 * 
 * @param {object} metadata - { userAgent, ipAddress, acceptLanguage }
 * @returns {string} SHA-256 fingerprint
 */
export function createDeviceFingerprint(metadata) {
  const { userAgent = '', ipAddress = '', acceptLanguage = '' } = metadata;
  const combined = `${userAgent}|${ipAddress}|${acceptLanguage}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * HMAC signing for API requests (future: webhook signatures)
 * 
 * @param {string} payload - Data to sign
 * @param {string} secret - Signing secret
 * @returns {string} HMAC-SHA256 signature (hex)
 */
export function signPayload(payload, secret) {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verifies HMAC signature
 * Constant-time comparison
 * 
 * @param {string} payload - Original data
 * @param {string} signature - Signature to verify
 * @param {string} secret - Signing secret
 * @returns {boolean} True if signature is valid
 */
export function verifySignature(payload, signature, secret) {
  try {
    const expected = signPayload(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
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
