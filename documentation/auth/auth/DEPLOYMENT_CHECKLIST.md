# Authentication System — Deployment Checklist

**Use this checklist before deploying authentication to production**

---

## Pre-Deployment (Development)

### Database Setup
- [ ] PostgreSQL schema deployed (`engine/sql/auth-schema.sql`)
- [ ] All 11 tables created successfully
- [ ] Indexes verified to exist
- [ ] Row Level Security (RLS) enabled on all tables
- [ ] Test connection to Supabase works

**Verify:**
```bash
# In Supabase SQL Editor:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE 'users%' OR table_name LIKE 'sessions%';

# Should show: users, sessions, email_verification_tokens, password_resets, oauth_accounts, mfa_secrets, audit_logs, security_events, password_history
```

### Dependencies Installation
- [ ] `npm install` in engine/ directory
- [ ] Argon2id installed: `npm install argon2`
  - OR verify scrypt fallback works (Node.js built-in)
- [ ] No security vulnerabilities: `npm audit`
- [ ] All auth modules import without errors

**Test:**
```bash
cd engine
npm list argon2
# Or: npm list | grep argon2 (should show version)
```

### Environment Variables
- [ ] JWT_SECRET generated (32 bytes = 64 hex chars)
- [ ] ENCRYPTION_KEY generated (32 bytes = 64 hex chars)
- [ ] SUPABASE_URL set
- [ ] SUPABASE_SERVICE_ROLE_KEY set
- [ ] NODE_ENV = 'production' for production
- [ ] All .env values copied to .env.production

**Generate Secrets:**
```bash
node -e "console.log('JWT_SECRET:', require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY:', require('crypto').randomBytes(32).toString('hex'))"
```

**Verify in .env.production:**
```bash
# Should NOT be empty
grep -E "JWT_SECRET|ENCRYPTION_KEY" .env.production
```

### Code Integration
- [ ] Auth routes imported in app.js
- [ ] Auth middleware applied to protected routes
- [ ] Security headers middleware added
- [ ] Input sanitization middleware added
- [ ] Error handling configured
- [ ] No hardcoded secrets in code

**Check app.js:**
```javascript
import authRoutes from './api/auth-routes.js';
import { createAuthMiddleware, createSecurityHeadersMiddleware } from './middleware/auth-middleware.js';

app.use(createSecurityHeadersMiddleware());
app.use('/api/auth', authRoutes);
app.use('/api/protected', createAuthMiddleware());
```

### Local Testing
- [ ] `POST /api/auth/register` works
- [ ] `POST /api/auth/login` works
- [ ] Invalid credentials rejected
- [ ] JWT token generated and returned
- [ ] `GET /api/auth/me` requires token
- [ ] `POST /api/auth/logout` works
- [ ] Account lockout works (5 failed attempts)
- [ ] Audit logs created for all events

**Test Curl:**
```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@local.com","password":"TestPass123!@","full_name":"Test User"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@local.com","password":"TestPass123!@"}'

# Should return token...

# Get current user
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <token-from-login>"
```

### Security Review
- [ ] No passwords logged anywhere
- [ ] No tokens logged anywhere
- [ ] No encryption keys logged anywhere
- [ ] Error messages are generic (no user enumeration)
- [ ] All passwords hashed with Argon2id
- [ ] All tokens hashed in database
- [ ] Input validation on all endpoints
- [ ] Request sanitization enabled

**Review Code:**
```bash
# Search for hardcoded secrets
grep -r "password" engine/src/auth/*.js | grep -v "// " | head -10
grep -r "secret" engine/src/auth/*.js | grep -v "// " | head -10
grep -r "token" engine/src/auth/*.js | grep -v "// " | head -10

# Should only find legitimate references with comments
```

---

## Pre-Production (Staging)

### Infrastructure
- [ ] HTTPS/TLS enabled (cert from Let's Encrypt or other CA)
- [ ] Database backup configured
- [ ] Database replication (if multi-region)
- [ ] Monitoring & logging configured
- [ ] Alerting configured
- [ ] Load balancer configured (if needed)

### Email Service
- [ ] Resend API key configured
- [ ] Email templates created for verification & password reset
- [ ] Sender email domain verified (SPF, DKIM, DMARC)
- [ ] Reply-to email configured
- [ ] Test email sending works

**Send Test Email:**
```bash
# Via Resend API
curl -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "auth@jarvisprime.me",
    "to": "test@example.com",
    "subject": "Test Email",
    "html": "Test email from JARVIS PRIME"
  }'
```

### Rate Limiting
- [ ] Rate limiter middleware installed
- [ ] Login endpoint limited: 5 attempts/15 min per IP
- [ ] Registration endpoint limited: 3 attempts/hour per IP
- [ ] Password reset limited: 3 attempts/hour per IP
- [ ] Token verification limited: 5 attempts/token

**If using Express Rate Limit:**
```bash
npm install express-rate-limit
```

### CORS & Security Headers
- [ ] CORS configured for frontend domain only
- [ ] CORS credentials enabled (for cookies)
- [ ] Security headers verified in browser DevTools

**Verify Headers (in browser):**
```javascript
// Open browser console
fetch('https://api.jarvisprime.me/api/auth/me', {
  headers: { Authorization: 'Bearer token' }
})
.then(r => {
  console.log('Response headers:');
  r.headers.forEach((value, name) => {
    if (name.startsWith('x-') || name.includes('security') || name.includes('policy'))
      console.log(name, value);
  });
})
```

### API Documentation
- [ ] Endpoints documented (path, method, parameters)
- [ ] Error codes documented
- [ ] Response formats documented
- [ ] Authentication requirements documented
- [ ] Rate limits documented

### Testing in Staging
- [ ] Full registration flow tested
- [ ] Full login flow tested
- [ ] Email verification tested
- [ ] Password reset tested
- [ ] Session revocation tested
- [ ] Token refresh tested
- [ ] Account lockout tested
- [ ] Load testing performed (1000+ concurrent users)
- [ ] Error scenarios tested (invalid input, database errors, etc.)

### Secrets Management
- [ ] No secrets in git history
- [ ] .env files in .gitignore
- [ ] Secrets stored in secure vault (AWS Secrets Manager, HashiCorp Vault, etc.)
- [ ] Key rotation procedure documented
- [ ] Backup encryption keys stored separately

**Check Git History:**
```bash
# Search for accidental secrets
git log --all --full-history -p | grep -i "secret\|password\|key" | head -20

# If found, use git-filter-repo to remove:
# git filter-repo --invert-paths --path <file>
```

### Audit & Compliance
- [ ] OWASP Top 10 checklist completed
- [ ] GDPR compliance verified (data retention, right to deletion)
- [ ] SOC 2 requirements verified (audit trails)
- [ ] Password policy documented
- [ ] Data retention policy documented
- [ ] Incident response plan created

---

## Production Deployment

### Pre-Deployment
- [ ] All staging checklist items complete
- [ ] Staging tests passed
- [ ] Load tests passed
- [ ] Security audit passed
- [ ] Management sign-off obtained
- [ ] Rollback plan documented

### Database Migration
- [ ] Backup current database (full backup)
- [ ] Run auth schema migration in production
  - [ ] Schema created successfully
  - [ ] Indexes created
  - [ ] RLS enabled
  - [ ] No data loss
- [ ] Verify schema with SELECT queries

### Application Deployment
- [ ] Code reviewed & approved
- [ ] Dependencies up-to-date (no security vulnerabilities)
- [ ] Environment variables set in production (not in .env files)
- [ ] Secrets loaded from secure vault
- [ ] Feature flags configured (can disable auth if needed)
- [ ] Zero-downtime deployment (blue-green or canary)

### Post-Deployment
- [ ] Health check endpoints responding
- [ ] Auth endpoints responding (register, login, etc.)
- [ ] JWT token generation working
- [ ] Database queries working
- [ ] Email sending working
- [ ] Audit logs created for all events
- [ ] Monitoring dashboards populated
- [ ] Alerting rules active

**Quick Validation:**
```bash
# Health check
curl https://api.jarvisprime.me/health

# Register test
curl -X POST https://api.jarvisprime.me/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test+prod@example.com","password":"TestPass123!@"}'

# Check database
# In Supabase: SELECT COUNT(*) FROM users;
```

### Monitoring Setup
- [ ] Error logging enabled (Sentry, DataDog, etc.)
- [ ] Performance monitoring enabled (APM)
- [ ] Uptime monitoring enabled (Pingdom, StatusPage)
- [ ] Database monitoring enabled
- [ ] Audit log monitoring enabled

### Documentation Update
- [ ] API documentation updated on public site
- [ ] Security policies documented
- [ ] Terms of Service updated (if needed)
- [ ] Privacy Policy updated (if needed)
- [ ] Team trained on new auth system

---

## Post-Deployment (Week 1)

### Monitoring & Alerts
- [ ] Error rates normal (no spikes)
- [ ] Response times acceptable
- [ ] Database performance acceptable
- [ ] No security alerts triggered
- [ ] Audit logs populated

**Key Metrics to Check:**
```
- Registration success rate: >95%
- Login success rate: >98% (some failed attempts expected)
- Average response time: <200ms
- Database query time: <50ms
- Error rate: <0.5%
```

### User Feedback
- [ ] Collect feedback from early users
- [ ] Check support tickets for auth-related issues
- [ ] Monitor email verification success rate
- [ ] Monitor password reset success rate
- [ ] Address any bugs immediately

### Security Verification
- [ ] No unauthorized access attempts
- [ ] No SQL injection attempts detected
- [ ] No brute-force attacks detected
- [ ] No data breaches
- [ ] Audit logs clean

**Check Audit Logs:**
```sql
-- Successful logins
SELECT COUNT(*) FROM audit_logs 
WHERE event_type = 'user.login' AND success = true;

-- Failed logins
SELECT COUNT(*) FROM audit_logs 
WHERE event_type = 'user.login' AND success = false;

-- Account lockouts
SELECT COUNT(*) FROM audit_logs 
WHERE event_type = 'account.locked';
```

### Performance Optimization
- [ ] Identify slow queries
- [ ] Add indexes if needed
- [ ] Optimize JWT verification
- [ ] Consider caching layer if high traffic
- [ ] Monitor database connections

---

## Post-Deployment (Month 1)

### Usage Analysis
- [ ] Analyze registration patterns
- [ ] Analyze login patterns
- [ ] Identify peak usage times
- [ ] Identify regional patterns
- [ ] Plan capacity for scaling

### Security Analysis
- [ ] Review all audit logs
- [ ] Identify any suspicious patterns
- [ ] Check for brute-force attempts
- [ ] Check for unusual geographic logins
- [ ] Verify no unauthorized access

**Security Review Query:**
```sql
-- Failed logins by user (potential attacks)
SELECT user_id, COUNT(*) as failed_attempts, 
       MAX(created_at) as last_attempt
FROM audit_logs
WHERE event_type = 'user.login' AND success = false
GROUP BY user_id
HAVING COUNT(*) > 3
ORDER BY failed_attempts DESC;

-- Logins from unusual IPs
SELECT DISTINCT ip_address, COUNT(*) as login_count
FROM audit_logs
WHERE event_type = 'user.login'
ORDER BY login_count DESC
LIMIT 20;
```

### Maintenance
- [ ] Update dependencies
- [ ] Review and merge security patches
- [ ] Audit key rotation if applicable
- [ ] Backup audit logs
- [ ] Archive old audit logs (if size is concern)

---

## Ongoing Operations

### Weekly
- [ ] Monitor error rates & performance
- [ ] Review new security alerts
- [ ] Check for failed jobs (email sending, etc.)
- [ ] Verify backups completed

### Monthly
- [ ] Update dependencies (security patches)
- [ ] Review audit logs for anomalies
- [ ] Check account activity (cleanup spam accounts)
- [ ] Verify database backup restoration works

### Quarterly
- [ ] Full security audit
- [ ] Penetration testing (if budget allows)
- [ ] Update security policies
- [ ] Review OWASP Top 10 compliance
- [ ] Plan next features (MFA, OAuth, SSO)

### Annually
- [ ] Full security assessment
- [ ] Compliance audit (GDPR, SOC 2, etc.)
- [ ] Disaster recovery test
- [ ] Architecture review
- [ ] Plan major upgrades

---

## Troubleshooting During Deployment

### Issue: "Database connection failed"
**Cause**: Supabase credentials incorrect or network issue
```bash
# Verify credentials
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# Test connection manually
curl -X GET "$SUPABASE_URL/rest/v1/users?limit=1" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### Issue: "JWT_SECRET not found"
**Cause**: Environment variable not set
```bash
# Verify it's in .env.production
cat .env.production | grep JWT_SECRET

# If empty, generate new one:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Issue: "Registration endpoint returns 500"
**Cause**: Usually password hashing library issue
```bash
# Check if Argon2 is installed
npm list argon2

# If not, scrypt should fallback (built-in)
# Review logs for specific error
```

### Issue: "Email verification not sending"
**Cause**: Email service configuration issue
```bash
# Verify Resend key
echo $RESEND_API_KEY

# Test email sending directly
curl -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "auth@jarvisprime.me",
    "to": "test@example.com",
    "subject": "Test",
    "html": "Test"
  }'
```

---

## Rollback Plan

If deployment fails:

1. **Identify Issue** (within first 30 minutes)
   - Check error logs
   - Verify database connectivity
   - Check API endpoints responding

2. **Notify Team**
   - Alert on-call engineer
   - Update status page
   - Prepare rollback

3. **Rollback Steps**
   ```bash
   # Revert application code to previous version
   git revert HEAD
   npm install
   npm run build
   npm run start

   # If database schema issue:
   # Contact Supabase support for point-in-time restore
   # OR restore from backup

   # Verify functionality
   curl https://api.jarvisprime.me/api/auth/login
   ```

4. **Root Cause Analysis**
   - After system stable, investigate
   - Fix issue in development
   - Re-test thoroughly
   - Redeploy with fixes

---

## Sign-Off

Production deployment sign-off:

- [ ] DevOps: Infrastructure ready
- [ ] Security: Security audit passed
- [ ] QA: All tests passed
- [ ] Product: Feature approved
- [ ] Engineering Lead: Code reviewed

**Deployed by**: _______________  
**Date**: _______________  
**Version**: 1.0.0  

---

## Support Contacts

In case of issues during deployment:

- **On-Call Engineer**: [Phone/Slack]
- **Database Admin**: [Phone/Slack]
- **Security Team**: [Phone/Slack]
- **Infrastructure Team**: [Phone/Slack]

---

**Always have a rollback plan. Test it before deployment.**
