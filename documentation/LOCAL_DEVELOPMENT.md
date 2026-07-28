# Local Owner Workspace development

This workflow uses Docker-managed Local Supabase and disposable `.test` records only. It never needs a remote project, production credential, `supabase link`, or `db push`.

## Prerequisites

Install Node 20+, npm, Docker Desktop, and the Supabase CLI. Start Docker Desktop, then confirm it is ready:

```zsh
docker info
npm ci
supabase --workdir database start
```

Create local application files from the templates:

```zsh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
supabase --workdir database status -o env
```

Copy only the local `API_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY` values into the matching ignored files. Set `LOCAL_OWNER_DATABASE_URL` to the local `postgresql://...@127.0.0.1:54322/postgres` value. Never paste those values into source control.

Generate independent API and portal secrets with:

```zsh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Use three outputs for `AUTOMATION_SERVER_SECRET`, `JWT_SECRET`, and `ENCRYPTION_KEY`; use two more for `PORTAL_PASSWORD` and `PORTAL_COOKIE_SECRET`. Set a 12+ character value for `LOCAL_OWNER_PASSWORD` and `LOCAL_EMPLOYEE_PASSWORD`.

## Initialize disposable local data

`db:reset` deletes the Local Supabase database volume and reapplies every tracked migration. Do not run it against anything you want to keep.

```zsh
npm run db:reset
JARVIS_LOCAL_OWNER_BOOTSTRAP=1 npm run owner:bootstrap:local --workspace=apps/api
JARVIS_LOCAL_OWNER_SEED=1 npm run seed:owner-workspace:local --workspace=apps/api
```

Both scripts require development mode, dry-run mode, scheduler disabled, a loopback PostgreSQL URL, and a `@jarvis.test` Owner email. They reject any other target. The local Owner flow is separate from and does not invoke the production bootstrap command.

## Start and sign in

Run these in separate terminals:

```zsh
npm run dev:api
npm run dev:web
```

Open `http://localhost:3000`, enter `PORTAL_PASSWORD`, then sign into `/dashboard` with `LOCAL_OWNER_EMAIL` and `LOCAL_OWNER_PASSWORD`.

## Real API and database verification

With the API running, this creates uniquely named disposable records through the authenticated Owner APIs and checks each record in Local PostgreSQL plus the corresponding list endpoint:

```zsh
JARVIS_LOCAL_OWNER_WORKSPACE_VERIFY=1 npm run verify:owner-workspace:local --workspace=apps/api
```

It verifies Create Company, Contact, Lead, Convert Lead to Client, Project, Task, Employee Invitation, and Document Upload. Employee invitations remain dry-run; no email is sent. The Dashboard forms use the same endpoints and reload their scoped lists after successful writes.
