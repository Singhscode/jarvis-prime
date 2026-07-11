# Authentication System — Flow Diagrams

Visual representation of core authentication flows.

---

## 1. User Registration Flow

```
┌─────────────────┐
│  User Frontend  │
│  (Next.js App)  │
└────────┬────────┘
         │
         │ 1. POST /api/auth/register
         │    { email, password, full_name }
         │
         ▼
┌──────────────────────────────────────┐
│     Input Validation Middleware       │
│  - Email format check                 │
│  - Password strength check            │
│  - Request sanitization              │
└────────┬─────────────────────────────┘
         │
         │ 2. Valid input ✓
         │
         ▼
┌──────────────────────────────────────┐
│   Auth Service: registerUser()        │
│                                       │
│  - Check if email exists              │
│  - Hash password (Argon2id)          │
│  - Create user record                 │
│  - Generate verification token        │
│  - Create audit log                   │
└────────┬─────────────────────────────┘
         │
         │ 3. DB Queries
         │    a) SELECT * FROM users WHERE email = ?
         │    b) INSERT INTO users VALUES (...)
         │    c) INSERT INTO email_verification_tokens VALUES (...)
         │    d) INSERT INTO audit_logs VALUES (...)
         │
         ▼
┌──────────────────────────────────────┐
│       PostgreSQL Database              │
│       (via Supabase)                   │
└────────┬─────────────────────────────┘
         │
         │ 4. User created:
         │    - status = "pending_verification"
         │    - password_hash = "$argon2id$..."
         │    - email_verified_at = NULL
         │
         ▼
┌──────────────────────────────────────┐
│   Send Verification Email             │
│   (via Resend API)                    │
│                                       │
│  To: user@example.com                 │
│  Subject: Verify your email           │
│  Link: https://app.com/verify?        │
│        token=abc123def456             │
└────────┬─────────────────────────────┘
         │
         │ 5. Return response
         │    { success: true,
         │      message: "Check your email...",
         │      user: { id, email, ... } }
         │
         ▼
┌─────────────────┐
│  User Frontend  │
│  (Registration  │
│   Complete)     │
└─────────────────┘
         │
         ▼
    User checks email → Clicks verification link
         │
         ▼
┌────────────────────────────────────────┐
│ POST /api/auth/verify-email            │
│ { email, token }                       │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Auth Service: verifyEmail()           │
│                                        │
│  - Find verification token             │
│  - Verify token not expired            │
│  - Hash provided token, compare hashes │
│  - Update user.email_verified_at       │
│  - Update user.status = "active"       │
│  - Mark token as used                  │
└────────┬───────────────────────────────┘
         │
         ▼
    Email verified ✓
    User can now login
```

---

## 2. Login Flow (with Security Checks)

```
┌─────────────────┐
│  User Frontend  │
│  (Login Form)   │
└────────┬────────┘
         │
         │ 1. POST /api/auth/login
         │    { email, password, deviceName }
         │
         ▼
┌────────────────────────────────────────┐
│  Input Validation & Rate Limiting      │
│  - Validate email format               │
│  - Check IP rate limit (5/15min)       │
│  - Request sanitization                │
└────────┬───────────────────────────────┘
         │
         │ 2. Valid & not rate limited ✓
         │
         ▼
┌────────────────────────────────────────┐
│  Auth Service: loginUser()             │
│                                        │
│  Step 1: Find user                     │
│    SELECT * FROM users                 │
│    WHERE email_normalized = ?          │
└────────┬───────────────────────────────┘
         │
         ▼
    User found? NO → Return: "Invalid credentials"
         │
         ▼ YES
┌────────────────────────────────────────┐
│  Step 2: Check account status          │
│                                        │
│  ✓ status = "active"?                  │
│  ✓ email_verified_at is set?           │
│  ✓ account_locked_until is NULL?       │
└────────┬───────────────────────────────┘
         │
         ▼ All checks pass
┌────────────────────────────────────────┐
│  Step 3: Verify password               │
│                                        │
│  Argon2id.verify(password, hash)       │
│  Constant-time comparison              │
└────────┬───────────────────────────────┘
         │
    Password matches? NO
         │
         ▼
    failed_login_attempts++
    Check if >= 5?
         │
    YES → Lock account for 30 min
         │
    NO  → Return: "Invalid credentials"
         │
         ▼
    Password matches? YES
         │
         ▼
┌────────────────────────────────────────┐
│  Step 4: Create Session                │
│                                        │
│  INSERT INTO sessions VALUES (         │
│    user_id,                            │
│    device_id = hash(UA + IP),          │
│    ip_address,                         │
│    expires_at = now + 24h              │
│  )                                     │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Step 5: Generate Tokens               │
│                                        │
│  Access Token (JWT):                   │
│    - expires: 15 minutes               │
│    - payload: { sub, email, role,      │
│                 session_id, device_id, │
│                 ... }                  │
│    - signature: HMAC-SHA256            │
│                                        │
│  Refresh Token:                        │
│    - random UUID (32 bytes)            │
│    - hash it: SHA-256                  │
│    - store in DB with expiry (30d)     │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Step 6: Log Audit Event               │
│                                        │
│  INSERT INTO audit_logs VALUES (       │
│    user_id,                            │
│    event_type = 'user.login',          │
│    success = true,                     │
│    ip_address,                         │
│    user_agent                          │
│  )                                     │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Return to Frontend                    │
│                                        │
│  {                                     │
│    "success": true,                    │
│    "user": { id, email, role, ... },   │
│    "tokens": {                         │
│      "accessToken": "eyJ...",          │
│      "expiresIn": 900                  │
│    },                                  │
│    "session": {                        │
│      "id": "uuid",                     │
│      "device_name": "Chrome on Mac"    │
│    }                                   │
│  }                                     │
│                                        │
│  + Set HttpOnly cookie:                │
│    Set-Cookie: refreshToken=...;       │
│    HttpOnly; Secure; SameSite=Strict   │
└────────┬───────────────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│  Frontend                    │
│  - Store accessToken (safe)  │
│  - refreshToken in cookie    │
│  - Redirect to dashboard     │
└──────────────────────────────┘
```

---

## 3. Authenticated Request Flow

```
┌──────────────────────────┐
│  Frontend Makes Request  │
│  to Protected Endpoint   │
│                          │
│  GET /api/data/stats     │
└────────┬─────────────────┘
         │
         │ Attach JWT in header:
         │ Authorization: Bearer <accessToken>
         │
         ▼
┌────────────────────────────────────────┐
│  Express.js Server                     │
│  Auth Middleware                       │
│                                        │
│ 1. Extract token from header           │
│ 2. Verify JWT signature                │
│    - Decode header.payload.signature   │
│    - HMAC-SHA256(header.payload, key)  │
│    - Compare signatures (constant-time)│
└────────┬───────────────────────────────┘
         │
    Signature invalid? → 401 UNAUTHORIZED
         │
    Signature valid ✓
         │
         ▼
┌────────────────────────────────────────┐
│ 3. Validate JWT Claims                 │
│                                        │
│    ✓ iss = "jarvis-prime"?             │
│    ✓ aud = "jarvis-prime-api"?         │
│    ✓ exp > now?  (not expired)         │
│    ✓ sub exists? (user ID)             │
│    ✓ session_id exists?                │
└────────┬───────────────────────────────┘
         │
    Any check fails? → 401 UNAUTHORIZED
         │
    All pass ✓
         │
         ▼
┌────────────────────────────────────────┐
│ 4. Optional: Device Binding Check      │
│                                        │
│    Current device_id = hash(UA + IP)   │
│    Token device_id = ?                 │
│    Match? Continue : 403 FORBIDDEN     │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ 5. Set req.user object                 │
│                                        │
│    req.user = {                        │
│      sub: "user-id",                   │
│      email: "user@example.com",        │
│      role: "member",                   │
│      session_id: "session-uuid",       │
│      device_id: "fingerprint",         │
│      ... (all JWT claims)              │
│    }                                   │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ 6. Route Handler                       │
│                                        │
│    app.get('/api/data/stats', auth, (req, res) => {
│      // req.user is populated
│      // user ID: req.user.sub
│      // user role: req.user.role
│      return res.json({ stats: ... });
│    })                                  │
└────────┬───────────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Response: 200 OK        │
│  { stats: {...} }        │
└──────────────────────────┘
```

---

## 4. Token Refresh Flow

```
┌──────────────────────────┐
│  Frontend (JS)           │
│                          │
│  accessToken expires     │
│  in 5 minutes?           │
│  → Time to refresh       │
└────────┬─────────────────┘
         │
         │ 1. POST /api/auth/refresh
         │    { refreshToken: "uuid..." }
         │    (or in HttpOnly cookie)
         │
         ▼
┌────────────────────────────────────────┐
│  Auth Service: refreshToken()          │
│                                        │
│  Step 1: Get refresh token from DB     │
│    SELECT * FROM refresh_tokens        │
│    WHERE token_hash = ?                │
│    AND expires_at > now                │
│    AND revoked_at IS NULL              │
└────────┬───────────────────────────────┘
         │
    Token not found/expired/revoked? → 401
         │
    Token found ✓
         │
         ▼
┌────────────────────────────────────────┐
│  Step 2: Check for reuse               │
│                                        │
│  If token already used:                │
│    - Suspicious activity!              │
│    - Revoke entire token family        │
│    - Log security event                │
│    - Return 401 (force re-login)       │
└────────┬───────────────────────────────┘
         │
    First use ✓
         │
         ▼
┌────────────────────────────────────────┐
│  Step 3: Token Rotation                │
│                                        │
│  - Generate new refresh token          │
│  - Invalidate old refresh token        │
│    UPDATE refresh_tokens               │
│    SET revoked_at = now,               │
│        revoked_reason = 'rotated'      │
│                                        │
│  - Create new token with same family   │
│    INSERT INTO refresh_tokens VALUES ( │
│      token_hash = hash(new_token),     │
│      token_family_id = same_as_old,    │
│      rotation_count = old.rotation + 1,│
│      ... )                             │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Step 4: Generate New Access Token     │
│                                        │
│  - Get user from DB                    │
│  - Create new JWT:                     │
│    { sub: user_id,                     │
│      session_id,                       │
│      exp: now + 15min,                 │
│      ... }                             │
│  - Sign with HMAC-SHA256               │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Step 5: Return Tokens                 │
│                                        │
│  {                                     │
│    "accessToken": "eyJ...",            │
│    "refreshToken": "new-uuid",         │
│    "expiresIn": 900                    │
│  }                                     │
│                                        │
│  + Set new HttpOnly cookie             │
└────────┬───────────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Frontend Updates        │
│  - Store new accessToken │
│  - Update refreshToken   │
│  - Resume API calls      │
└──────────────────────────┘
```

---

## 5. Logout Flow

```
┌──────────────────────────┐
│  User clicks Logout      │
│  Button in UI            │
└────────┬─────────────────┘
         │
         │ 1. POST /api/auth/logout
         │    Headers: Authorization: Bearer <token>
         │
         ▼
┌────────────────────────────────────────┐
│  Auth Middleware                       │
│                                        │
│  - Verify JWT token                    │
│  - Extract user info & session_id      │
└────────┬───────────────────────────────┘
         │
    Token invalid? → 401
         │
    Token valid ✓
         │
         ▼
┌────────────────────────────────────────┐
│  Auth Service: logoutUser()            │
│                                        │
│  Step 1: Revoke session                │
│    UPDATE sessions                     │
│    SET revoked_at = now,               │
│        revoked_reason = 'user_logout'  │
│    WHERE id = ?                        │
│                                        │
│  Step 2: Log audit event               │
│    INSERT INTO audit_logs VALUES (     │
│      user_id,                          │
│      event_type = 'user.logout',       │
│      ...                               │
│    )                                   │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Response                              │
│                                        │
│  {                                     │
│    "success": true,                    │
│    "message": "Logged out successfully"│
│  }                                     │
│                                        │
│  + Clear HttpOnly cookie:              │
│    Set-Cookie: refreshToken=;          │
│    HttpOnly; Max-Age=0                 │
└────────┬───────────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Frontend                │
│  - Clear accessToken     │
│  - Clear refreshToken    │
│  - Clear local state     │
│  - Redirect to login     │
└──────────────────────────┘
```

---

## 6. Password Reset Flow

```
┌──────────────────────────┐
│  User: "Forgot Password" │
│  Clicks link on login    │
└────────┬─────────────────┘
         │
         │ 1. POST /api/auth/password-reset
         │    { email: "user@example.com" }
         │
         ▼
┌────────────────────────────────────────┐
│  Input Validation                      │
│  - Email format check                  │
│  - Rate limit check (3/hour per IP)    │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Auth Service: initiatePasswordReset() │
│                                        │
│  Step 1: Find user by email            │
│    SELECT * FROM users                 │
│    WHERE email_normalized = ?          │
│                                        │
│  Step 2: Generate reset token          │
│    - 32 random bytes                   │
│    - Hash it (SHA-256)                 │
│    - Store in DB                       │
│                                        │
│  Step 3: Log audit event               │
│                                        │
│  Step 4: Send email with reset link    │
│    https://app.com/reset?              │
│    email=user@example.com&             │
│    token=abc123def456                  │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Response (always says success)        │
│  (prevents user enumeration)           │
│                                        │
│  {                                     │
│    "success": true,                    │
│    "message": "If account exists,      │
│               reset link sent."        │
│  }                                     │
└────────┬───────────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│  User checks email       │
│  Clicks reset link       │
└────────┬─────────────────┘
         │
         │ User enters new password
         │
         │ 2. POST /api/auth/password-reset/confirm
         │    { email, resetToken, newPassword }
         │
         ▼
┌────────────────────────────────────────┐
│  Input Validation                      │
│  - Email format                        │
│  - Password strength check             │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Auth Service: resetPassword()         │
│                                        │
│  Step 1: Find user                     │
│                                        │
│  Step 2: Get reset token from DB       │
│    SELECT * FROM password_resets       │
│    WHERE user_id = ? AND               │
│          expires_at > now AND          │
│          used_at IS NULL               │
│                                        │
│  Step 3: Verify token                  │
│    - Hash provided token               │
│    - Compare with stored hash          │
│                                        │
│  Step 4: Validate new password         │
│    - Not same as old password          │
│    - Not in password history           │
│                                        │
│  Step 5: Update password               │
│    - Hash new password (Argon2id)      │
│    - Store in users table              │
│    - Store old hash in history         │
│                                        │
│  Step 6: Revoke all sessions           │
│    (force re-login for security)       │
│    UPDATE sessions                     │
│    SET revoked_at = now,               │
│        revoked_reason = 'password_reset'
│                                        │
│  Step 7: Mark reset token as used      │
│    UPDATE password_resets              │
│    SET used_at = now,                  │
│        used_ip = ?                     │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Response                              │
│                                        │
│  {                                     │
│    "success": true,                    │
│    "message": "Password reset          │
│               successfully."           │
│  }                                     │
└────────┬───────────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│  User redirected to      │
│  Login page with new     │
│  password                │
└──────────────────────────┘
```

---

## 7. Account Lockout Flow

```
┌──────────────────────────┐
│  Attacker tries login    │
│  with wrong password     │
└────────┬─────────────────┘
         │
    Attempt 1: loginUser() → Verify fails
         │
         ├─ failed_login_attempts = 1
         └─ Last response: "Invalid credentials"
         │
         ▼ Rate limited? No
    Attempt 2: loginUser() → Verify fails
         │
         ├─ failed_login_attempts = 2
         └─ Last response: "Invalid credentials"
         │
         ▼
    ... (attempts 3, 4 similar) ...
         │
         ▼
    Attempt 5: loginUser() → Verify fails
         │
         ├─ failed_login_attempts = 5
         ├─ failed_login_attempts >= 5? YES
         │
         ▼
    ┌────────────────────────────────────┐
    │ Lock Account                       │
    │                                    │
    │ UPDATE users                       │
    │ SET account_locked_until =         │
    │     now + 30 minutes,              │
    │     ...                            │
    │ WHERE id = ?                       │
    │                                    │
    │ INSERT INTO audit_logs VALUES (    │
    │   event_type = 'account.locked',   │
    │   ...                              │
    │ )                                  │
    └────────┬───────────────────────────┘
             │
             ▼
    Response: "Account locked due to
              failed login attempts."
             │
             ▼
    ┌─────────────────────────────────────────┐
    │  Attacker tries again                   │
    │  (even with correct password now)       │
    │                                         │
    │  account_locked_until = 2026-07-10      │
    │  13:30:00                               │
    │  now = 2026-07-10 13:15:00 (still lock)│
    │                                         │
    │  Response: "Account is locked."        │
    └─────────────────────────────────────────┘
             │
             ▼
    ┌─────────────────────────────────────────┐
    │  30 minutes later...                    │
    │                                         │
    │  Legitimate user tries login:           │
    │  account_locked_until = 2026-07-10      │
    │  13:30:00                               │
    │  now = 2026-07-10 13:35:00 (unlocked!) │
    │                                         │
    │  Unlock account:                        │
    │  UPDATE users                           │
    │  SET account_locked_until = NULL,       │
    │      failed_login_attempts = 0,         │
    │      last_failed_login_at = NULL        │
    │                                         │
    │  Login proceeds normally...             │
    └─────────────────────────────────────────┘
```

---

## 8. Database State Over Time

```
Timeline: User Registration → Login → Logout

T=0:  User starts registration form
      Database: Empty (no users table entry)

T=1:  POST /api/auth/register
      ├─ INSERT users
      │  └─ id: uuid1
      │     email: "user@example.com"
      │     status: "pending_verification"
      │     password_hash: "$argon2id$..."
      │     created_at: 2026-07-10T12:00:00Z
      │
      ├─ INSERT email_verification_tokens
      │  └─ user_id: uuid1
      │     token_hash: "abc123..." (SHA-256)
      │     expires_at: 2026-07-17T12:00:00Z (7 days)
      │
      └─ INSERT audit_logs
         └─ event_type: "user.created"
            user_id: uuid1
            success: true

T=2:  User receives email, clicks verification link

T=3:  POST /api/auth/verify-email
      ├─ UPDATE users
      │  └─ email_verified_at: 2026-07-10T12:10:00Z
      │     status: "active"
      │
      ├─ UPDATE email_verification_tokens
      │  └─ verified_at: 2026-07-10T12:10:00Z
      │
      └─ INSERT audit_logs
         └─ event_type: "email.verified"

T=4:  POST /api/auth/login
      ├─ INSERT sessions
      │  └─ user_id: uuid1
      │     session_id: uuid2
      │     device_id: "fingerprint"
      │     expires_at: 2026-07-11T12:00:00Z
      │
      ├─ INSERT refresh_tokens
      │  └─ user_id: uuid1
      │     token_hash: "def456..."
      │     expires_at: 2026-08-09T12:00:00Z (30 days)
      │
      ├─ UPDATE users
      │  └─ failed_login_attempts: 0
      │
      └─ INSERT audit_logs
         └─ event_type: "user.login"
            success: true

T=5:  User makes authenticated requests
      └─ JWT verified locally (no DB calls)
         sessions.last_activity_at: 2026-07-10T12:30:00Z

T=6:  User clicks Logout
      ├─ UPDATE sessions
      │  └─ revoked_at: 2026-07-10T13:00:00Z
      │     revoked_reason: "user_logout"
      │
      └─ INSERT audit_logs
         └─ event_type: "user.logout"
            success: true

Result:
  - User record: status = "active", email_verified = true
  - Session: revoked
  - Refresh token: valid until 2026-08-09 (can refresh within 24hr of logout)
  - Audit trail: 5 events logged
```

---

These diagrams illustrate the complete flow of the authentication system from user's perspective through database to response.
