# Technical Design

## Overview

Phase 1 Core Authentication extends the existing `apps/api/src/modules/auth/` module to add user profile/settings endpoints, refresh token rotation with theft detection, and per-endpoint rate limiting. Authorization is handled by the existing single `role` column — no RBAC tables or service. The design maximizes reuse of existing code (auth-service.js, jwt-service.js, crypto.js, repository.js, constants.js, auth-middleware.js, rate-limiter.js, validate.js) and adds only what's missing.

**Key architectural decision**: The existing auth module already implements ~70% of Phase 1 (register, login, logout, password reset, sessions, JWT). Authorization uses a single `role text` column on `users` (no roles/permissions tables — rejected as unnecessary complexity for 4 static roles). The remaining work is: (1) add `/users/me` PATCH and `/settings` endpoints, (2) implement refresh token rotation, (3) add per-endpoint rate limiting to auth routes.

## Architecture

### System Context

```
[Browser/App] → HTTPS → [Express API at apps/api/]
                              │
                        [Auth Routes]
                    (register/login/logout/
                     password reset/refresh/
                     me/settings)
                              │
                        [Auth Service]
                              │
                        [Repository]
                              │
                    [Supabase PostgreSQL]
```

### Component Diagram

```
apps/api/src/
├── modules/
│   ├── auth/                    # EXISTING — extend
│   │   ├── auth-service.js      # MODIFY: refresh token rotation (rotateRefreshToken)
│   │   ├── auth.routes.js       # MODIFY: add rate limiters, real /auth/refresh, /users/me PATCH, /settings
│   │   ├── jwt-service.js       # NO CHANGE (role is already a single string claim)
│   │   ├── repository.js        # MODIFY: add revokeRefreshToken, findRefreshTokenByHash
│   │   ├── constants.js         # NO CHANGE
│   │   └── crypto.js            # NO CHANGE
├── middleware/
│   ├── auth-middleware.js       # NO CHANGE (createAuthorizationMiddleware already checks role)
│   ├── rate-limiter.js          # NO CHANGE (already supports per-endpoint config)
│   └── validate.js              # NO CHANGE (reuse for user routes)
└── database/
    └── db.js                    # NO CHANGE (Supabase client factory reused as-is)
```

No new directories or services. `/users/me` PATCH and `/settings` endpoints are added directly to the existing `auth.routes.js` — a separate `modules/users/` directory or `users.routes.js` file was considered and rejected: it would add only 2-4 routes' worth of code split across a new file/folder for no benefit, contradicting the "modify before creating" standard.

### Database Schema Changes

No new tables. `role text default 'client'` already exists on `users` (see `apps/api/sql/auth-schema.sql`). One additive column for user settings:

```sql
alter table public.users add column if not exists settings jsonb default '{}';
```

## Components and Interfaces

### Component 1: Refresh Token Rotation (implemented — see `apps/api/src/modules/auth/auth-service.js`)

The `/refresh` endpoint previously returned a hardcoded stub. It now:
1. Reads the refresh token from the `refreshToken` cookie or request body.
2. Hashes it and looks it up in `refresh_tokens` via existing `repo.getRefreshToken`.
3. If found & valid → issues a new access token + new refresh token, revokes the old one (`repo.revokeRefreshToken`), sets the new cookie.
4. If not found among valid tokens but it did exist at some point (`repo.findRefreshTokenByHash`) → treated as reuse of a revoked token (theft signal): revokes ALL sessions for that user (`repo.revokeAllUserSessions`) and returns 401.

No RBAC service, no new files — this is a function (`rotateRefreshToken`) added to the existing `auth-service.js`, plus two small additive functions in `repository.js`.

### Component 2: User Profile / Settings Endpoints

`GET/PATCH /users/me` (profile) and `GET/PATCH /settings` are added as additional routes directly inside the existing `auth.routes.js`, protected by the existing `createAuthMiddleware()`. No new file or directory — per the "modify before creating" standard, four small routes do not justify a new module.

### Component 3: Rate Limiting (implemented)

Per-endpoint limiters using the existing `createRateLimiter()` factory, defined at the top of `auth.routes.js`:
```javascript
const registerLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 3 });
const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5 });
const resetLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 3 });
const refreshLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
```
Applied directly as route middleware, e.g. `router.post('/register', registerLimiter, ...)`.

### Component 4: Cookie-Based Refresh Token Transport (implemented)

The refresh token is transmitted via an `HttpOnly`, `SameSite=Strict` cookie (already the chosen design in `auth.routes.js`'s `/login` handler). To make this actually work:
- `cookie-parser` is mounted in `app.js` so `req.cookies` is populated.
- CORS is configured with `credentials: true` so browsers send/accept the cookie cross-origin.

This was the smallest fix that kept the already-chosen cookie architecture, rather than switching to a body-only refresh token design.

### Database Migration File

None required. `role` and no RBAC tables were already the Task 3 decision; only an additive `settings jsonb` column is needed when the settings endpoints are implemented, via a simple `alter table ... add column if not exists`, not a new migration file.

## Data Models

### Access Token Claims (JWT payload — already implemented as-is)
```json
{
  "iss": "jarvis-prime",
  "aud": "jarvis-prime-api",
  "sub": "uuid-user-id",
  "iat": 1720000000,
  "exp": 1720000900,
  "email": "user@example.com",
  "email_verified": true,
  "role": "client",
  "session_id": "uuid-session-id",
  "device_id": "sha256-fingerprint"
}
```

### User Profile Response (GET /users/me)
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "username": "johndoe",
  "status": "active",
  "role": "client",
  "created_at": "2026-07-14T...",
  "updated_at": "2026-07-14T..."
}
```

### User Settings Response (GET /settings)
```json
{
  "notifications": { "email": true, "push": false },
  "timezone": "Asia/Kolkata",
  "language": "en"
}
```

## API Endpoints (Final Mapping to Requirements)

| Method | Path | Auth | Rate Limit | Req |
|--------|------|------|-----------|-----|
| POST | /auth/register | None | 3/hr/IP | R1 |
| POST | /auth/login | None | 5/15min/IP | R2 |
| POST | /auth/logout | JWT | None | R3 |
| POST | /auth/forgot-password | None | 3/hr/IP | R4 |
| POST | /auth/reset-password | None | 3/hr/IP | R5 |
| POST | /auth/refresh | Cookie | None | R8 |
| GET | /users/me | JWT | None | R11 |
| PATCH | /users/me | JWT | None | R11 |
| GET | /settings | JWT | None | R12 |
| PATCH | /settings | JWT | None | R12 |

## Security Considerations

1. **Refresh token rotation**: Every refresh invalidates the old token. Reuse of a revoked token triggers full session revocation (theft detection per Requirement 8).
2. **No user enumeration**: Registration returns generic success even if email exists (already implemented). Forgot-password always returns 200.
3. **Rate limiting**: Per-endpoint rate limits on all public auth endpoints using the existing `createRateLimiter()` factory.
4. **Authorization**: Role checks (`createAuthorizationMiddleware`) compare `req.user.role` against a required-role list — no DB lookup, no permissions table.
5. **JWT claims**: `role` is a single string embedded in the token to avoid DB lookups on every request. Token is short-lived (15 min) so role changes take effect within 15 minutes.
6. **Settings isolation**: Users can only read/write their own settings (enforced by JWT `sub` claim → user ID).

## Correctness Properties

### Property 1: Refresh Token Single Use
A refresh token can be used to obtain a new access token exactly once; after use it is revoked and any subsequent presentation of the same raw token is rejected.
**Validates: Requirements 8.1, 8.3**

### Property 2: Refresh Token Reuse Triggers Full Revocation
Presenting a refresh token that was already revoked (reuse) revokes all sessions and refresh tokens for that user, not just the presented one.
**Validates: Requirements 8.2**

### Property 3: Access Token Signature and Expiry Enforcement
An access token whose signature does not match the configured `JWT_SECRET`, or whose `exp` has passed, is never accepted by `verifyAccessToken`.
**Validates: Requirements 7.1, 7.4**

### Property 4: Fail-Fast Startup
The server refuses to start if `JWT_SECRET`, `SUPABASE_URL`, or `SUPABASE_SERVICE_ROLE_KEY` is empty or missing.
**Validates: Requirements 14.4**

### Property 5: Rate Limit Enforcement
Rate limiters on `/register`, `/login`, `/password-reset`, `/password-reset/confirm`, and `/refresh` reject requests once their configured threshold is exceeded within the window, independent of request content.
**Validates: Requirements 1.6, 2.7, 4.3**

## Testing Strategy

Unit tests were added to `apps/api/test/engine.test.js` covering `jwt-service.js` (sign/verify, wrong-secret rejection, tamper rejection, bearer extraction) and `crypto.js` (password hash/verify round-trip, token hash verify), plus one `auth-middleware.js` test (missing-token rejection). Full service/repository-layer integration tests (register/login/refresh against a live or mocked Supabase instance) are deferred — not required for stabilization, and should be added when `/users/me` PATCH and `/settings` are implemented.

## Error Handling

All auth routes use try/catch with structured `{ error: { code, message } }` responses and generic messages for auth failures (no user enumeration, no stack traces to clients). `rotateRefreshToken` follows the same pattern: DB/network errors are caught and logged, returning a generic 500 rather than propagating internals.

## Implementation Plan (completed during stabilization)

- Fixed refresh token rotation in `auth-service.js` (`rotateRefreshToken`) and `repository.js` (`revokeRefreshToken`, `findRefreshTokenByHash`).
- Added per-endpoint rate limiters directly in `auth.routes.js` (no new middleware file).
- Mounted `cookie-parser` and enabled CORS `credentials: true` in `app.js` to make the existing cookie-based refresh design actually function.
- Added minimal auth unit tests to the existing test file.

**Remaining, not yet implemented** (out of scope for the stabilization phase — feature work, not a bug fix):
- `GET/PATCH /users/me` (beyond the existing read-only `/me`) and `GET/PATCH /settings` endpoints.
- `settings jsonb` column addition to `users`.

## Dependencies

One new npm package: `cookie-parser` (pinned exact version), required because `req.cookies` was already used in the refresh endpoint's code but nothing parsed cookies. Everything else uses:
- `express` (already installed)
- `@supabase/supabase-js` (already installed)
- `node:crypto` (built-in)
- `argon2` (optional, already handled with scrypt fallback)

## Files Summary (stabilization phase — actual changes made)

| Action | File | Lines Changed |
|--------|------|--------------|
| MODIFY | `apps/api/src/modules/auth/auth-service.js` | ~100 (fix import, reset-token guard, rotateRefreshToken) |
| MODIFY | `apps/api/src/modules/auth/auth.routes.js` | ~50 (fix import, rate limiters, real /refresh) |
| MODIFY | `apps/api/src/modules/auth/repository.js` | ~18 (revokeRefreshToken, findRefreshTokenByHash) |
| MODIFY | `apps/api/src/middleware/auth-middleware.js` | 1 (fix import) |
| MODIFY | `apps/api/src/config/config.js` | ~22 (validateRequiredSecrets) |
| MODIFY | `apps/api/src/app.js` | ~8 (validation call, cookie-parser, CORS credentials) |
| MODIFY | `apps/api/src/integrations/webhook.service.js` | 1 (fix broken import blocking app startup) |
| MODIFY | `apps/api/test/engine.test.js` | +90 (JWT/crypto/middleware unit tests) |
| MODIFY | `apps/api/.env.test` | +3 (JWT_SECRET for CI) |
| NEW DEPENDENCY | `cookie-parser@1.4.7` | — |

No files created. No RBAC tables, services, or new directories. `/users/me` PATCH and `/settings` remain future feature work per Phase 1, not part of this stabilization pass.
