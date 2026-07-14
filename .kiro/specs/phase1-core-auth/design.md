# Technical Design

## Overview

Phase 1 Core Authentication extends the existing `apps/api/src/modules/auth/` module to add RBAC, user profile/settings endpoints, refresh token rotation with theft detection, and per-endpoint rate limiting. The design maximizes reuse of existing code (auth-service.js, jwt-service.js, crypto.js, repository.js, constants.js, auth-middleware.js, rate-limiter.js, validate.js) and adds only what's missing.

**Key architectural decision**: The existing auth module already implements ~70% of Phase 1 (register, login, logout, password reset, sessions, JWT). The remaining work is: (1) add RBAC tables + service, (2) add `/users/me` and `/settings` endpoints, (3) implement refresh token rotation, (4) add per-endpoint rate limiting to auth routes, (5) update JWT claims to include roles array.

## Architecture

### System Context

```
[Browser/App] → HTTPS → [Express API at apps/api/]
                              │
                 ┌────────────┼────────────────┐
                 │            │                │
          [Auth Routes]  [User Routes]  [Settings Routes]
                 │            │                │
          [Auth Service] [User Service]   (same service)
                 │            │                │
          [Repository]   [Repository]     [Repository]
                 │            │                │
                 └────────────┼────────────────┘
                              │
                    [Supabase PostgreSQL]
```

### Component Diagram

```
apps/api/src/
├── modules/
│   ├── auth/                    # EXISTING — extend
│   │   ├── auth-service.js      # MODIFY: add roles to token, default role assignment
│   │   ├── auth.routes.js       # MODIFY: add rate limiters, add /auth/refresh endpoint logic
│   │   ├── jwt-service.js       # MODIFY: add `roles` claim to access token
│   │   ├── repository.js        # MODIFY: add RBAC queries (getUserRoles, getUserPermissions)
│   │   ├── constants.js         # NO CHANGE
│   │   ├── crypto.js            # NO CHANGE
│   │   └── rbac-service.js      # NEW: permission resolution + role checking
│   └── users/                   # NEW directory
│       └── users.routes.js      # NEW: GET/PATCH /users/me, GET/PATCH /settings
├── middleware/
│   ├── auth-middleware.js       # MODIFY: add requirePermission() helper
│   ├── rate-limiter.js          # NO CHANGE (already supports per-endpoint config)
│   └── validate.js              # NO CHANGE (reuse for user routes)
└── database/
    └── db.js                    # NO CHANGE (Supabase client factory reused as-is)
```

### Database Schema Changes

New tables added via SQL migration (no existing tables modified):

```sql
-- roles table
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

-- permissions table
create table if not exists public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

-- role_permissions join table
create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- user_roles join table
create table if not exists public.user_roles (
  user_id     uuid not null references public.users(id) on delete cascade,
  role_id     uuid not null references public.roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- Add settings column to users table
alter table public.users add column if not exists settings jsonb default '{}';
```

Seed data (initial roles + permissions):

```sql
insert into roles (name, description) values
  ('super_admin', 'Full platform access'),
  ('admin', 'Administrative access'),
  ('employee', 'Internal team member'),
  ('client', 'External customer')
on conflict (name) do nothing;

insert into permissions (key, description) values
  ('users:read', 'View user profiles'),
  ('users:write', 'Modify user profiles'),
  ('settings:read', 'View settings'),
  ('settings:write', 'Modify settings'),
  ('admin:access', 'Access admin panel')
on conflict (key) do nothing;
```

## Components

### Component 1: RBAC Service (`apps/api/src/modules/auth/rbac-service.js`)

**Purpose**: Resolves user roles and permissions from the database. Used by auth-middleware to enforce access control.

**Why new file**: This is a distinct responsibility (authorization) from authentication (auth-service.js). Putting it in auth-service.js would violate single-responsibility and make that already-large file (350+ lines) even bigger.

**Interface**:
```javascript
export async function getUserRoles(userId)        // → ['client']
export async function getUserPermissions(userId)  // → ['users:read', 'settings:read']
export async function hasPermission(userId, key)  // → boolean
export async function hasRole(userId, roleName)   // → boolean
export async function assignRole(userId, roleName) // → void (used at registration)
```

**Size target**: ~60 lines. All DB queries go through the existing `getDb()` pattern from `repository.js`.

### Component 2: User Routes (`apps/api/src/modules/users/users.routes.js`)

**Purpose**: Handles GET/PATCH `/users/me` and GET/PATCH `/settings`. Thin route layer calling repository directly (no separate "user service" needed — the logic is trivial CRUD).

**Why new file**: These endpoints have a different URL prefix (`/users` and `/settings`) from auth routes (`/auth`). Express routers are mounted per-prefix.

**Interface**:
```javascript
// GET /users/me → returns user profile with roles
// PATCH /users/me → updates full_name, username only
// GET /settings → returns user.settings jsonb
// PATCH /settings → merges into user.settings jsonb
```

**Size target**: ~80 lines. Uses `createAuthMiddleware()` for protection, `validate()` for input checking.

### Component 3: Modifications to Existing Files

#### `jwt-service.js` — Add `roles` claim
```diff
  const payload = {
    ...existing claims...,
+   roles: user.roles || [],  // Array of role names from user_roles join
  };
```

#### `auth-service.js` — Assign default role on registration
```diff
  // After user creation:
+ import { assignRole } from './rbac-service.js';
+ await assignRole(user.id, 'client');
```

#### `auth-service.js` — Load roles before token creation
```diff
  // In loginUser(), before createAccessToken:
+ import { getUserRoles } from './rbac-service.js';
+ const roles = await getUserRoles(user.id);
+ user.roles = roles;
```

#### `auth.routes.js` — Implement refresh token rotation
The existing `/refresh` endpoint is a stub returning a hardcoded string. Implement:
1. Read refresh token from cookie or body
2. Hash it, look up in `refresh_tokens` table
3. If found & valid → issue new access + refresh tokens, revoke old
4. If found & revoked → revoke ALL tokens for user (theft detected), return 401
5. Set new refresh token cookie

#### `auth.routes.js` — Add per-endpoint rate limiters
```javascript
import { createRateLimiter } from '../../middleware/rate-limiter.js';
const loginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 5 });
const registerLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 3 });
const resetLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 3 });

router.post('/register', registerLimiter, ...);
router.post('/login', loginLimiter, ...);
router.post('/forgot-password', resetLimiter, ...);
```

#### `auth-middleware.js` — Add `requirePermission()` helper
```javascript
export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json(...)
    const ok = await hasPermission(req.user.sub, permissionKey);
    if (!ok) return res.status(403).json(...)
    next();
  };
}
```

#### `repository.js` — Add RBAC query functions
```javascript
export async function getUserRoles(userId) { ... }
export async function getUserPermissions(userId) { ... }
export async function assignUserRole(userId, roleId) { ... }
export async function getRoleByName(roleName) { ... }
```

#### `app.js` — Mount user routes
```diff
+ const { default: usersRouter } = await import('./modules/users/users.routes.js');
+ app.use('/users', createAuthMiddleware(), usersRouter);
+ app.use('/settings', createAuthMiddleware(), usersRouter);
```

Wait — mounting at `/settings` is unusual. Better: the users router handles both `/users/me` and `/settings` internally, mounted at `/`:
```diff
+ app.use('/', usersRouter);  // routes: /users/me, /settings
```

Actually, simplest: mount after auth middleware:
```diff
  app.use('/api/auth', authRouter);
+ const { default: usersRouter } = await import('./modules/users/users.routes.js');
  app.use('/api', createAuth());  // shared-secret for automation routes
+ app.use('/users', createAuthMiddleware(), usersRouter);   // JWT-protected
+ app.use('/settings', createAuthMiddleware(), usersRouter); // JWT-protected
```

### Component 4: Database Migration File

**File**: `apps/api/sql/migrations/003_rbac_and_settings.sql`

Contains all RBAC DDL + seed data + settings column addition. Idempotent (uses `if not exists` and `on conflict do nothing`).

## Data Models

### Access Token Claims (JWT payload)
```json
{
  "iss": "jarvis-prime",
  "aud": "jarvis-prime-api",
  "sub": "uuid-user-id",
  "iat": 1720000000,
  "exp": 1720000900,
  "email": "user@example.com",
  "email_verified": true,
  "session_id": "uuid-session-id",
  "device_id": "sha256-fingerprint",
  "roles": ["client"]
}
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
  "roles": ["client"],
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
4. **RBAC resolution**: Permissions are resolved from DB at authorization time — no hardcoded permission checks in route handlers.
5. **JWT claims**: Roles are embedded in the token to avoid DB lookups on every request. Token is short-lived (15 min) so role changes take effect within 15 minutes.
6. **Settings isolation**: Users can only read/write their own settings (enforced by JWT `sub` claim → user ID).

## Implementation Plan

### Phase 1a: Database (migration file)
- Create `003_rbac_and_settings.sql`
- Add roles, permissions, role_permissions, user_roles tables
- Add settings column to users
- Seed initial roles and permissions

### Phase 1b: RBAC Service
- Create `rbac-service.js` (new file, ~60 lines)
- Add RBAC query functions to `repository.js` (~40 lines added)

### Phase 1c: Token & Registration Updates
- Modify `jwt-service.js`: add `roles` to payload
- Modify `auth-service.js`: assign default role on register, load roles on login
- Modify `auth.routes.js`: implement refresh endpoint, add rate limiters

### Phase 1d: User Routes
- Create `users.routes.js` (new file, ~80 lines)
- Mount in `app.js`

### Phase 1e: Middleware Update
- Add `requirePermission()` to `auth-middleware.js`

### Phase 1f: Verification
- Run tests (28 existing must still pass)
- Build (web must still succeed)
- Manual endpoint testing

## Dependencies

**No new npm packages required.** Everything uses:
- `express` (already installed)
- `@supabase/supabase-js` (already installed)
- `node:crypto` (built-in)
- `argon2` (optional, already handled with scrypt fallback)

## Files Summary

| Action | File | Lines Changed |
|--------|------|--------------|
| NEW | `apps/api/sql/migrations/003_rbac_and_settings.sql` | ~50 |
| NEW | `apps/api/src/modules/auth/rbac-service.js` | ~60 |
| NEW | `apps/api/src/modules/users/users.routes.js` | ~80 |
| MODIFY | `apps/api/src/modules/auth/jwt-service.js` | ~3 |
| MODIFY | `apps/api/src/modules/auth/auth-service.js` | ~10 |
| MODIFY | `apps/api/src/modules/auth/auth.routes.js` | ~40 |
| MODIFY | `apps/api/src/modules/auth/repository.js` | ~40 |
| MODIFY | `apps/api/src/middleware/auth-middleware.js` | ~15 |
| MODIFY | `apps/api/src/app.js` | ~5 |

**Total new code**: ~190 lines across 3 new files  
**Total modifications**: ~113 lines across 6 existing files  
**Total**: ~303 lines of implementation

No files deleted. No packages added. No architecture changes.
