# Configuration Management

This directory contains all environment and configuration files for JARVIS PRIME.

## Files

### `.env.example`
Template for all environment variables used across the project. Copy this to `.env.local` for local development.

### `.env.local`
Local development configuration (git-ignored). Create by copying `.env.example`.

### `.env.staging`
Staging environment configuration. Used during staging deployments.

### `.env.production`
Production environment configuration. Never commit this file; use secrets management instead.

### `defaults.json`
Default configuration values for the application.

## Environment Variables by Context

### Local Development
- Use `.env.local`
- Copy from `.env.example`
- Fill in your local values
- Never commit this file

### Staging
- Use `.env.staging`
- Deploys to staging environment
- Similar to production but with staging endpoints
- Can contain test credentials

### Production
- Use actual environment variables
- Never commit `.env.production`
- Use your hosting platform's secrets management:
  - Vercel: Environment Variables dashboard
  - AWS: Secrets Manager or Parameter Store
  - Docker: Use secrets/environment files
  - Kubernetes: ConfigMaps and Secrets
  - GitHub Actions: Secrets

## Required Variables

These variables MUST be set for the application to function:

- `NODE_ENV`
- `DATABASE_URL`
- `JWT_SECRET`
- `NEXT_PUBLIC_API_URL`
- `OPENAI_API_KEY`

## Optional Variables

These variables are optional and enhance functionality:

- Analytics (`NEXT_PUBLIC_GA_ID`, `SENTRY_DSN`)
- External integrations (GitHub, LinkedIn, etc.)
- Monitoring tools (DataDog, New Relic)
- Storage services (S3, GCS)

## Best Practices

1. **Never commit secrets**
   ```bash
   # Add to .gitignore
   .env
   .env.*.local
   .env.production
   ```

2. **Use descriptive names**
   - Prefix with component: `API_`, `NEXT_PUBLIC_`, `SERVICE_`
   - Use UPPER_CASE with underscores
   - Group related variables

3. **Document changes**
   - Update `.env.example` when adding new variables
   - Add comments explaining variable purpose
   - Include format/constraints

4. **Rotate secrets regularly**
   - Change `JWT_SECRET` periodically
   - Rotate API keys
   - Update database credentials

5. **Use secrets management**
   - Never store sensitive data in code
   - Use platform-specific secrets managers
   - Reference secrets in CI/CD pipelines

## Loading Configuration

### In Node.js

```typescript
// Auto-load from .env file (development)
import 'dotenv/config';

// Manual loading
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Access variables
const dbUrl = process.env.DATABASE_URL;
```

### In Next.js

```typescript
// Automatically loads .env.local, .env.production, etc.
// Access in server-side code directly
// Prefix with NEXT_PUBLIC_ for client-side access

export default function Page() {
  return <div>{process.env.NEXT_PUBLIC_API_URL}</div>;
}
```

### In Docker

```dockerfile
# Load from file
ENV_FILE=.env
# Or pass at runtime
docker run --env-file .env.production myapp
```

### In GitHub Actions

```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

## Validation

Always validate environment variables on startup:

```typescript
// lib/env.ts
function validateEnv() {
  const required = [
    'NODE_ENV',
    'DATABASE_URL',
    'JWT_SECRET',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }
}

validateEnv();
```

## Migration from Old Structure

If migrating from old env file locations:

1. Move all `.env*` files from project root to `config/`
2. Move all `.env*` files from `apps/` to `config/`
3. Update references in CI/CD pipelines
4. Update Docker configurations to use `config/.env*`

## Troubleshooting

### Variables not loading

```bash
# Check .env file exists and is readable
ls -la .env.local

# Check for syntax errors
cat .env.local | grep -v "^#" | grep -v "^$"

# Verify values are being read
node -e "require('dotenv').config(); console.log(process.env.YOUR_VAR)"
```

### Different values in different environments

```bash
# Make sure you're using the right file
# Local: .env.local
# Staging: .env.staging (when deploying)
# Production: Platform secrets

# Check which file is being loaded
console.log(`Loaded from: ${process.env.NODE_ENV}`);
```

### Secrets exposed in logs

- Never log sensitive values
- Filter secrets in error tracking
- Use masks in CI/CD logs
- Rotate exposed secrets immediately

## Next Steps

1. Copy `.env.example` to `.env.local`
2. Fill in required values
3. Add `.env.local` to `.gitignore`
4. Test locally: `npm run dev`
5. For production, set up secrets in your platform
