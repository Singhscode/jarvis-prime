# Production-to-canonical compatibility matrix

| Migration/object set | Production classification | Required treatment |
|---|---|---|
| 00000: clients, prospects, messages, events, suppression, campaigns, campaign_steps, linkedin_actions, scheduled_jobs, ab_tests, webhook_events, notifications | ADDITIVE | Create in canonical order. |
| 00000: indexes and updated_at triggers | ADDITIVE | Create; PostgreSQL 17 compatible. |
| 00000: `handle_updated_at()` | IDENTICAL | `CREATE OR REPLACE` preserves behavior. |
| 00000: twelve `service_all_*` policies | MANUAL RECONCILIATION REQUIRED | They are PUBLIC, not service-role-scoped; contain browser grants first, then drop policies in hardening. |
| 00001: public users, sessions, refresh_tokens, email_verification_tokens, password_resets, audit_logs, password_history | ADDITIVE | Distinct from provider-managed `auth.*`; create with RLS and no browser policies. |
| 00001: six FK indexes and RLS enablement | ADDITIVE | Create unchanged. |
| 00002: clients.config, prospects.metadata, prospects.tags, GIN index | ADDITIVE | Apply after 00000. |
| 00003: public.leads table | DIFFERENT | Existing table prevents canonical CREATE from adding fields or changing constraints/defaults. |
| 00003: leads title, linkedin_url, icp_score, data_quality, last_contact_at, next_action, enriched_at | ADDITIVE | Add forward-only. |
| 00003: leads company nullability/source default/email unique | MANUAL RECONCILIATION REQUIRED | Drop company NOT NULL; set default website; add unique constraint after duplicate preflight. |
| 00003: leads notes | DIFFERENT | Retain and document temporarily. |
| 00003: leads status/created indexes | IDENTICAL | Existing definitions match. |
| 00003: leads email index | DIFFERENT | Existing index is non-unique; replace with unique constraint-backed index. |
| 00003: leads update trigger | IDENTICAL | Canonical drop/recreate is behaviorally equivalent. |
| 00003: service_all_leads policy | MANUAL RECONCILIATION REQUIRED | Do not retain unrestricted PUBLIC policy. |
| 00004: companies, contacts, crm_leads, indexes, triggers, RLS | ADDITIVE | Create after public.users. |
| 00005: crm_clients; client_id columns/indexes; conversion RPC | ADDITIVE | Create after 00004; restrict function execution in hardening. |
| 00006: crm_projects and owner index | ADDITIVE | Create after crm_clients. |
| 00007: crm_tasks and project index | ADDITIVE | Create after crm_projects. |
| 00008: employee scope columns/index; completion RPC | ADDITIVE | Create after users/tasks/audit_logs; SECURITY DEFINER posture is compatible. |
| 00009: service-role grants | DIFFERENT | Canonical grants are incomplete for Phase 8 and must be superseded by exact repository-derived grants. |
| 00010: memberships, invitations, documents, indexes, four RPCs | ADDITIVE | Create after CRM/auth dependencies. |
| 00010: client-portal-private bucket | ADDITIVE | Current bucket count is zero; upsert creates private bucket. |
| 00011: legacy leads reconciliation | FORWARD RECONCILIATION | Transactionally add seven canonical columns, make company nullable, set source default to website, and prove legacy row/content preservation. |
| 00012: lead email uniqueness | FORWARD RECONCILIATION | Reject nulls, duplicates, invalid/colliding indexes, then transactionally replace the legacy index with `leads_email_key`. |
| 00013: server-only access hardening | SECURITY SUPERSESSION | Remove canonical/legacy permissive policies and broad ACLs; assert exact owners, RLS, default ACL absence, function posture, and repository-derived service grants. |
| Reconciliation files 02–04 | REVIEW MIRRORS | Byte-identical mirrors of 00011–00013; never execute directly in production. The versioned migrations are authoritative. |
| public.outreach_log | DIFFERENT / production-only | Retain as documented legacy table; no canonical object replaces it. |
| Existing leads/outreach grants, policies, default privileges | MANUAL RECONCILIATION REQUIRED | Remove broad browser access before canonical apply and finalize exact server-only privileges afterward. |
| Supabase provider auth/storage schemas | IDENTICAL / provider-managed | Do not alter through application migrations. |
| Supabase migration history | DIFFERENT | Empty remote history; only the approved migration runner may record successfully applied versions. |
