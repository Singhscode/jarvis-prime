# Production Change Record

## Change identification
- Change ID: `JP-DB-2026-07-24-01`
- Change title: JARVIS PRIME PostgreSQL 17 production schema reconciliation
- Status: Operationally documented; awaiting technical execution gates and explicit production approval
- Risk level: High — controlled production database and authorization change

## Change description
Apply the approved 14-migration PostgreSQL 17 baseline and reconciliation package to the JARVIS PRIME production database. The controlled sequence includes read-only preflight, operational browser-access containment, migrations `20260715000000` through `20260723000013`, final database/security verification, API readiness checks, authenticated Owner/Employee/Client verification, and evidence capture.

## Scope
- Production Supabase project: `fytnwpnnvqecjmyhrzcx`
- Database schema reconciliation and migration-history establishment through the approved migration runner
- Preservation of legacy `leads.notes` and `outreach_log`
- Exact RLS, grant, default-ACL, function-owner, `SECURITY DEFINER`, search-path, and service-role verification
- Post-change API, authentication lifecycle, role-isolation, portal, and CORS verification
- Excludes application changes, provider configuration changes, credential rotation, deployment changes, and new features

## Backup and recovery
- Backup reference: `backups/production/fytnwpnnvqecjmyhrzcx/20260723T135351Z/jarvis-prime-production-manual-backup-20260723T135351Z.tar.gz`
- Backup checksum record: `backups/production/fytnwpnnvqecjmyhrzcx/20260723T135351Z/SHA256SUMS.txt`
- Recovery reference: `RUNBOOK.md` — Forward correction and recovery
- Backup recovery instructions: `backups/production/fytnwpnnvqecjmyhrzcx/20260723T135351Z/README.txt`
- Isolated restore evidence: Pending technical execution gate

## Operational ownership
- Operator: Anuj Singh (Founder & CEO)
- Reviewer: Anuj Singh (Founder & CEO)
- Approver: Anuj Singh (Founder & CEO)
- Recovery Owner: Anuj Singh (Founder & CEO)

> JARVIS PRIME is currently operated by a single founder. Until an engineering operations team is established, the responsibilities of Operator, Reviewer, Approver, and Recovery Owner are assigned to the founder. This is an intentional and documented temporary governance model and will be separated as the company grows.

The founder-led role assignment is approved and is not a release blocker. Each gate decision and approval must still be recorded independently with its own UTC timestamp.

## Maintenance Window
- UTC start: `[SCHEDULE REQUIRED — YYYY-MM-DD HH:MM UTC]`
- UTC end: `[SCHEDULE REQUIRED — YYYY-MM-DD HH:MM UTC]`
- Local timezone: Asia/Kolkata (IST, UTC+05:30)
- Expected migration duration: up to 10 minutes
- Expected verification duration: 20 minutes
- Expected maintenance duration: 45 minutes, including pre-execution checks and contingency

The schedule fields are the only intentional placeholders. They must be completed before the maintenance window becomes active.
## Production Freeze Plan
1. **Write freeze:** Activate before production preflight. Block application writes, outreach activity, scheduler activity, manual database writes, and concurrent schema operations. Keep `DRY_RUN=true` and the scheduler disabled.
2. **Deployment freeze:** Activate at the same time as the write freeze. No API, web, Railway, Vercel, Supabase configuration, authentication, credential, or infrastructure changes may overlap the window.
3. **Verification period:** Keep both freezes active through final SQL verification, `/health`, `/ready`, deep health, security checks, authentication lifecycle checks, Owner Workspace, Employee Workspace, Client Portal, role isolation, and CORS validation.
4. **Release completion:** Lift freezes only after every final check passes, evidence is archived, and the Approver records completion. On any failure, keep the freeze, preserve evidence, and follow the runbook's forward-correction or isolated-recovery procedure.

## Operational Checklist
- [x] Backup verified
- [x] Backup checksum verified
- [ ] Isolated restore completed
- [ ] Production preflight passed
- [ ] Migration dry-run passed
- [ ] Maintenance window active
- [ ] Write freeze active
- [ ] Deployment freeze active
- [ ] Operator approval
- [ ] Final production approval

Unchecked items are technical execution or activation gates. Check each item only after collecting timestamped evidence; do not infer completion from engineering review.

## Remaining execution gates
The only remaining blockers are technical production execution gates:
1. Complete and document the isolated backup restore.
2. Run and pass the approved read-only production preflight.
3. Run and approve the target-bound migration dry-run.
4. Activate the scheduled maintenance window and freezes.
5. Obtain explicit production execution approval.
6. Execute the approved production migration sequence.
7. Complete final database, security, API, authentication, workspace, portal, role-isolation, and CORS verification.

The approved single-founder governance model is complete and is not a blocker. No production action is authorized by this record alone.
