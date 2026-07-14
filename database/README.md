# Database Source of Truth

This directory is the version-controlled Supabase project workspace for JARVIS PRIME. API data-access code remains in `apps/api/src/database/`; credentials remain in environment files or the deployment platform.

## Layout

- `supabase/config.toml` — Supabase CLI project configuration.
- `supabase/migrations/` — ordered timestamped SQL migrations. This is the only canonical schema source.
- `seed/` — optional local development data; currently empty.

## Prerequisites

Install the official Supabase CLI and ensure Docker Desktop is running. On macOS, run:

```zsh
brew install supabase/tap/supabase
```

See the [Supabase CLI installation guide](https://supabase.com/docs/guides/local-development) for other platforms.

## Commands

From the repository root:

```zsh
npm run db:reset   # recreate the local database from every migration
npm run db:status  # compare local and linked remote migration history
npm run db:push    # apply pending migrations to an explicitly linked remote
```

`db:push` never runs automatically. Before using it against an existing project, link the project and review `npm run db:status`; reconcile any historical manual changes first. Do not commit secrets, backups, or production data.
