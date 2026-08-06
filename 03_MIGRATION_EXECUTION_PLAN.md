# Phase 3 — Migration Execution Plan Review

**Status: REVIEWED, NOT AUTHORIZED FOR PRODUCTION EXECUTION.**

## Logical order
1. `20260722000011` bridge original-main leads state to pre-230 shape.
2. `20260723000011` validate reconciled legacy shape.
3. `20260723000012` restore canonical `leads_email_key`.
4. `20260723000013` enforce server-only ACL/RLS/function grants.
5. `20260730000011` add Direct Client fields, backfill, generated code, constraints/index.
6. `20260730000012` grant service-role sequence usage.
7. `20260730000013` remove temporary bridge unique index after final-state validation.

The bridge is transactional, idempotent, and fails closed for unknown shapes; it validates null/duplicate lead emails before uniqueness transition. Cleanup requires `...23000012` and canonical email state. The linked remote already records `...23000011`–`...30000012` but lacks lower `...22000011` and cleanup `...30000013`; ordinary remote push is prohibited until a clone-rehearsed, approved migration-record plan exists. After each authorized migration, verify catalog schema, indexes, constraints, functions, RLS, ACL, CRM client sequence/code, and migration history. No production execution occurred.
