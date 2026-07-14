# Requirements Document

## Introduction

Phase 1 Core Authentication for the Jarvis Prime platform. This is the foundational authentication and authorization system that every future module will depend on. It builds upon the existing auth module at `apps/api/src/modules/auth/` and extends it with full RBAC, user management, and hardened session management. The implementation reuses existing Argon2id password hashing, custom JWT signing, Supabase repository layer, and Express middleware patterns already in the codebase.

## Glossary

- **Auth_Service**: The authentication business logic layer at `apps/api/src/modules/auth/auth-service.js` that orchestrates registration, login, logout, password reset, and email verification flows.
- **JWT_Service**: The token creation and verification layer at `apps/api/src/modules/auth/jwt-service.js` that signs and validates HS256 access tokens.
- **Auth_Middleware**: The Express middleware at `apps/api/src/middleware/auth-middleware.js` that extracts Bearer tokens, verifies claims, and populates `req.user`.
- **Authorization_Middleware**: The `createAuthorizationMiddleware()` function in `auth-middleware.js` that checks a user's `role` column value against a required role list on protected routes.
- **User_Service**: The service layer handling user profile retrieval and updates, and user settings management.
- **Session_Manager**: The component responsible for creating, validating, revoking, and rotating sessions and refresh tokens.
- **Rate_Limiter**: The Express middleware that enforces per-endpoint request rate limits to prevent brute-force and abuse.
- **Input_Validator**: The middleware or utility that validates and sanitizes all request bodies, params, and query strings before they reach service logic.
- **Access_Token**: A short-lived (15-minute) JWT issued on login and refresh, used to authenticate API requests.
- **Refresh_Token**: A long-lived (30-day) opaque token stored as a SHA-256 hash in the database, used to obtain new Access_Tokens without re-authenticating.
- **Role**: A named authorization level (super_admin, admin, employee, client) stored directly as a `role text` column on the `users` table, defaulting to `client`.

## Requirements

### Requirement 1: User Registration

**User Story:** As a new user, I want to create an account with my email and password, so that I can access the Jarvis Prime platform.

#### Acceptance Criteria

1. WHEN a valid registration request is received at POST /auth/register, THE Auth_Service SHALL create a new user record with a hashed password and status `pending_verification`.
2. WHEN a registration request is received, THE Input_Validator SHALL reject the request with HTTP 400 if the email format is invalid or the password does not meet minimum complexity (12 characters, uppercase, lowercase, number, special character).
3. WHEN a registration request contains an email that already exists in the users table, THE Auth_Service SHALL return HTTP 409 with error code `EMAIL_EXISTS`.
4. WHEN a user is successfully created, THE Auth_Service SHALL generate an email verification token, store its SHA-256 hash in the `email_verifications` table, and return HTTP 201 with the user ID and a success message.
5. THE Auth_Service SHALL hash passwords using Argon2id with a minimum memory cost of 64 MB, time cost of 2, and parallelism of 4.
6. WHEN more than 3 registration attempts occur from the same IP within 1 hour, THE Rate_Limiter SHALL return HTTP 429.

### Requirement 2: User Login

**User Story:** As a registered user, I want to log in with my email and password, so that I can receive tokens to access protected resources.

#### Acceptance Criteria

1. WHEN valid credentials are submitted to POST /auth/login, THE Auth_Service SHALL verify the password against the stored hash, create a session, issue an Access_Token (15-minute expiry) and a Refresh_Token (30-day expiry), and return HTTP 200.
2. WHEN invalid credentials are submitted, THE Auth_Service SHALL return HTTP 401 with a generic "Invalid email or password" message to prevent user enumeration.
3. WHEN a login request is received for an account with status `pending_verification`, THE Auth_Service SHALL return HTTP 403 with error code `EMAIL_NOT_VERIFIED`.
4. WHEN 5 consecutive failed login attempts occur for a single account, THE Auth_Service SHALL lock the account for 30 minutes and return HTTP 429.
5. WHEN a login succeeds, THE Session_Manager SHALL create a session record in the `sessions` table with the user ID, IP address, user agent, and expiry timestamp.
6. THE Auth_Service SHALL set the Refresh_Token in a secure, HttpOnly, SameSite=Strict cookie and return the Access_Token in the JSON response body.
7. WHEN more than 5 login attempts occur from the same IP within 15 minutes, THE Rate_Limiter SHALL return HTTP 429.

### Requirement 3: User Logout

**User Story:** As a logged-in user, I want to log out, so that my session and tokens are invalidated.

#### Acceptance Criteria

1. WHEN an authenticated request is received at POST /auth/logout, THE Session_Manager SHALL revoke the current session in the `sessions` table and revoke the associated Refresh_Token.
2. WHEN logout is successful, THE Auth_Service SHALL clear the refresh token cookie and return HTTP 200.
3. IF the request does not contain a valid Access_Token, THEN THE Auth_Middleware SHALL return HTTP 401.

### Requirement 4: Forgot Password

**User Story:** As a user who forgot their password, I want to request a password reset link, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN a valid email is submitted to POST /auth/forgot-password, THE Auth_Service SHALL generate a password reset token, store its SHA-256 hash in the `password_resets` table with a 24-hour expiry, and return HTTP 200 with a generic success message regardless of whether the email exists.
2. THE Auth_Service SHALL return the same HTTP 200 response whether the email is registered or not, to prevent user enumeration.
3. WHEN more than 3 forgot-password requests occur from the same IP within 1 hour, THE Rate_Limiter SHALL return HTTP 429.

### Requirement 5: Reset Password

**User Story:** As a user with a valid reset token, I want to set a new password, so that I can log in again.

#### Acceptance Criteria

1. WHEN a valid reset token and new password are submitted to POST /auth/reset-password, THE Auth_Service SHALL verify the token hash against the `password_resets` table, update the user password hash, mark the token as used, revoke all existing sessions for the user, and return HTTP 200.
2. IF the reset token is expired or already used, THEN THE Auth_Service SHALL return HTTP 400 with error code `INVALID_TOKEN`.
3. WHEN a password reset succeeds, THE Input_Validator SHALL enforce the same password complexity rules as registration (12 characters, uppercase, lowercase, number, special character).
4. WHEN a password reset succeeds, THE Session_Manager SHALL revoke all active sessions and refresh tokens for that user.

### Requirement 6: Email Verification

**User Story:** As a newly registered user, I want to verify my email address, so that my account becomes active.

#### Acceptance Criteria

1. WHEN a valid verification token is submitted, THE Auth_Service SHALL verify the token hash against the `email_verifications` table, update the user status to `active`, mark the token as verified, and return HTTP 200.
2. IF the verification token is expired or already used, THEN THE Auth_Service SHALL return HTTP 400 with error code `INVALID_TOKEN`.
3. THE Auth_Service SHALL set email verification tokens to expire after 7 days.

### Requirement 7: JWT Access Token Management

**User Story:** As a client application, I want short-lived access tokens with embedded claims, so that I can make authenticated requests without hitting the database on every call.

#### Acceptance Criteria

1. THE JWT_Service SHALL sign Access_Tokens using HMAC-SHA256 with a secret loaded from the `JWT_SECRET` environment variable.
2. THE JWT_Service SHALL include the following claims in every Access_Token: `sub` (user ID), `iss` (jarvis-prime), `aud` (jarvis-prime-api), `iat`, `exp`, `email`, `session_id`, `device_id`, and `roles` (array of role names).
3. THE JWT_Service SHALL set Access_Token expiry to 15 minutes from the time of issuance.
4. WHEN an Access_Token signature verification fails, THE Auth_Middleware SHALL return HTTP 401.

### Requirement 8: Refresh Token Rotation

**User Story:** As a client application, I want to use refresh tokens to obtain new access tokens, so that users stay authenticated without re-entering credentials.

#### Acceptance Criteria

1. WHEN a valid refresh token is submitted (via cookie or request body), THE Session_Manager SHALL verify the token hash against the `refresh_tokens` table, issue a new Access_Token and a new Refresh_Token, revoke the old Refresh_Token, and return HTTP 200.
2. IF a revoked Refresh_Token is presented (indicating potential token theft), THEN THE Session_Manager SHALL revoke all refresh tokens and sessions for that user and return HTTP 401.
3. THE Session_Manager SHALL store Refresh_Tokens as SHA-256 hashes in the `refresh_tokens` table, associated with a session ID and user ID.
4. THE Session_Manager SHALL set Refresh_Token expiry to 30 days from the time of issuance.

### Requirement 9: Protected Routes and Authorization Middleware

**User Story:** As a platform developer, I want middleware that verifies tokens and checks roles, so that routes are protected with minimal boilerplate.

#### Acceptance Criteria

1. THE Auth_Middleware SHALL extract the Bearer token from the Authorization header, verify the signature and expiry via JWT_Service, and populate `req.user` with the decoded claims.
2. WHEN a route requires a specific role, THE Authorization_Middleware SHALL check that `req.user.role` matches one of the required roles; if not, it SHALL return HTTP 403.
3. IF the Access_Token is missing or expired, THEN THE Auth_Middleware SHALL return HTTP 401 with error code `TOKEN_EXPIRED` or `MISSING_TOKEN`.

### Requirement 10: Role-Based Access Control (RBAC)

**User Story:** As a platform administrator, I want a simple role system, so that access can be restricted by user type without unnecessary complexity.

#### Acceptance Criteria

1. THE database schema SHALL define a `role text` column on the `users` table with a default value of `client`.
2. THE platform SHALL support four static roles: `super_admin`, `admin`, `employee`, and `client`. These roles are fixed in application code (not database-driven) since Phase 1 does not require runtime-configurable permissions.
3. THE JWT access token SHALL include the user's `role` as a single string claim (not an array), matching the single-role-per-user model.
4. Newly registered users SHALL receive the default role `client` via the `users.role` column default — no separate assignment step or table insert is required.

### Requirement 11: User Profile Management

**User Story:** As an authenticated user, I want to view and update my profile, so that my account information stays current.

#### Acceptance Criteria

1. WHEN an authenticated GET request is received at /users/me, THE User_Service SHALL return the current user profile (id, email, full_name, username, status, roles, created_at, updated_at) with HTTP 200.
2. WHEN an authenticated PATCH request is received at /users/me with valid fields, THE User_Service SHALL update only the allowed fields (full_name, username) and return the updated profile with HTTP 200.
3. THE Input_Validator SHALL reject PATCH /users/me requests containing fields outside the allowed set (full_name, username) with HTTP 400.
4. IF the request does not contain a valid Access_Token, THEN THE Auth_Middleware SHALL return HTTP 401.

### Requirement 12: User Settings Management

**User Story:** As an authenticated user, I want to view and update my preferences, so that the platform behaves according to my choices.

#### Acceptance Criteria

1. WHEN an authenticated GET request is received at /settings, THE User_Service SHALL return the current user settings (notification preferences, timezone, language) with HTTP 200.
2. WHEN an authenticated PATCH request is received at /settings with valid fields, THE User_Service SHALL update the user settings and return the updated settings with HTTP 200.
3. THE User_Service SHALL store settings as a JSONB column on the users table, defaulting to `{}` for new users.
4. IF the request does not contain a valid Access_Token, THEN THE Auth_Middleware SHALL return HTTP 401.

### Requirement 13: Session Management

**User Story:** As an authenticated user, I want my sessions tracked and manageable, so that I can see active devices and revoke sessions if compromised.

#### Acceptance Criteria

1. WHEN a user logs in, THE Session_Manager SHALL create a session record containing user_id, ip_address, user_agent, device_id, created_at, last_activity_at, and expires_at.
2. THE Session_Manager SHALL update `last_activity_at` on the session record when a valid request is processed (no more frequently than once per minute to limit write load).
3. WHEN a session expires (24-hour absolute timeout or 1-hour idle timeout), THE Auth_Middleware SHALL return HTTP 401 with error code `SESSION_EXPIRED`.
4. WHEN a user logs out, THE Session_Manager SHALL mark the session as revoked with a `revoked_at` timestamp and reason `user_logout`.

### Requirement 14: Security Headers and Transport

**User Story:** As a platform operator, I want all API responses to include security headers, so that common web vulnerabilities are mitigated.

#### Acceptance Criteria

1. THE API SHALL apply Helmet security headers to all responses (X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, X-XSS-Protection).
2. THE API SHALL configure CORS to allow only origins specified in the `CORS_ORIGINS` environment variable.
3. THE API SHALL serve all cookies with the `Secure`, `HttpOnly`, and `SameSite=Strict` flags.
4. THE API SHALL load all secrets (JWT_SECRET, DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) from environment variables and reject startup if any required secret is missing.

### Requirement 15: Input Validation

**User Story:** As a platform developer, I want all endpoint inputs validated and sanitized, so that malformed or malicious data cannot reach the service layer.

#### Acceptance Criteria

1. THE Input_Validator SHALL validate request bodies for all auth and user endpoints against a defined schema before passing to the service layer.
2. WHEN validation fails, THE Input_Validator SHALL return HTTP 400 with a structured error containing the field name and violation description.
3. THE Input_Validator SHALL trim string inputs and reject payloads exceeding 2 MB.

### Requirement 16: Database Schema for Auth Tables

**User Story:** As a platform developer, I want a well-defined schema for auth tables, so that user data, sessions, and tokens are stored securely and efficiently.

#### Acceptance Criteria

1. THE database schema SHALL define the following tables: `users`, `sessions`, `refresh_tokens`, `email_verification_tokens`, `password_resets`, `audit_logs`, `password_history`.
2. THE `users` table SHALL include columns: id (uuid PK), email (unique), email_normalized (unique), username (unique), full_name, password_hash, status, role (default `client`), email_verified_at, failed_login_attempts, last_failed_login_at, account_locked_until, created_at, updated_at.
3. THE `sessions` table SHALL include columns: id (uuid PK), user_id (FK), device_id, device_name, ip_address, user_agent, created_at, last_activity_at, expires_at, revoked_at, revoked_reason.
4. THE `refresh_tokens` table SHALL include columns: id (uuid PK), user_id (FK), session_id (FK), token_hash (unique), expires_at, revoked_at, created_at.
5. THE `email_verification_tokens` table SHALL include columns: id (uuid PK), user_id (FK), token_hash, attempts, expires_at, verified_at, verification_ip, created_at.
6. THE `password_resets` table SHALL include columns: id (uuid PK), user_id (FK), token_hash, attempts, expires_at, used_at, used_ip, created_at.
7. THE database schema SHALL enable Row Level Security on all auth tables with no client-facing policies (fail-secure); the service role bypasses RLS for all server-side access.
