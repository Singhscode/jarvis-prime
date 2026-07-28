# Initial Production Owner Bootstrap Runbook

## 1. Prerequisites

- Operator, Reviewer, Approver, and Recovery Owner approval recorded.
- Approved immutable repository commit checked out with no unreviewed changes.
- Owner full name, controlled company email, and recovery contacts approved.
- Accepted production recovery point available.
- Maintenance, write, and deployment freezes active.
- PostgreSQL 17 Owner bootstrap integration validation passed.
- Root lockfile installation completed before the production database credential is retrieved.
- `PRODUCTION_DATABASE_URL` and the verified Supabase Root 2021 CA file are available from approved sources for session-only injection after dependency installation.
- Shell tracing and terminal recording disabled.
- No concurrent registration, user provisioning, membership write, deployment, or database change in progress.

## 2. Exact production commands

From the approved repository root, install dependencies before retrieving the production credential:

```sh
npm ci
```

Inject the credential and CA path into this session without echoing either value or storing them in shell history:

```sh
read -r -s "PRODUCTION_DATABASE_URL?Enter PRODUCTION_DATABASE_URL: "
printf '\n'
export PRODUCTION_DATABASE_URL
read -r "PRODUCTION_DATABASE_CA_PATH?Enter absolute verified CA path: "
export PRODUCTION_DATABASE_CA_PATH
```

Confirm the session-only values exist without printing them:

```sh
test -n "${PRODUCTION_DATABASE_URL:-}"
test -n "${PRODUCTION_DATABASE_CA_PATH:-}"
case "$PRODUCTION_DATABASE_CA_PATH" in /*) ;; *) exit 1 ;; esac
```

Execute exactly once:

```sh
NODE_ENV=production npm run owner:bootstrap
```

Immediately remove the credential and CA path from the shell after the command exits, including after failure:

```sh
unset PRODUCTION_DATABASE_URL PRODUCTION_DATABASE_CA_PATH
```

Enter the approved full name, email, hidden password, hidden password confirmation, and the exact confirmation phrase requested by the CLI. Do not run any other bootstrap or database command.

## 3. Expected output

Success exits `0` and prints:

```text
OWNER_BOOTSTRAP=PASS
OWNER_ID=<uuid>
AUDIT_ID=<uuid>
```
Failure exits nonzero and prints:

```text
OWNER_BOOTSTRAP=FAIL
ERROR_CODE=<safe-code>
```

## 4. Evidence to capture

- UTC start and end timestamps.
- Approved commit SHA.
- Operator, Reviewer, Approver, and Recovery Owner identities.
- Recovery-point reference.
- Command exit code.
- Sanitized bootstrap output.
- `OWNER_ID` and `AUDIT_ID` on success.
- Results of the verification steps below.

Never capture the password, password hash, database URL, JWT, refresh token, cookies, service-role key, or terminal input.

## 5. Stop conditions

Stop immediately and do not rerun when any of these occurs:

- Missing session variable or non-interactive Terminal.
- Target, project, database, or confirmation rejection.
- `ALREADY_BOOTSTRAPPED` or `EMAIL_ALREADY_EXISTS`.
- `COMMIT_OUTCOME_UNKNOWN`; the CLI could not prove whether PostgreSQL committed.
- Validation, lock, statement, connection, transaction, or final assertion failure.
- Nonzero exit code, unexpected output, process interruption, or connection loss.
- Any concurrent write, deployment, credential, infrastructure, or schema activity.
- Maintenance window or freeze expiry.

Do not bypass a stop with SQL, a seed, an endpoint, migration-history changes, or account edits.

## 6. Recovery procedure

- Before COMMIT is attempted: preserve sanitized evidence, keep freezes active, and investigate the typed failure. Do not retry without a new review and approval.
- During COMMIT, connection loss is ambiguous until the CLI completes automatic fresh-connection reconciliation. If exact Owner and audit state is confirmed, the CLI prints the normal success output.
- On `COMMIT_OUTCOME_UNKNOWN`: do not retry, do not alter the Owner or audit data, keep freezes active, preserve sanitized evidence, and open a database/release incident for read-only reconciliation by the Reviewer and Recovery Owner.
- After `OWNER_BOOTSTRAP=PASS`: do not rerun bootstrap, delete or demote the Owner, add a Client Portal membership, or edit identity data manually.
- For incorrect identity data or credential loss after success: stop, preserve state, and open a separately approved account-recovery incident. Use only a reviewed forward correction or approved recovery procedure.
- Never alter migration history or restore production solely to make bootstrap runnable again.
## 7. Verification steps

After successful output, stop command-line bootstrap activity and verify in order:

1. Sign in at `https://www.jarvisprime.me/dashboard` with the new Owner credentials.
2. Verify Owner Workspace bootstrap and dashboard load without authorization errors.
3. Verify CRM, Clients, Projects, Tasks, Documents, and Settings.
4. Verify logout and session invalidation.
5. Continue the approved Employee Workspace, Client Portal, authentication lifecycle, cross-role denial, CORS, JWT, protected-route, and role-isolation checks.
6. Archive sanitized evidence only after every check passes.

Do not rerun `owner:bootstrap` as a verification step.

## 8. GO / NO-GO checklist

GO requires every item:

- [ ] Approved commit and operator identities recorded.
- [ ] Recovery point, maintenance window, and freezes confirmed.
- [ ] Session-only database credential present and not exposed.
- [ ] Command exits `0`.
- [ ] Output is exactly `OWNER_BOOTSTRAP=PASS`, one Owner ID, and one audit ID.
- [ ] Owner login and complete functional/security verification pass.
- [ ] Sanitized evidence archived.

NO-GO applies if any item is unchecked, any stop condition occurs, or any verification fails. Keep the freeze active and do not declare Phase 8 Released/Frozen on NO-GO.
