# Local database development

`database/supabase/migrations/` is the canonical schema source for JARVIS PRIME. Local development uses the Docker-managed Supabase CLI stack only.

## Prerequisites

Install Docker Desktop and the Supabase CLI. On macOS:

```zsh
brew install supabase/tap/supabase
docker info
```

## Local-only commands

Run from the repository root:

```zsh
supabase --workdir database start
npm run db:status
npm run db:reset
```

`db:reset` deletes and recreates the disposable Local Supabase database, then applies every migration. It is appropriate only for local data. Obtain local API keys and the local PostgreSQL URL with:

```zsh
supabase --workdir database status -o env
```

Put values only in ignored local environment files. Do not use `supabase link`, `db push`, or a remote database URL for the local Owner Workspace workflow. Continue with [Local Owner Workspace development](../documentation/LOCAL_DEVELOPMENT.md).
