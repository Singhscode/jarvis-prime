# Turborepo Configuration Guide

This guide explains the production-ready Turborepo configuration for JARVIS PRIME.

## Overview

Turborepo optimizes monorepo workflows by:
- Running tasks in parallel
- Caching build artifacts
- Detecting dependencies automatically
- Streaming output smartly

## Configuration Files

### Current Setup
- `turbo.json` - Current configuration (may need updates)
- `turbo.production.json` - Production-ready configuration

## Key Concepts

### Tasks
Each task is independently configured with:
- **dependsOn**: Tasks that must complete first
- **outputs**: Files/directories to cache
- **cache**: Whether to cache results
- **persistent**: For long-running processes (dev servers)
- **outputMode**: How to display output

### Output Modes
- `auto` - Turbo decides (usually full)
- `stream` - Show output as it happens (for dev/watch)
- `full` - Always show full output
- `hash-only` - Show only task hash

### Task Dependencies
- `^build` - Depends on `build` in all dependencies
- `build` - Depends on `build` in same package only
- `[]` - No dependencies

## Default Configuration

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build", "^type-check"],
      "outputs": ["dist/**", ".next/**"],
      "cache": true,
      "env": ["NODE_ENV=production"]
    }
  }
}
```

## Task Definitions

### `build`
**Purpose**: Production build for all packages
**Dependencies**: Must build dependencies first
**Caching**: Enabled (safe to cache)
**Environment**: Production

```bash
npm run build          # Build everything
turbo run build        # Same with turbo
npm run build:web     # Build only web app
```

### `dev`
**Purpose**: Start development environments
**Caching**: Disabled (not safe to cache)
**Persistent**: Yes (long-running)
**Output**: Streamed in real-time

```bash
npm run dev           # Start all dev servers
npm run dev:web      # Start only web dev server
npm run dev:engine   # Start only engine dev server
```

### `test`
**Purpose**: Run all tests
**Dependencies**: Must build first
**Caching**: Enabled
**Environment**: Test environment

```bash
npm run test              # Run all tests
npm run test:web         # Test only web
npm run test:integration # Only integration tests
npm run test:e2e         # End-to-end tests
```

### `lint`
**Purpose**: Check code quality
**Caching**: Enabled
**Output**: Summary only

```bash
npm run lint          # Check all
npm run lint:fix      # Fix issues
```

### `type-check`
**Purpose**: TypeScript type checking
**Caching**: Enabled
**Dependencies**: Required for builds

```bash
npm run type-check          # Check all
npm run type-check:watch   # Watch mode
```

### `format`
**Purpose**: Code formatting
**Caching**: Disabled (not idempotent)

```bash
npm run format        # Format all
npm run format:check  # Check only
```

### `clean`
**Purpose**: Remove build artifacts
**Caching**: Disabled

```bash
npm run clean
```

### `start`
**Purpose**: Production start
**Persistent**: Yes
**Environment**: Production

```bash
npm start
npm run start:web
npm run start:engine
```

## Workspace Structure

### Apps
- `apps/web` - Next.js frontend
  - Depends on: `@jarvis/ui`, `@jarvis/shared`
  - Scripts: `dev`, `build`, `test`, `lint`

### Packages
- `packages/engine` - Core business logic
  - Depends on: `@jarvis/shared`
  - Scripts: `dev`, `build`, `test`

- `packages/ui` - React components
  - Depends on: `@jarvis/shared`
  - Scripts: `build`, `test`

- `packages/shared` - Utilities and types
  - Depends on: none
  - Scripts: `type-check`

### Services
- `services/api` - REST API
- `services/workers` - Background jobs
- `services/webhooks` - Webhook handlers

## Cache Management

### What Gets Cached
- Build outputs
- Test coverage
- Type-check results
- Lint results

### Cache Keys
Turbo uses file hashing:
- Source files
- Dependencies (package-lock.json)
- Environment variables (listed in `globalEnv`)

### Clear Cache
```bash
rm -rf .turbo
turbo cache clean
npm run clean
```

### Remote Caching
For CI/CD pipelines, enable remote caching:

```bash
turbo login
turbo link
```

Configuration in `turbo.json`:
```json
{
  "remoteCache": {
    "enabled": true
  }
}
```

## Global Dependencies

Files that affect all packages:
```json
{
  "globalDependencies": [
    "**/.env.*.local",
    "**/tsconfig.json",
    "package.json"
  ]
}
```

Changes to these files invalidate cache for all packages.

## Global Environment Variables

Variables that affect all tasks:
```json
{
  "globalEnv": [
    "NODE_ENV",
    "CI",
    "TURBO_CACHE_DIR"
  ]
}
```

When these change, all caches are invalidated.

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Build
  run: npm run build

- name: Test
  run: npm run test

- name: Lint
  run: npm run lint
```

### Speeding Up CI
```yaml
- name: Restore Cache
  uses: actions/cache@v3
  with:
    path: .turbo
    key: ${{ runner.os }}-turbo-${{ github.sha }}
    restore-keys: |
      ${{ runner.os }}-turbo-

- name: Build
  run: npm run build

- name: Save Cache
  uses: actions/cache@v3
  with:
    path: .turbo
    key: ${{ runner.os }}-turbo-${{ github.sha }}
```

## Common Commands

### Development
```bash
npm run dev              # All dev servers
npm run dev:web        # Just frontend
npm run dev:engine     # Just engine
```

### Building
```bash
npm run build           # Everything
npm run build:web      # Just web
npm run build --filter=@jarvis/web  # Specific package
```

### Testing
```bash
npm run test            # All tests
npm run test:web       # Just web tests
npm run test:unit      # Unit tests only
npm run test:e2e       # E2E tests only
```

### Quality
```bash
npm run lint            # Check code
npm run lint:fix       # Fix issues
npm run type-check     # Check types
npm run format         # Format code
```

### Filtering
```bash
turbo run build --filter=@jarvis/web        # One package
turbo run build --filter=apps/*              # All apps
turbo run build --filter=...@jarvis/web      # Web + dependents
turbo run build --filter=@jarvis/web...      # Web + dependencies
```

## Configuration Files Structure

### Root `package.json`
```json
{
  "workspaces": [
    "apps/*",
    "packages/*",
    "services/*"
  ]
}
```

### Root `turbo.json`
- Defines tasks globally
- Used by all packages
- Can be overridden per-package

### Per-Package `package.json`
```json
{
  "name": "@jarvis/web",
  "scripts": {
    "build": "next build",
    "dev": "next dev"
  }
}
```

## Performance Tips

1. **Use specific filters**
   ```bash
   npm run build --filter=@jarvis/web  # Faster than full build
   ```

2. **Enable remote caching**
   ```bash
   turbo login
   turbo link
   ```

3. **Don't cache everything**
   - Only cache outputs that are expensive to generate
   - Test results should always re-run in CI
   - Dev servers should never be cached

4. **Use persistent tasks**
   ```json
   {
     "dev": {
       "persistent": true,
       "cache": false
     }
   }
   ```

5. **Optimize dependencies**
   - Keep dependency graph flat
   - Avoid circular dependencies
   - Minimize shared code bloat

## Migration from Old Config

### Step 1: Backup
```bash
cp turbo.json turbo.json.bak
```

### Step 2: Compare
```bash
diff turbo.json turbo.production.json
```

### Step 3: Update
```bash
cp turbo.production.json turbo.json
```

### Step 4: Test
```bash
npm run clean
npm run build
npm run test
```

## Troubleshooting

### Tasks not running in parallel
Check `dependsOn` - remove unnecessary dependencies:
```json
{
  "test": {
    "dependsOn": ["^build"]  // Only if needed
  }
}
```

### Cache not working
```bash
# Clear cache
rm -rf .turbo

# Check what's cached
turbo run build --verbose

# Enable debug
TURBO_LOG_ORDER=stream npm run build
```

### "Task failed" errors
```bash
# See full output
turbo run build --no-cache

# Check specific package
turbo run build --filter=@jarvis/web
```

### Remote cache issues
```bash
# Verify connection
turbo login

# Test push
turbo run build --force

# Check status
turbo cache status
```

## Next Steps

1. Review production-ready config: `turbo.production.json`
2. Update root `turbo.json` with new settings
3. Test builds and development workflow
4. Configure remote caching for CI/CD
5. Document team practices

## Resources

- [Turborepo Docs](https://turbo.build)
- [Task Configuration](https://turbo.build/repo/docs/reference/configuration)
- [Caching Strategy](https://turbo.build/repo/docs/core-concepts/caching)
- [Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)
