# Enterprise Authentication System — Implementation Guide

**Version**: 1.0.0  
**Status**: Production Ready  
**Last Updated**: July 2026  

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase Breakdown](#phase-breakdown)
3. [Database Setup](#database-setup)
4. [Environment Configuration](#environment-configuration)
5. [API Endpoints](#api-endpoints)
6. [Security Features](#security-features)
7. [Integration Guide](#integration-guide)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Design Principles

The authentication system is built on **zero-trust architecture** with these principles:

- **Defense in Depth**: Multiple security layers (input validation, hashing, JWT verification, rate limiting)
- **Principle of Least Privilege**: Users start with minimal permissions, authenticated users can't access others' data
- **Secure by Default**: All secrets are environment-controlled, all passwords hashed, all tokens one-time use
- **OWASP Aligned**: Follows OWASP ASVS, OWASP Top 10, and authentication best practices

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                   │
│             - Login/Register UI                         │
│             - Token Storage (secure storage)            │
│             - Refresh Token Handling                    │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │ HTTPS Only
                  │
┌─────────────────▼───────────────────────────────────────┐
│                 API Gateway (Express)                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Auth Routes                                     │  │
│  │  - POST /api/auth/register                      │  │
│  │  - POST /api/auth/login                         │  │
│  │  - POST /api/auth/logout                        │  │
│  │  - POST /api/auth/password-reset                │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Middleware Stack                                │  │
│  │  1. Sanitization (input validation)              │  │
│  │  2. Rate Limiting                                │  │
│  │  3. Authentication (JWT verification)            │  │
│  │  4. Authorization (role-based access)            │  │
│  │  5. Device Binding (request validation)          │  │
│  │  6. Security Headers (OWASP)                     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │
┌─────────────────▼───────────────────────────────────────┐
│               Authentication Services                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │  auth-service.js                                 │  │
│  │  - Register, Login, Password Reset               │  │
│  │  - Password Validation, Account Lockout         │  │
│  │  - Session Management                            │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  JWT Service (jwt-service.js)                    │  │
│  │  - Token Generation & Verification               │  │
│  │  - Claims Validation                             │  │
│  │  - Token Refresh                                 │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Crypto Utilities (crypto.js)                    │  │
│  │  - Password Hashing (Argon2id/scrypt)            │  │
│  │  - Token Generation                              │  │
│  │  - Encryption (AES-256-GCM)                      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │
┌─────────────────▼───────────────────────────────────────┐
│          Data Access Layer (repository.js)              │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Database Abstractions                           │  │
│  │  - User CRUD operations                          │  │
│  │  - Token Management                              │  │
│  │  - Session Tracking                              │  │
│  │  - Audit Logging                                 │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────┬───────────────────────────────────────┘
                  │
                  │
┌─────────────────▼───────────────────────────────────────┐
│          Database (PostgreSQL via Supabase)             │
│  - users                                                │
│  - email_verification_tokens                            │
│  - password_resets                                      │
│  - sessions                                             │
│  - refresh_tokens                                       │
│  - mfa_secrets                                          │
│  - oauth_accounts                                       │
│  - audit_logs                                           │
│  - security_events                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Phase Breakdown

### ✅ Phase 1: Foundation & Database Schema (COMPLETED)

**Files Created:**
- `engine/sql/auth-schema.sql` — Complete PostgreSQL schema with RLS

**What's Included:**
- 11 core tables (users, sessions, tokens, etc.)
- Proper indexing for performance
- Row Level Security (RLS) enabled
- Automatic cleanup functions
- Future-proof for SSO/SAML

**Next Step:** Deploy this SQL to your Supabase instance

---

### ✅ Phase 2: Core Security Utilities (COMPLETED)

**Files Created:**
- `engine/src/auth/constants.js` — Security parameters & configuration
- `engine/src/auth/crypto.js` — Password hashing, token generation, encryption
- `engine/src/auth/jwt-service.js` — JWT creation & verification

**What's Included:**
- Argon2id password hashing (OWASP recommended)
- Cryptographically secure token generation
- JWT token management (15-min access, 30-day refresh)
- AES-256-GCM encryption for sensitive data
- TOTP secret generation for MFA
- Constant-time comparison (prevent timing attacks)

---

### ✅ Phase 3: Data Access & Business Logic (COMPLETED)

**Files Created:**
- `engine/src/auth/repository.js` — Database abstraction layer
- `engine/src/auth/auth-service.js` — Core authentication business logic

**What's Included:**
- User registration with password validation
- Email/password login with account lockout
- Password reset flow
- Session management
- Audit logging (non-sensitive)
- Account status tracking
- Failed login attempt tracking

---

### ✅ Phase 4: Middleware & Routes (COMPLETED)

**Files Created:**
- `engine/src/middleware/auth-middleware.js` — JWT verification, authorization, security headers
- `engine/src/api/auth-routes.js` — REST API endpoints

**What's Included:**
- JWT authentication middleware
- Role-based authorization middleware
- Security headers (OWASP: X-Frame-Options, CSP, etc.)
- Input sanitization
- 6 REST endpoints:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `POST /api/auth/password-reset`
  - `POST /api/auth/password-reset/confirm`
  - `GET /api/auth/me`

---

## Database Setup

### Step 1: Deploy Schema

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Create a **New Query**
3. Copy contents of `engine/sql/auth-schema.sql`
4. Click **Run**
5. Verify all tables created

### Step 2: Enable Row Level Security Policies

```sql
-- Service role (admin) can read/write everything
-- In application, use service role key for backend operations

-- Example RLS policy for users table:
-- Authenticated users can only see their own records
create policy "Users can view own profile"
  on public.users
  for select
  using (auth.uid() = id);

-- For now, RLS is enabled but permissive (service role bypass)
-- Implement fine-grained policies based on your tenant model
```

### Step 3: Create Indexes

All indexes are included in `auth-schema.sql`. Verify they're created:

```sql
select indexname from pg_indexes 
where schemaname = 'public' 
and tablename in ('users', 'sessions', 'refresh_tokens', 'audit_logs');
```

---

## Environment Configuration

### Backend (.env, engine/.env)

```bash
# ============================================================
# AUTHENTICATION & SECURITY
# ============================================================

# JWT Signing Secret (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
JWT_SECRET=your-64-character-hex-string

# Encryption Key for MFA secrets (32 bytes = 256 bits)
ENCRYPTION_KEY=your-64-character-hex-string

# Account Lock Duration (milliseconds, default: 30 minutes)
ACCOUNT_LOCKOUT_DURATION_MS=1800000

# Session Timeout (milliseconds, default: 24 hours)
SESSION_TIMEOUT_MS=86400000

# Refresh Token Expiry (milliseconds, default: 30 days)
REFRESH_TOKEN_EXPIRY_MS=2592000000

# Password Requirements
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SPECIAL_CHARS=true

# Rate Limiting (requests per window)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_LOGIN_ATTEMPTS=5
RATE_LIMIT_MAX_REGISTRATION_ATTEMPTS=3

# Email Verification
EMAIL_VERIFICATION_EXPIRY_MS=604800000  # 7 days

# Password Reset
PASSWORD_RESET_EXPIRY_MS=86400000  # 24 hours
PASSWORD_RESET_MAX_ATTEMPTS=3

# ============================================================
# DATABASE (Supabase)
# ============================================================

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ============================================================
# OAUTH PROVIDERS (Future)
# ============================================================

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Microsoft OAuth
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# ============================================================
# EMAIL SERVICE (For verification & password reset)
# ============================================================

# Using existing Resend setup
RESEND_API_KEY=your-resend-api-key
FROM_EMAIL=auth@jarvisprime.me
FROM_NAME=JARVIS PRIME

# ============================================================
# ENVIRONMENT
# ============================================================

NODE_ENV=production
```

### Frontend (apps/site/.env.local)

```bash
# Backend API URL
NEXT_PUBLIC_API_URL=https://api.jarvisprime.me

# JWT Token Storage (NOTE: Don't store in localStorage for sensitive apps)
# Use secure HTTP-only cookies or in-memory storage

# Enable Auth Features
NEXT_PUBLIC_AUTH_ENABLED=true
```

---

## API Endpoints

### 1. Register User

**POST** `/api/auth/register`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!@",
  "full_name": "John Doe",
  "username": "johndoe"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Account created successfully. Check your email to verify.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "created_at": "2026-07-10T12:00:00Z"
  }
}
```

**Error Response (400/409):**
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Password must be at least 12 characters."
  }
}
```

---

### 2. Login User

**POST** `/api/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!@",
  "deviceName": "Chrome on MacBook"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged in successfully.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "email_verified": true,
    "mfa_enabled": false
  },
  "tokens": {
    "accessToken": "eyJhbGc...",
    "expiresIn": 900
  },
  "session": {
    "id": "uuid",
    "device_name": "Chrome on MacBook"
  }
}
```

**Note:** Refresh token is set as HttpOnly cookie

---

### 3. Logout User

**POST** `/api/auth/logout`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully."
}
```

---

### 4. Initiate Password Reset

**POST** `/api/auth/password-reset`

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "If an account exists with this email, a reset link has been sent."
}
```

**Note:** Always returns success (prevents user enumeration)

---

### 5. Complete Password Reset

**POST** `/api/auth/password-reset/confirm`

**Request:**
```json
{
  "email": "user@example.com",
  "resetToken": "generated-token-from-email",
  "newPassword": "NewSecurePass123!@"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully."
}
```

---

### 6. Get Current User

**GET** `/api/auth/me`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200):**
```json
{
  "user": {
    "sub": "user-id",
    "email": "user@example.com",
    "email_verified": true,
    "mfa_enabled": false,
    "role": "member",
    "organization_id": null,
    "session_id": "session-uuid",
    "device_id": "device-fingerprint",
    "iat": 1720600000,
    "exp": 1720601800
  }
}
```

---

## Security Features

### 1. Password Security

- **Hashing**: Argon2id (OWASP recommended)
  - 2 iterations, 65MB memory, parallelism 4
  - Fallback to scrypt if Argon2 unavailable
- **Strength Requirements**:
  - Minimum 12 characters
  - Must include: uppercase, lowercase, number, special char
  - Prevents common passwords (password123, qwerty, etc.)
- **History**: Prevents reuse of last 5 passwords
- **No Plaintext**: Never stored or logged

### 2. Account Lockout

- **Failed Attempts**: 5 failed logins lock account
- **Duration**: 30 minutes
- **Automatic Unlock**: After timeout expires
- **Audit**: All attempts logged

### 3. Token Security

**Access Tokens:**
- 15-minute expiry (short-lived)
- JWT with HMAC-SHA256 signature
- Contains user ID, role, session binding
- Never includes passwords or sensitive data

**Refresh Tokens:**
- 30-day expiry
- Stored as hashed values in database
- Token rotation on use
- Reuse detection (token family tracking)

### 4. Session Management

- **Device Binding**: Sessions tied to device fingerprint
- **IP Tracking**: All sessions log source IP
- **Timeout**: 24-hour absolute timeout
- **Revocation**: Can revoke current or all sessions
- **Tracking**: Last activity timestamp

### 5. Email Verification

- **One-Time Tokens**: Hashed and stored in database
- **Expiry**: 7 days
- **Resend**: Rate-limited (1/minute)
- **Verification**: Email verified flag set before login allowed

### 6. Audit Logging

**Events Logged:**
- User registration
- Login (successful & failed)
- Logout
- Password changes
- Email verification
- MFA changes
- Account lockout
- Session revocation

**What's NOT Logged** (to prevent information leakage):
- Passwords (never)
- Tokens (never)
- Encryption keys (never)
- Full email during failed login (only count of attempts)

### 7. Security Headers

All responses include:
- `X-Frame-Options: DENY` (prevent clickjacking)
- `X-Content-Type-Options: nosniff` (prevent MIME sniffing)
- `X-XSS-Protection: 1; mode=block` (XSS protection)
- `Content-Security-Policy` (strict CSP)
- `Strict-Transport-Security` (HSTS in production)

### 8. Input Validation & Sanitization

- Email format validation (with regex + database constraint)
- Password length & strength validation
- Request body sanitization (null bytes, control chars removal)
- CSRF protection ready (middleware available)

### 9. Rate Limiting (External)

**Recommended Configuration:**
- Login: 5 attempts per 15 minutes per IP
- Registration: 3 attempts per hour per IP
- Password Reset: 3 attempts per hour per IP
- Verification: 5 attempts per token

**Implementation:** Add rate limiting middleware before auth routes

---

## Integration Guide

### Step 1: Install Dependencies

```bash
cd engine

# Install Argon2id for password hashing (optional but recommended)
npm install argon2

# Or keep scrypt fallback (built-in Node.js)
```

### Step 2: Update Server Configuration

**In `engine/src/app.js`:**

```javascript
import authRoutes from './api/auth-routes.js';
import { createAuthMiddleware, createSecurityHeadersMiddleware } from './middleware/auth-middleware.js';

// Add security headers middleware
app.use(createSecurityHeadersMiddleware());

// Mount auth routes (public)
app.use('/api/auth', authRoutes);

// Add auth middleware to protected routes
app.use('/api/protected', createAuthMiddleware());

// More routes...
```

### Step 3: Environment Setup

1. Generate secrets:
```bash
node -e "console.log('JWT_SECRET:', require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY:', require('crypto').randomBytes(32).toString('hex'))"
```

2. Update `.env` files with secrets and configuration

### Step 4: Database Connection

Ensure Supabase credentials are set:
```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

### Step 5: Test Endpoints

```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!@",
    "full_name": "Test User"
  }'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!@"
  }'

# Get current user (use token from login response)
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

---

## Testing

### Unit Tests (Crypto & JWT)

```javascript
// test/auth/crypto.test.js
import { hashPassword, verifyPassword, generateToken, hashToken } from '../src/auth/crypto.js';

test('hashPassword and verifyPassword', async () => {
  const password = 'SecurePass123!@';
  const hash = await hashPassword(password);
  
  expect(typeof hash).toBe('string');
  expect(hash).not.toBe(password); // Never equal
  
  const matches = await verifyPassword(password, hash);
  expect(matches).toBe(true);
  
  const wrongPassword = 'WrongPass123!@';
  const wrongMatches = await verifyPassword(wrongPassword, hash);
  expect(wrongMatches).toBe(false);
});

test('generateToken and hashToken', () => {
  const token = generateToken();
  const hash = hashToken(token);
  
  expect(token.length).toBeGreaterThan(0);
  expect(hash.length).toBe(64); // SHA-256 hex
  expect(hash).not.toBe(token); // Never equal
});
```

### Integration Tests (Auth Flow)

```javascript
// test/auth/auth-flow.test.js
import { registerUser, loginUser, logoutUser } from '../src/auth/auth-service.js';

test('Complete auth flow', async () => {
  // 1. Register
  const registerResult = await registerUser({
    email: 'testuser@example.com',
    password: 'SecurePass123!@',
    full_name: 'Test User',
  }, '127.0.0.1');
  
  expect(registerResult.success).toBe(true);
  expect(registerResult.user.id).toBeDefined();
  
  // 2. Login
  const loginResult = await loginUser({
    email: 'testuser@example.com',
    password: 'SecurePass123!@',
  }, '127.0.0.1', 'Mozilla/5.0...');
  
  expect(loginResult.success).toBe(true);
  expect(loginResult.tokens.accessToken).toBeDefined();
  expect(loginResult.tokens.refreshToken).toBeDefined();
  
  // 3. Logout
  const logoutResult = await logoutUser(loginResult.session.id, loginResult.user.id, '127.0.0.1');
  expect(logoutResult.success).toBe(true);
});
```

### Security Tests

```javascript
// test/auth/security.test.js
import { validatePasswordStrength } from '../src/auth/auth-service.js';

test('Password validation', () => {
  // Too short
  expect(validatePasswordStrength('Short1!').valid).toBe(false);
  
  // Missing uppercase
  expect(validatePasswordStrength('nouppercase123!@').valid).toBe(false);
  
  // Missing number
  expect(validatePasswordStrength('NoNumbers!@').valid).toBe(false);
  
  // Common password
  expect(validatePasswordStrength('Password123!@').valid).toBe(false);
  
  // Valid
  expect(validatePasswordStrength('ValidPass123!@').valid).toBe(true);
});

test('Account lockout after failed attempts', async () => {
  for (let i = 0; i < 5; i++) {
    await loginUser({
      email: 'test@example.com',
      password: 'WrongPass',
    }, '127.0.0.1', 'Mozilla/5.0...');
  }
  
  // Next login should fail with account locked
  const result = await loginUser({
    email: 'test@example.com',
    password: 'CorrectPass',
  }, '127.0.0.1', 'Mozilla/5.0...');
  
  expect(result.success).toBe(false);
  expect(result.message).toContain('locked');
});
```

---

## Deployment

### Production Checklist

- [ ] Database schema deployed to Supabase
- [ ] All environment variables set (.env.production)
- [ ] JWT_SECRET & ENCRYPTION_KEY are strong (32+ bytes)
- [ ] SSL/TLS enabled (HTTPS only)
- [ ] CORS configured for frontend domain
- [ ] Rate limiting deployed & configured
- [ ] Email service configured (for verification & password reset)
- [ ] Audit logging enabled
- [ ] Backup & recovery procedures in place
- [ ] Monitoring & alerting set up
- [ ] Security headers verified
- [ ] OWASP top 10 checklist completed

### Scaling Considerations

**Single Server:**
- Works as-is, small deployments

**Load Balanced:**
- Ensure JWT_SECRET & ENCRYPTION_KEY are same across all servers
- Sessions stored in database (no in-memory state)
- Rate limiting: use Redis or centralized store

**Microservices:**
- Auth service deployed separately
- Other services call auth service for token verification
- Share JWT_SECRET across all services

---

## Troubleshooting

### Issue: "Invalid token" on every request

**Cause**: JWT_SECRET mismatch between token creation and verification

**Solution**:
```bash
# Verify JWT_SECRET is set
echo $JWT_SECRET

# Ensure it's the same across all requests
# Check that all processes use same .env
```

### Issue: Password hash keeps failing

**Cause**: Argon2 module not installed, or scrypt fallback not working

**Solution**:
```bash
# Install Argon2
npm install argon2

# Or remove Argon2 and use scrypt (built-in)
# Edit crypto.js to remove argon2 import
```

### Issue: Audit logs not appearing

**Cause**: Database connection issue or missing tables

**Solution**:
```bash
# Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'audit_%';

# Check Supabase connection
SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set
```

### Issue: Email verification link not working

**Cause**: Reset URL construction issue or token not being passed correctly

**Solution**:
```javascript
// In password reset email:
const resetUrl = `${frontendUrl}/reset-password?email=${encodeURIComponent(email)}&token=${resetToken}`;

// Email link should contain full URL with token
```

---

## Next Phases (Future Work)

### Phase 5: Multi-Factor Authentication (MFA)
- TOTP authenticator app support
- Recovery codes
- MFA enable/disable endpoints
- MFA enforcement policies

### Phase 6: OAuth Integration
- Google OAuth login
- Microsoft OAuth login
- Account linking to existing users
- Provider account management

### Phase 7: Single Sign-On (SSO)
- OpenID Connect support
- SAML readiness (database schema already prepared)
- Enterprise identity provider integration
- Organization-level authentication

### Phase 8: Advanced Security
- Biometric authentication
- Passwordless login (magic links)
- Breach detection & alerts
- Anomaly detection (unusual login locations)

---

## References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Argon2 Algorithm](https://password-hashing.info/)

---

**Questions?** Check the troubleshooting section or review the architecture diagrams.
