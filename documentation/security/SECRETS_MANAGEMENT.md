# 🔐 JARVIS PRIME — Secrets Management Guide

**Phase 1A: Security Foundation**  
**Status:** ✅ Implemented  
**Last Updated:** July 10, 2026

---

## Golden Rules

1. **Never commit a secret** — all `.env*` files (except `.env.*.example`, `.env.development`, `.env.test`) are gitignored.
2. **Never hardcode an API key** — always read from `process.env`.
3. **Use separate secrets per environment** — dev keys can't touch production data.
4. **Production requires strong secrets** — the engine refuses to start with the default `dev-secret`.
5. **Rotate secrets if leaked** — treat any exposed key as compromised immediately.

---

## Environment Files Reference

### What's Committed to Git (Safe — No Real Secrets)

| File | Purpose |
|------|---------|
| `engine/.env.example` | Complete reference for all engine variables |
| `engine/.env.development` | Safe defaults for local development |
| `engine/.env.test` | Stub values for CI/CD test runs |
| `engine/.env.production` | Template with `REPLACE_WITH_*` placeholders |
| `apps/site/.env.example` | Complete reference for all site variables |
| `apps/site/.env.development` | Safe defaults for local development |
| `apps/site/.env.test` | Stub values for CI/CD |
| `apps/site/.env.production` | Template with `REPLACE_WITH_*` placeholders |

### What's Gitignored (Contains Real Secrets)

| File | Where Real Values Live |
|------|------------------------|
| `engine/.env` | Your machine only (local override) |
| `apps/site/.env.local` | Your machine only (local override) |
| **Production secrets** | GitHub Actions Environments → production |
| **Staging secrets** | GitHub Actions Environments → staging |

---

## Local Development Setup

### First-time setup

```bash
# Engine
cd engine
cp .env.example .env
# Edit .env and fill in your personal dev keys

# Site
cd apps/site
cp .env.example .env.local
# Edit .env.local and fill in your values
```

### Env file loading order (engine)

The engine loads variables in this priority order:

```
1. process.env (already set by system/CI)
2. .env.<NODE_ENV>   (e.g. .env.development — committed, safe defaults)
3. .env              (gitignored, your local overrides)
```

This means:
- `DRY_RUN=true` is set by `.env.development`
- Your `.env` file overrides it if you set `DRY_RUN=false`
- CI never uses your `.env` (it doesn't exist on the CI runner)

---

## CI/CD Secrets

Secrets in GitHub Actions are injected via [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments).

### Environments & Protection Rules

| Environment | Triggered By | Protection |
|-------------|-------------|-----------|
| `staging` | Push to `main` | None (auto-deploys) |
| `production` | Push of tag `v*.*.*` | Manual approval required |

### Setting Up GitHub Environment Secrets

1. Go to: GitHub → Your Repo → Settings → Environments
2. Create environments: `staging` and `production`
3. For `production`, add required reviewers (yourself for now)
4. Add secrets under each environment

### Required Secrets Per Environment

**Both staging and production:**
```
DEPLOY_SSH_KEY         → Private SSH key for server access
DEPLOY_HOST            → Server hostname/IP
DEPLOY_USER            → SSH username
DEPLOY_PATH            → Path on server (e.g. /srv/jarvis-engine)
VERCEL_TOKEN           → From vercel.com/account/tokens
VERCEL_ORG_ID          → From vercel.com/account
VERCEL_PROJECT_ID      → From your Vercel project settings
```

**Staging-only:**
```
STAGING_ENGINE_URL     → https://staging-engine.yourdomain.com
STAGING_SITE_URL       → https://staging.jarvisprime.me
```

**Production-only:**
```
PRODUCTION_ENGINE_URL  → https://engine.jarvisprime.me
PRODUCTION_DEPLOY_SSH_KEY → Separate key from staging
PRODUCTION_HOST
PRODUCTION_USER
PRODUCTION_PATH
```

### How Engine Gets Its Secrets in Production

The engine reads secrets from environment variables set on the server, **not** from `.env` files (those are gitignored and never deployed). Two approaches:

**Option A: systemd environment file (recommended for VPS)**
```bash
# On server, create /etc/jarvis/engine.env (chmod 600, owned by deploy user)
# In /etc/systemd/system/jarvis-engine.service:
[Service]
EnvironmentFile=/etc/jarvis/engine.env
ExecStart=/usr/bin/node /srv/jarvis-engine/src/runner.js --server
```

**Option B: PM2 ecosystem file (simpler)**
```javascript
// ecosystem.config.cjs — DO NOT commit if it contains real values
module.exports = {
  apps: [{
    name: 'jarvis-engine',
    script: 'src/runner.js',
    args: '--server',
    env_production: {
      NODE_ENV: 'production',
      // All other secrets injected by CI/CD via --env flag
    }
  }]
};
```

**Option C: Docker / cloud (most secure)**
- Inject secrets via Docker `-e` flags or Kubernetes Secrets
- Never put real values in the image or repository

---

## Generating Strong Secrets

### Automation Server Secret (required for production)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Example output: a3f8b2c1e7d4f6a9b0c3d5e2f1a4b7c8d9e0f2a3b4c5d6e7f8a9b0c1d2e3f4a5
```

### Validating Your Setup

```bash
# Run the doctor command — checks all provider secrets
cd engine
npm run doctor

# Example output:
#   database   configured ✓
#   apollo     configured ✓
#   groq       configured ✓
#   resend     configured ✓
#   linkedin   NOT configured (optional)
```

---

## Secret Rotation Procedure

### When to rotate
- Immediately if a secret is accidentally committed to git
- Quarterly for production keys
- When a team member leaves

### How to rotate

1. **Generate new secret** (using command above)
2. **Update the provider first** (e.g. Resend dashboard → create new API key)
3. **Update GitHub Environment secrets** (Settings → Environments)
4. **Trigger a deploy** — new secret is live
5. **Revoke the old secret** in the provider dashboard
6. **Record rotation** in your security log

### If a Secret Is Accidentally Committed

```bash
# 1. Invalidate the secret IMMEDIATELY in the provider dashboard
# 2. Remove it from git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch path/to/file-with-secret' \
  --prune-empty --tag-name-filter cat -- --all

# OR use git-filter-repo (recommended, faster)
pip install git-filter-repo
git filter-repo --path path/to/file-with-secret --invert-paths

# 3. Force push
git push --force --all
git push --force --tags

# 4. Rotate the leaked secret (it's already compromised)
# 5. Notify your team
```

---

## Security Checklist

### Before First Deploy

- [ ] `AUTOMATION_SERVER_SECRET` is a random 64-char hex string (not `dev-secret`)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is a production key (not the dev key)
- [ ] `RESEND_API_KEY` is configured for your production domain
- [ ] `FROM_EMAIL` domain has SPF, DKIM, and DMARC records
- [ ] `CORS_ORIGINS` is restricted to your production domain only
- [ ] `DRY_RUN=false` is set explicitly in production
- [ ] GitHub Environment protection rules require approval for production
- [ ] No `.env` file exists on the CI runner (verify in workflow logs)

### Ongoing Security

- [ ] Rotate all secrets quarterly
- [ ] Review GitHub Secrets access logs monthly
- [ ] Run `npm run doctor` after any deployment
- [ ] Monitor for leaked secrets with gitleaks (runs in CI on every push)

---

## Environment Variables Quick Reference

| Variable | Dev | Test | Production |
|----------|-----|------|-----------|
| `NODE_ENV` | `development` | `test` | `production` |
| `DRY_RUN` | `true` | `true` | `false` |
| `AUTOMATION_SERVER_SECRET` | `dev-secret-change-me` | `test-secret` | Strong random hex |
| `SUPABASE_URL` | Your dev project | Empty (in-memory) | Production project |
| `CORS_ORIGINS` | `localhost:3000` | `localhost:3000` | `https://jarvisprime.me` |
| `SCHEDULER_ENABLED` | `false` | `false` | `true` |
| `DAILY_SEND_LIMIT` | `10` | `5` | `100` |

---

## Threat Model

### What This Protects Against

✅ Secrets leaked to git history  
✅ Secrets exposed in CI logs  
✅ Dev keys used in production  
✅ Production deployed without approval  
✅ Brute-force of the automation API  
✅ CORS bypass from unknown origins  

### What This Does NOT Protect Against (Phase 1B/1C)

❌ Encrypted database fields (→ Phase 1B)  
❌ Per-tenant isolation (→ Phase 1C)  
❌ OAuth token storage (→ Phase 2B)  
❌ Secrets auto-rotation (→ future: Doppler/AWS SSM)  

---

## Next Steps

- **Phase 1B**: Encrypt sensitive database columns (tokens, OAuth credentials)
- **Phase 1C**: Add tenant isolation with Supabase RLS
- **Future**: Migrate from `.env` files to Doppler or AWS Secrets Manager for zero-touch rotation

See: `MIGRATION_ROADMAP_PHASE_BY_PHASE.txt` for full roadmap.
