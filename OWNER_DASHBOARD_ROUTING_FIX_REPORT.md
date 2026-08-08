# Owner Dashboard Routing Fix Report

## Confirmed root cause
`apps/web/src/proxy.ts` treated `/dashboard` as a legacy Operations Portal path. With no valid `portal_token`, its proxy redirected the Owner route to `/portal-auth` before `OwnerSessionBoundary` could render.

## Exact minimal change
Removed `/dashboard` from both the proxy's `protectedPaths` list and `matcher`. No Owner authentication, API contract, database, migration, or UI implementation was changed.

## Legacy Operations Portal routes still protected
- `/leads` and `/leads/:path*`
- `/tasks` and `/tasks/:path*`
- `/api/:path*` remains matched for the existing proxy API rate limiter.

## Focused live routing verification
The existing local Next development server in `apps/web` picked up the change without a restart.

| Request | Result |
| --- | --- |
| `http://localhost:3000/dashboard` | `200 OK`; no redirect to `/portal-auth` |
| `http://localhost:3000/leads` | `307 Temporary Redirect` to `/portal-auth` |
| `http://localhost:3000/tasks` | `307 Temporary Redirect` to `/portal-auth` |

## Owner login and Employee workflow verification
- The focused Owner dashboard test passed (4/4), including the existing “Sign in to continue” form and `/api/auth/login` flow.
- The full API suite passed (90/90), including Owner authorization, Employee list projection without `department`, valid invitation HTTP 201 behavior, employee-code response, audit/rate-limit behavior, and migration compatibility.
- The full web suite passed (26/26), including the Employees page, Invite Employee dialog, successful invitation UI, and immediate `JP-EMP-…` display.
- No live Owner login or invitation was submitted: no credentials were inspected and a real invitation would mutate the database, which this task prohibited.

## Required validation
- `npm run lint`: passed.
- `npm run type-check --workspace=apps/web`: passed.
- `npm run test`: passed — API 90/90, Web 26/26, ICP scorer 16/16.
- `npm run build`: passed.

No production or remote resource was accessed. No commit, merge, push, or deployment was performed.
