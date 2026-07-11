# JARVIS PRIME - Production-Ready Folder Structure

This document defines the recommended production-ready folder structure for JARVIS PRIME. This represents the **target state** for the project.

## Overall Architecture

```
jarvis-prime/
├── .github/                          # GitHub specific files
│   ├── workflows/                    # CI/CD pipelines
│   │   ├── test.yml
│   │   ├── deploy-staging.yml
│   │   └── deploy-production.yml
│   └── ISSUE_TEMPLATE/
│
├── apps/                             # Application workspace
│   ├── web/                          # Next.js frontend (primary app)
│   │   ├── src/
│   │   │   ├── app/                  # Next.js App Router
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx
│   │   │   │   ├── api/              # API routes
│   │   │   │   ├── dashboard/
│   │   │   │   ├── leads/
│   │   │   │   ├── agencies/
│   │   │   │   └── tasks/
│   │   │   ├── components/           # Reusable React components
│   │   │   │   ├── dashboard/
│   │   │   │   ├── leads/
│   │   │   │   ├── common/
│   │   │   │   └── ui/
│   │   │   ├── lib/                  # Utilities and helpers
│   │   │   │   ├── api.ts
│   │   │   │   ├── auth.ts
│   │   │   │   ├── db.ts
│   │   │   │   └── utils.ts
│   │   │   ├── types/                # TypeScript type definitions
│   │   │   ├── styles/               # Global styles
│   │   │   ├── hooks/                # React custom hooks
│   │   │   └── middleware.ts
│   │   ├── public/                   # Static assets
│   │   ├── package.json
│   │   ├── next.config.mjs
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   ├── .env.example
│   │   └── README.md
│   │
│   └── (future: mobile, admin, etc.)
│
├── packages/                         # Shared packages and libraries
│   ├── engine/                       # Backend AI engine / core logic
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   ├── ai/
│   │   │   │   ├── enrichment/
│   │   │   │   ├── leads/
│   │   │   │   └── tasks/
│   │   │   ├── controllers/
│   │   │   ├── models/
│   │   │   ├── utils/
│   │   │   ├── types/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── github-icp-scorer/            # GitHub ICP scoring module
│   │   ├── src/
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── ui/                           # Shared UI component library
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   └── ...
│   │   │   ├── hooks/
│   │   │   ├── types/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── shared/                       # Shared utilities and constants
│       ├── src/
│       │   ├── constants/
│       │   ├── types/
│       │   ├── utils/
│       │   │   ├── api.ts
│       │   │   ├── date.ts
│       │   │   ├── format.ts
│       │   │   └── validation.ts
│       │   └── index.ts
│       ├── package.json
│       └── README.md
│
├── services/                         # Microservices and workers
│   ├── api/                          # API gateway / backend server
│   │   ├── src/
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── workers/                      # Background job workers
│   │   ├── src/
│   │   │   ├── jobs/
│   │   │   ├── queue/
│   │   │   └── handlers/
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── webhooks/                     # Webhook handlers
│   │   ├── src/
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── enrichment/                   # Data enrichment service
│       ├── src/
│       ├── package.json
│       └── README.md
│
├── infrastructure/                   # DevOps and Infrastructure
│   ├── docker/
│   │   ├── Dockerfile.web            # Frontend build
│   │   ├── Dockerfile.api            # API server
│   │   ├── Dockerfile.engine         # Engine service
│   │   ├── docker-compose.yml        # Local development
│   │   ├── docker-compose.prod.yml   # Production-like setup
│   │   └── .dockerignore
│   │
│   ├── kubernetes/
│   │   ├── deployments/
│   │   ├── services/
│   │   ├── ingress/
│   │   └── configmaps/
│   │
│   ├── terraform/                    # Infrastructure as Code
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── vpc.tf
│   │   ├── rds.tf
│   │   ├── elasticache.tf
│   │   └── modules/
│   │
│   └── scripts/
│       ├── deploy.sh
│       ├── migrate.sh
│       ├── seed.sh
│       ├── backup.sh
│       └── health-check.sh
│
├── docs/                             # Documentation
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── system-design.md
│   │   └── data-flow.md
│   │
│   ├── api/
│   │   ├── README.md
│   │   ├── endpoints.md
│   │   └── authentication.md
│   │
│   ├── deployment/
│   │   ├── README.md
│   │   ├── getting-started.md
│   │   ├── production.md
│   │   └── troubleshooting.md
│   │
│   ├── contributing.md
│   ├── setup.md
│   └── README.md
│
├── tests/                            # Test suites
│   ├── e2e/
│   │   ├── auth.spec.ts
│   │   ├── dashboard.spec.ts
│   │   ├── leads.spec.ts
│   │   └── README.md
│   │
│   ├── integration/
│   │   ├── api.test.ts
│   │   ├── engine.test.ts
│   │   └── README.md
│   │
│   ├── fixtures/                    # Test data
│   ├── setup.ts                     # Test configuration
│   └── README.md
│
├── tools/                            # Development tools and utilities
│   ├── scripts/
│   │   ├── setup.sh                 # Initial setup
│   │   ├── dev.sh                   # Start dev environment
│   │   ├── lint.sh                  # Run linters
│   │   ├── format.sh                # Code formatting
│   │   ├── test.sh                  # Run tests
│   │   ├── build.sh                 # Build all apps
│   │   ├── clean.sh                 # Clean build artifacts
│   │   └── generate-types.sh        # Generate TypeScript types
│   │
│   └── generators/                  # Code generators
│       ├── component.js
│       ├── service.js
│       ├── api-route.js
│       └── README.md
│
├── config/                           # Centralized configuration
│   ├── .env.example                 # Template for all env vars
│   ├── .env.local                   # Local development (git ignored)
│   ├── .env.staging                 # Staging deployment
│   ├── .env.production              # Production deployment
│   ├── defaults.json                # Default configuration
│   └── README.md
│
├── Root Configuration Files (Minimal)
│   ├── package.json                 # Root workspace configuration
│   ├── package-lock.json            # Dependency lock
│   ├── turbo.json                   # Turborepo configuration
│   ├── tsconfig.json                # Base TypeScript config
│   ├── docker-compose.yml           # Local dev environment
│   ├── vercel.json                  # Vercel deployment config
│   ├── .gitignore                   # Git ignore rules
│   ├── .prettierrc.json             # Code formatting
│   ├── .eslintrc.json               # Linting rules
│   ├── LICENSE
│   ├── README.md                    # Main project README
│   └── CONTRIBUTING.md              # Contributing guide
│
└── .archive/ (Optional)              # Archive old files
    ├── MIGRATION_ROADMAP_PHASE_BY_PHASE.txt
    ├── ORGANIZATION_COMPLETE.txt
    └── (other status files)
```

## Key Principles

### 1. **Monorepo Structure**
- Use Turborepo for managing multiple packages
- Each app/package is independently deployable
- Shared code lives in `packages/`

### 2. **Clear Separation of Concerns**
- **apps/** - User-facing applications
- **packages/** - Reusable libraries and core logic
- **services/** - Microservices and workers
- **infrastructure/** - DevOps and deployment
- **tools/** - Development utilities
- **docs/** - Documentation
- **tests/** - End-to-end and integration tests

### 3. **Environment Configuration**
- All env files centralized in `config/`
- One `.env.example` template
- Environment-specific configs for local, staging, production

### 4. **Scalability**
- Easy to add new apps (`apps/mobile`, `apps/admin`)
- Easy to add new packages (`packages/analytics`, `packages/notifications`)
- Easy to add new services (`services/auth`, `services/notifications`)

### 5. **DevOps Ready**
- Docker configs for each service
- Kubernetes manifests for container orchestration
- Terraform for infrastructure as code
- Centralized deployment scripts

## Package Organization

### `packages/engine/`
- Core AI/ML logic
- Business rules and algorithms
- Database models
- Service layer
- **Does NOT depend on UI or Next.js**

### `packages/ui/`
- Reusable React components
- Design system components
- Hooks and UI utilities
- **Only depends on React**

### `packages/shared/`
- Types and interfaces
- Constants and enums
- Utility functions
- Validation schemas
- **Zero dependencies outside node_modules**

### `packages/github-icp-scorer/`
- GitHub ICP scoring algorithm
- Standalone module
- Can be used by multiple services

## Workspace Dependencies

```
apps/web
├── depends on: packages/ui, packages/shared, packages/engine
├── imports from: @jarvis/ui, @jarvis/shared, @jarvis/engine

services/api
├── depends on: packages/engine, packages/shared
├── imports from: @jarvis/engine, @jarvis/shared

services/workers
├── depends on: packages/engine, packages/shared
├── imports from: @jarvis/engine, @jarvis/shared
```

## Configuration

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
```json
{
  "pipeline": {
    "build": { "outputs": ["dist/**", "build/**"] },
    "test": { "cache": false },
    "lint": {},
    "type-check": {}
  }
}
```

## Benefits of This Structure

✅ **Scalable** - Easy to add new apps and services
✅ **Maintainable** - Clear separation of concerns
✅ **Testable** - Independent testing per package
✅ **Deployable** - Each service can be deployed separately
✅ **Developer-friendly** - Clear folder hierarchy
✅ **CI/CD Ready** - Supports automated pipelines
✅ **Type-safe** - Shared TypeScript configuration
✅ **Production-ready** - Follows industry best practices

## Migration Path

See `MIGRATION_GUIDE.md` for step-by-step instructions on migrating the existing codebase to this structure.
