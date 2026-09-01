# syntax=docker/dockerfile:1

# =============================================================================
# Phase 11 automation worker image.
#
# This image runs ONLY the separately supervised Phase 11 automation worker:
#   npm run worker:automation --workspace=apps/api
#
# It is intentionally NOT the API request runtime. It must be deployed as a
# separate, ingress-disabled Azure Container Apps workload and must never be
# co-hosted inside the API App Service process.
#
# Build context: repository ROOT (the monorepo root that owns package-lock.json).
# No secrets and no provider credentials are baked into this image. All runtime
# configuration (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AUTOMATION_WORKER_*,
# PHASE11_APOLLO_READ_ENABLED) is injected at runtime by the platform.
# =============================================================================

# ------------------------------------------------------------------------------
# Stage 1 — deps: install ONLY apps/api production dependencies from the root
# lockfile. This mirrors the proven API deploy workflow install command.
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps

ENV NODE_ENV=production
WORKDIR /app

# Copy only the manifests needed for a deterministic, cache-friendly install.
# The root lockfile is authoritative for the workspace install.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

# Install only apps/api runtime (production) dependencies. This deliberately
# omits dev dependencies (e.g. pg, turbo) and does not install the workspace
# root package itself.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace=apps/api --include-workspace-root=false

# ------------------------------------------------------------------------------
# Stage 2 — runtime: minimal image with production node_modules + API source.
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# Fail-closed defaults. These are non-secret and may be overridden at runtime.
ENV NODE_ENV=production \
    PHASE11_APOLLO_READ_ENABLED=false

WORKDIR /app

# Bring in the resolved production dependency tree and the workspace manifests.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/apps/api/package.json ./apps/api/package.json

# Copy only the API runtime source required by the worker. Tests, integration
# suites, scripts, and env files are excluded via .dockerignore and by scope.
COPY apps/api/src ./apps/api/src

# Run as the built-in unprivileged user; the worker needs no root capabilities.
USER node

# Run from the monorepo root so npm resolves the documented workspace selector
# (`--workspace=apps/api`) against the authoritative root package manifest.
WORKDIR /app

# Container-local liveness check against the worker health server. The health
# port is provided at runtime via AUTOMATION_WORKER_HEALTH_PORT; the platform's
# own ACA probes remain the authoritative supervisor probes.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "const p=process.env.AUTOMATION_WORKER_HEALTH_PORT; if(!p){process.exit(0);} require('http').get({host:'127.0.0.1',port:p,path:'/live',timeout:4000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1));"

# Exact documented worker command. Using the npm workspace script keeps the
# runtime command identical to local and CI usage.
CMD ["npm", "run", "worker:automation", "--workspace=apps/api"]
