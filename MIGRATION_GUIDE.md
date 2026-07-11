# JARVIS PRIME - Migration Guide

This guide provides step-by-step instructions to migrate from the current folder structure to the production-ready structure defined in `PRODUCTION_STRUCTURE.md`.

## Prerequisites

- Git repository is clean (all changes committed)
- You have backed up the current repository
- You're comfortable with git operations
- Node.js and npm are installed

## Overview

**Current Structure:**
```
jarvis-prime/
├── apps/
│   ├── src/
│   ├── site/
│   └── (config files)
├── packages/
│   ├── engine/
│   └── github-icp-scorer/
├── automation/
├── business/
├── deployment/
├── docker/
├── docs/ + documentation/
├── engine/
├── infrastructure/
├── scripts/
├── services/
├── tests/
└── (root config files)
```

**Target Structure:**
```
jarvis-prime/
├── apps/web/
├── packages/
│   ├── engine/
│   ├── github-icp-scorer/
│   ├── ui/
│   └── shared/
├── services/
│   ├── api/
│   ├── workers/
│   └── webhooks/
├── infrastructure/
│   ├── docker/
│   ├── kubernetes/
│   ├── terraform/
│   └── scripts/
├── docs/
├── tests/
├── tools/scripts/
├── config/
└── .archive/
```

## Phase 1: Preparation (Low Risk)

### Step 1.1: Create New Directory Structure

```bash
cd /home/kabeer/Documents/jarvis-prime

# Create new directories
mkdir -p apps/web
mkdir -p packages/ui packages/shared
mkdir -p services/api services/workers services/webhooks
mkdir -p infrastructure/docker infrastructure/kubernetes infrastructure/terraform infrastructure/scripts
mkdir -p docs/architecture docs/api docs/deployment
mkdir -p tools/scripts tools/generators
mkdir -p config
mkdir -p tests/e2e tests/integration
mkdir -p .archive
```

### Step 1.2: Copy Current Files to New Structure (No Deletions Yet)

```bash
# Copy apps/src content to apps/web/src
cp -r apps/src/* apps/web/src/ 2>/dev/null || true
cp -r apps/site/* apps/web/ 2>/dev/null || true

# Copy main config files
cp apps/public apps/web/ -r 2>/dev/null || true
cp apps/package.json apps/web/ 2>/dev/null || true
cp apps/next.config.mjs apps/web/ 2>/dev/null || true
cp apps/tsconfig.json apps/web/ 2>/dev/null || true
cp apps/tailwind.config.ts apps/web/ 2>/dev/null || true
cp apps/postcss.config.js apps/web/ 2>/dev/null || true
cp apps/.env* apps/web/ 2>/dev/null || true
```

### Step 1.3: Consolidate Documentation

```bash
# Move docs
cp -r docs/* docs/ 2>/dev/null || true
cp -r documentation/* docs/ 2>/dev/null || true
cp README.md docs/README.md
```

### Step 1.4: Move Infrastructure Files

```bash
# Move Docker files
cp docker/* infrastructure/docker/ 2>/dev/null || true
cp docker-compose.yml infrastructure/docker/ 2>/dev/null || true

# Move scripts
cp -r scripts/* tools/scripts/ 2>/dev/null || true

# Move infrastructure configs
cp -r infrastructure/* infrastructure/ 2>/dev/null || true
cp -r deployment/* infrastructure/scripts/ 2>/dev/null || true
```

### Step 1.5: Consolidate Environment Files

```bash
# Move all env files to config/
cp .env* config/ 2>/dev/null || true
cp apps/.env* config/ 2>/dev/null || true
```

### Step 1.6: Archive Old Status Files

```bash
# Move temporary status files
mv AUTOMATION_ENGINE_READY.txt .archive/ 2>/dev/null || true
mv GIT_STATUS.txt .archive/ 2>/dev/null || true
mv MIGRATION_ROADMAP_PHASE_BY_PHASE.txt .archive/ 2>/dev/null || true
mv ORGANIZATION_COMPLETE.txt .archive/ 2>/dev/null || true
mv restructure.js .archive/ 2>/dev/null || true
mv N8N_WORKFLOWS.json .archive/ 2>/dev/null || true
```

## Phase 2: Update Configuration Files (Medium Risk)

### Step 2.1: Update Root `package.json`

```json
{
  "name": "jarvis-prime",
  "version": "2.0.0",
  "private": true,
  "description": "JARVIS PRIME - AI-powered business intelligence platform",
  "workspaces": [
    "apps/*",
    "packages/*",
    "services/*"
  ],
  "scripts": {
    "dev": "turbo run dev --parallel",
    "dev:web": "turbo run dev --filter=@jarvis/web",
    "dev:engine": "turbo run dev --filter=@jarvis/engine",
    "build": "turbo run build",
    "build:web": "turbo run build --filter=@jarvis/web",
    "test": "turbo run test",
    "test:web": "turbo run test --filter=@jarvis/web",
    "test:engine": "turbo run test --filter=@jarvis/engine",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "format": "turbo run format",
    "clean": "turbo run clean && rm -rf node_modules .turbo"
  },
  "devDependencies": {
    "concurrently": "^8.2.2",
    "turbo": "^1.10.16"
  },
  "dependencies": {
    "dotenv": "^17.4.2"
  }
}
```

### Step 2.2: Create Root `turbo.json`

```json
{
  "extends": ["//"],
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*.local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**", ".next/**", "out/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "cache": true
    },
    "type-check": {
      "cache": true
    },
    "format": {
      "cache": false
    }
  },
  "globalEnv": [
    "NODE_ENV"
  ]
}
```

### Step 2.3: Update `apps/web/package.json`

```json
{
  "name": "@jarvis/web",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "format": "prettier --write ."
  },
  "dependencies": {
    "@jarvis/ui": "*",
    "@jarvis/shared": "*",
    "@jarvis/engine": "*",
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.0.0"
  }
}
```

### Step 2.4: Create `packages/shared/package.json`

```json
{
  "name": "@jarvis/shared",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "type-check": "tsc --noEmit"
  },
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./utils": "./src/utils/index.ts",
    "./constants": "./src/constants/index.ts"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### Step 2.5: Create `packages/ui/package.json`

```json
{
  "name": "@jarvis/ui",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "type-check": "tsc --noEmit"
  },
  "exports": {
    ".": "./src/index.ts",
    "./components": "./src/components/index.ts"
  },
  "dependencies": {
    "@jarvis/shared": "*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.0.0"
  }
}
```

## Phase 3: Update Import Paths (High Risk - Requires Testing)

### Step 3.1: Find All Import Statements

```bash
# Find all imports from the old structure
grep -r "from ['\"]\.\./" apps/web/src --include="*.ts" --include="*.tsx"
grep -r "from ['\"]@/" apps/web/src --include="*.ts" --include="*.tsx"
```

### Step 3.2: Update Import Paths

**Before:**
```typescript
import { Button } from "@/components/ui/button"
import { API_BASE_URL } from "@/lib/constants"
import { getUser } from "@/lib/api"
```

**After:**
```typescript
import { Button } from "@jarvis/ui/components"
import { API_BASE_URL } from "@jarvis/shared/constants"
import { getUser } from "@jarvis/shared/utils"
```

### Step 3.3: Create Path Aliases in `tsconfig.json`

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@jarvis/ui": ["packages/ui/src/index.ts"],
      "@jarvis/ui/*": ["packages/ui/src/*"],
      "@jarvis/shared": ["packages/shared/src/index.ts"],
      "@jarvis/shared/*": ["packages/shared/src/*"],
      "@jarvis/engine": ["packages/engine/src/index.ts"],
      "@jarvis/engine/*": ["packages/engine/src/*"],
      "@/*": ["./src/*"]
    }
  }
}
```

## Phase 4: Move Packages (Low Risk - Already Separate)

### Step 4.1: Update `packages/engine/package.json`

```json
{
  "name": "@jarvis/engine",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "node --watch src/server.ts",
    "build": "tsc",
    "test": "jest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@jarvis/shared": "*"
  }
}
```

### Step 4.2: Ensure Consistent Package Naming

All packages should follow the `@jarvis/` namespace convention.

## Phase 5: Testing & Verification (Critical)

### Step 5.1: Run Type Checking

```bash
npm run type-check
```

### Step 5.2: Run Linting

```bash
npm run lint
```

### Step 5.3: Run Tests

```bash
npm run test
```

### Step 5.4: Build All Packages

```bash
npm run build
```

### Step 5.5: Test Development Environment

```bash
npm run dev
```

## Phase 6: Clean Up Old Structure (Point of No Return)

### Step 6.1: Delete Old Directories

```bash
# BACKUP FIRST!
# Only run these if all tests pass

rm -rf apps/src          # Old source folder
rm -rf apps/site         # Old site folder
rm -rf apps/.env*        # Env files now in config/
rm -rf docs/             # Consolidated
rm -rf documentation/    # Consolidated
rm -rf docker/           # Moved to infrastructure/docker/
rm -rf scripts/          # Moved to tools/scripts/
rm -rf deployment/       # Moved to infrastructure/scripts/
rm -rf automation/       # (determine if this should be archived)
rm -rf business/         # (determine if this should be archived)
```

### Step 6.2: Remove Old Root Files (Non-Config)

```bash
rm -f .env*              # Now in config/
rm -f docker-compose.yml # Now in infrastructure/docker/
```

## Phase 7: Update CI/CD Pipelines

### Step 7.1: Update GitHub Actions

**Update `.github/workflows/test.yml`:**
```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test
      - run: npm run build
```

### Step 7.2: Update Vercel Configuration

Ensure `vercel.json` points to the correct root:
```json
{
  "buildCommand": "npm run build --filter=@jarvis/web",
  "installCommand": "npm install",
  "outputDirectory": "apps/web/.next"
}
```

## Phase 8: Documentation Updates

### Step 8.1: Update Root README.md

```markdown
# JARVIS PRIME

AI-powered business intelligence platform for lead generation and enrichment.

## Project Structure

This is a monorepo using Turborepo. See `PRODUCTION_STRUCTURE.md` for detailed structure.

- **apps/web** - Next.js frontend application
- **packages/engine** - Core business logic and AI/ML
- **packages/shared** - Shared utilities and types
- **packages/ui** - Shared UI components
- **services** - Microservices and workers
- **infrastructure** - DevOps and deployment
- **docs** - Documentation
- **tests** - Test suites

## Getting Started

```bash
npm install
npm run dev
```

See docs/deployment/getting-started.md for detailed setup instructions.
```

## Rollback Plan

If anything goes wrong:

```bash
# You have a git backup, so you can rollback:
git reset --hard HEAD~1  # or however many commits back
git clean -fd
```

Or restore from `.archive/` if files weren't deleted yet.

## Timeline

- **Phase 1 (Prep)**: 1-2 hours (safe, no deletions)
- **Phase 2 (Config)**: 1-2 hours (safe, config changes)
- **Phase 3 (Imports)**: 2-4 hours (requires careful updates)
- **Phase 4 (Packages)**: 30 mins (already mostly done)
- **Phase 5 (Testing)**: 1-2 hours (critical verification)
- **Phase 6 (Cleanup)**: 30 mins (one-way operation)
- **Phase 7 (CI/CD)**: 1 hour
- **Phase 8 (Docs)**: 30 mins

**Total**: 8-16 hours of work

## Best Practices During Migration

1. **Commit frequently** - After each phase, make a git commit
2. **Test thoroughly** - Run full test suite after each phase
3. **Use feature branch** - Consider doing this on a separate branch
4. **Document changes** - Update any relevant docs
5. **Notify team** - Let teammates know about changes
6. **Gradual rollout** - Deploy to staging first

## Common Issues & Solutions

### Issue: Import paths break after moving files

**Solution:**
- Update tsconfig.json paths
- Update all relative imports
- Check for hardcoded paths in code

### Issue: Package dependencies not found

**Solution:**
- Run `npm install` after package.json changes
- Verify `@jarvis/` namespace is correct
- Check workspace configuration

### Issue: Build fails after reorganization

**Solution:**
- Run `npm run type-check` to find type errors
- Run `npm run lint` to find linting issues
- Check for circular dependencies

### Issue: Turborepo cache invalidated

**Solution:**
- Run `npm run clean` to clear cache
- Rebuild from scratch: `npm run build`
- Consider clearing `.turbo/` folder

## Next Steps

1. Choose a quiet time to start migration (no ongoing PRs)
2. Create a feature branch: `git checkout -b feat/migrate-structure`
3. Follow phases 1-5 first to validate
4. Get team review before phase 6 cleanup
5. Deploy changes and monitor
6. Communicate changes to team

## Support

For questions or issues during migration:
- Check this guide again
- Review `PRODUCTION_STRUCTURE.md`
- Check the git history for related changes
- Consult with team leads
