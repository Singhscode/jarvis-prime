# Authentication System — Quick Reference Card

**Print this, keep it handy!**

---

## 🚀 Deployment Timeline

| Step | Action | Time | File |
|------|--------|------|------|
| 1 | Deploy database schema | 5 min | `engine/sql/auth-schema.sql` |
| 2 | Generate secrets | 2 min | Terminal |
| 3 | Update .env.production | 5 min | `engine/.env.production` |
| 4 | Install dependencies | 3 min | `npm install argon2` |
| 5 | Update app.js | 10 min | `engine/src/app.js` |
| 6 | Test endpoints | 15 min | `curl` commands |
| 7 | Follow deployment checklist | 60 min | `docs/auth/DEPLOYMENT_CHECKLIST.md` |
| | **TOTAL** | **100 min** | |

---

## 📋 Files at a Glance

### Database (Deploy First!)
```
engine/sql/auth-schema.sql
├── users
├── email_verification_tokens
├── password_resets
├── sessions
├── refresh_tokens
├── mfa_secrets
├── mfa_recovery_codes
├── oauth_accounts
├── audit_logs
├── security_events
└── password_history
```

### Backend Code
```
engine/src/auth/
├── constants.js        (security parameters)
├── crypto.js          (password hashing, tokens)
├── jwt-service.js     (JWT management)
├── auth-service.js    (business logic)
└── repository.js      (database layer)

engine/src/middleware/
└── auth-middleware.js (JWT verification, headers)

engine/src/api/
└── auth-routes.js     (REST endpoints)
```

### Documentation (~50 pages)
```
docs/auth/
├── README.md                 (start here!)
├── IMPLEMENTATION_GUIDE.md   (step-by-step setup)
├── ARCHITECTURE_SUMMARY.md   (design decisions)
├── FLOW_DIAGRAMS.md         (visual flows)
├── DEPLOYMENT_CHECKLIST.md  (production ready)
└── SECURITY_CHECKLIST.md    (OWASP compliance)
```

---

## 🔑 Secrets to Generate

```bash
# JWT Secret (for signing tokens)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Encryption Key (for MFA/sensitive data)
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Save to .env.production
echo "JWT_SECRET=$JWT_SECRET" >> engine/.env.production
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY" >> engine/.env.production
```

---

## 🔐 REST API Quick Reference

### Register
```bash
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "SecurePass123!@",
  "full_name": "John Doe"
}
# Returns: { success, user, message }
```

### Login
```bash
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "SecurePass123!@"
}
# Returns: { success, user, tokens: { accessToken, refreshToken, expiresIn }, session }
```

### Get Current User
```bash
GET /api/auth/me
Headers: Authorization: Bearer <accessToken>
# Returns: { user: { sub, email, role, ... } }
```

### Logout
```bash
POST /api/auth/logout
Headers: Authorization: Bearer <accessToken>
# Returns: { success, message }
```

### Password Reset (Initiate)
```bash
POST /api/auth/password-reset
{ "email": "user@example.com" }
# Returns: { success, message }
```

### Password Reset (Complete)
```bash
POST /api/auth/password-reset/confirm
{
  "email": "user@example.com",
  "resetToken": "token-from-email",
  "newPassword": "NewPass123!@"
}
# Returns: { success, message }
```

---

## 🛡️ Security Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Password Min Length | 12 | OWASP requirement |
| Account Lockout | 5 attempts, 30 min | Brute-force protection |
| Access Token Expiry | 15 minutes | Short-lived |
| Refresh Token Expiry | 30 days | Long-lived |
| Email Verification | 7 days | One-time use |
| Password Reset Token | 24 hours | One-time use |
| Failed Attempts Reset | After unlock | Clean slate |
| Rate Limit (Login) | 5/15 min per IP | Brute-force protection |
| Rate Limit (Register) | 3/hour per IP | Account creation spam |

---

## ✅ Pre-Production Checklist (Quick)

- [ ] Database schema deployed
- [ ] JWT_SECRET & ENCRYPTION_KEY set
- [ ] SUPABASE_URL & SERVICE_ROLE_KEY set
- [ ] Argon2 installed or scrypt fallback tested
- [ ] Auth routes imported in app.js
- [ ] Auth middleware applied to /api routes
- [ ] Security headers middleware added
- [ ] Endpoints tested (register, login, logout)
- [ ] Email verification working
- [ ] Account lockout working (5 attempts)
- [ ] Audit logs populated
- [ ] CORS configured for frontend domain
- [ ] Rate limiting configured
- [ ] Monitoring & alerting setup
- [ ] Deployment checklist reviewed
- [ ] Rollback plan documented

---

## 🔍 Debugging

### JWT Token Not Validating
```bash
# 1. Check JWT_SECRET matches between creation and verification
echo $JWT_SECRET

# 2. Decode token (unverified)
node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1], 'base64url')))" eyJ...

# 3. Verify signature manually
# Use jwt.io but NEVER share real tokens
```

### Database Connection Failed
```bash
# Test Supabase connection
curl -X GET "$SUPABASE_URL/rest/v1/users?limit=1" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### Password Hashing Slow or Failing
```bash
# Check Argon2 installation
npm list argon2

# If missing, scrypt (built-in) will be used automatically
```

### Email Verification Not Sending
```bash
# Check Resend API key
echo $RESEND_API_KEY

# Test email sending
curl -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"auth@jarvisprime.me","to":"test@example.com","subject":"Test","html":"Test"}'
```

---

## 📊 Performance Targets

| Operation | Target | Acceptable Range |
|-----------|--------|------------------|
| Register | ~200ms | <500ms |
| Login | ~150ms | <300ms |
| Logout | ~50ms | <200ms |
| Token Verify | ~5ms | <50ms |
| Password Reset | ~100ms | <300ms |

---

## 🚨 Security Best Practices (Remember!)

✅ DO:
- Use HTTPS only in production
- Rotate JWT_SECRET if breached
- Monitor audit logs regularly
- Update dependencies monthly
- Test security after changes
- Store secrets in vault, not code
- Use strong passwords (12+ chars)
- Enable email verification
- Lock accounts after failed attempts
- Log all security events

❌ DON'T:
- Hardcode secrets
- Store plaintext passwords
- Log passwords or tokens
- Skip email verification
- Disable account lockout
- Allow weak passwords
- Commit .env files
- Reuse refresh tokens
- Store JWT in localStorage (use cookies)
- Ignore audit logs

---

## 📞 Support Resources

**Quick Reference**: This file (AUTH_QUICK_REFERENCE.md)

**Setup Guide**: `docs/auth/IMPLEMENTATION_GUIDE.md`

**Architecture**: `docs/auth/ARCHITECTURE_SUMMARY.md`

**Flows**: `docs/auth/FLOW_DIAGRAMS.md`

**Deployment**: `docs/auth/DEPLOYMENT_CHECKLIST.md`

**Compliance**: `docs/auth/SECURITY_CHECKLIST.md`

**Overview**: `docs/auth/README.md`

---

## 🎯 Implementation Checklist

### Week 1
- [ ] Database schema deployed
- [ ] Secrets generated
- [ ] Environment configured
- [ ] Dependencies installed
- [ ] Code integrated into app.js
- [ ] Endpoints tested locally

### Week 2
- [ ] Email service configured
- [ ] Rate limiting added
- [ ] Monitoring setup
- [ ] Documentation reviewed
- [ ] Team trained

### Week 3
- [ ] Staging deployment
- [ ] Full test suite run
- [ ] Security audit passed
- [ ] Deployment checklist completed

### Week 3-4
- [ ] Production deployment
- [ ] Post-deployment verification
- [ ] Monitoring active
- [ ] Support ready

---

## 🔄 Common Tasks

### Add a New User Manually
```bash
# In Supabase SQL Editor:
INSERT INTO public.users (
  email,
  email_normalized,
  password_hash,
  full_name,
  status,
  email_verified_at
) VALUES (
  'user@example.com',
  'user@example.com',
  'hashed_password',
  'John Doe',
  'active',
  now()
);
```

### Reset a User's Password
```bash
# 1. Send password reset email (via endpoint)
POST /api/auth/password-reset { email: "user@example.com" }

# 2. Or manually in DB (with new hash):
UPDATE public.users
SET password_hash = 'new_hash'
WHERE email = 'user@example.com';
```

### Unlock a Locked Account
```bash
UPDATE public.users
SET account_locked_until = NULL,
    failed_login_attempts = 0
WHERE email = 'user@example.com';
```

### View Audit Logs
```bash
SELECT * FROM public.audit_logs
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 📈 Success Metrics

Track these after deployment:

- **Registration Success Rate** — Target: >95%
- **Login Success Rate** — Target: >98%
- **Failed Login Attempts** — Trend: Should be low
- **Account Lockouts** — Trend: Should be rare
- **Email Verification Rate** — Target: >90%
- **Password Reset Success** — Target: >95%
- **Average Response Time** — Target: <200ms
- **Error Rate** — Target: <0.5%
- **Uptime** — Target: >99.9%

---

**Last Updated**: July 10, 2026  
**Version**: 1.0.0  

**Print this. Keep it handy. Success! 🚀**
