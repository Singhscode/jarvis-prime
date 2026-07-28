# Final review changes

## Review issues and resolutions
| Final-review issue | Resolution | Primary files |
|---|---|---|
| Preflight was not safely reproducible and fingerprint was `PENDING`. | Kept the gate in `BEGIN READ ONLY`, added a verified PG17 fingerprint, exact catalog/default-ACL sets, role/version/history/data checks, and immediate exceptions. | `00_read_only_preflight.sql`, `00_bootstrap_pg17.sql` |
| PostgreSQL 17 default privileges were counted as 33 and ignored `MAINTAIN`. | Replaced count-only logic with an exact 36-entry role/object/privilege set comparison. | `00_read_only_preflight.sql` |
| Local `pgcrypto` polluted `public`, unlike Supabase. | Installed the extension into the synthetic `extensions` schema so public-function and fingerprint checks match the reviewed surface. | `00_bootstrap_pg17.sql` |
| Containment did not prove least privilege and retained broad service grants/defaults. | Transactionally revokes browser/PUBLIC/service legacy grants and defaults, regrants only the temporary lead canary, and asserts exact service/browser/default posture plus BYPASSRLS. | `01_contain_browser_access.sql` |
| Legacy reconciliation could read dependencies before validating them and did not reject all type/nullability drift. | Moved dependency checks before baseline reads; added exact 12-column shape/default set, required-relation, trigger, FK, row-count and content-hash checks in one transaction. | `02_reconcile_legacy_leads.sql`, migration `00011` |
| Email uniqueness lacked sufficient state guards. | Transaction validates email shape/nulls/duplicates, candidate collision, legacy-index validity/readiness/non-uniqueness, existing constraints, and row hash/count preservation. | `03_enforce_leads_email_uniqueness.sql`, migration `00012` |
| Hardening needed exact positive and negative authorization proof. | Added exact 66-row service table matrix, seven-function allowlist, owners, RLS, zero policies, no browser/PUBLIC execution, no unwanted default ACL, explicit service `USAGE`/no-`CREATE`, SECURITY DEFINER and empty-search-path assertions. | `04_harden_server_only_access.sql`, migration `00013` |
| Final verification was incomplete and signature comparison was format-sensitive. | Added exact history/table/trigger/function/grant checks, strict PG17 major gate, data/legacy markers, Storage/FK/index checks, and OID-based function allowlist comparison. | `05_verify_pg17.sql` |
| Reconciliation relied on standalone SQL. | Promoted changes to ordered replayable migrations `00011`–`00013`; standalone files are byte-identical review mirrors and are never production execution sources. | migrations `00011`–`00013`, `COMPATIBILITY_MATRIX.md` |
| Rehearsal double-ran reconciliation, omitted gates/history/variables, could hang, and produced no evidence. | Rebuilt it around a digest-pinned official PG17 image, disabled network, 60-second readiness, exact migration set/order, mirror comparison, preflight, containment, local-only history recording, final verification, evidence dumps/checksums, and unconditional cleanup. | `rehearse_pg17.sh`, `evidence/20260723T182326Z/` |
| Runbook lacked accountable roles, exact target-bound commands, evidence, runner plan, canary, recovery proof, and failure recovery. | Added four-person control record, checksum/CLI gates, freeze, explicit `--db-url`, mandatory reviewed dry-run, exact ordered commands, 14-version evidence, containment canary, isolated restore-test GO requirement, stop/go/no-go criteria, evidence capture, forward correction, and isolated recovery. | `RUNBOOK.md` |

## New stop conditions
Execution now stops on any role/version/history/fingerprint/schema/default/constraint/index/trigger/function/policy/owner/grant/default-ACL/Storage/row-count mismatch; partial reconciliation; dependency loss; email null/duplicate/index collision; lock/statement timeout; browser/PUBLIC access; service matrix drift; data hash change; or missing legacy preservation marker.

## Security validations
The package proves no operational `anon`/`authenticated` public-schema access, no PUBLIC function execution, no unwanted default privileges, exact service-role table/RPC grants, `service_role` BYPASSRLS, PostgreSQL ownership, RLS on every public table, zero public policies, SECURITY DEFINER flags, and empty search paths for privileged RPCs.

## Data-safety validations
All three reconciliation migrations are transactional. Synthetic rehearsal preserved two lead rows and one outreach row. Counts/content hashes protect legacy data; exact checks preserve `notes`, `outreach_log`, its cascade FK/index, lead trigger, and comments. No table recreation, destructive reset, production write, or production history edit occurred.

## Remaining risks
- Production execution is still unapproved and unrehearsed against the live connection; the exact preflight must pass unchanged.
- Containment commits before migrations, so a later failure intentionally leaves restricted server-only access and a maintenance outage until a reviewed forward correction.
- The regular unique-index build takes a write-blocking lock; the 5-second lock and 120-second statement limits enforce the stop condition.
- Repository `database/supabase/config.toml` still declares PostgreSQL 15 while production is 17; this separate parity issue was not changed under this gate.
- Application readiness and authenticated Owner/Employee/Client security smoke tests remain mandatory after separately approved execution.

## Validation result
Isolated PostgreSQL 17.6 rehearsal: **PASS**. Mirror equality, exact 14-version order, preflight, containment, migrations, final verification, schema dump, row counts, grants, local synthetic history, and evidence checksums completed successfully at `evidence/20260723T182326Z/`.

