# Expected production schema diff

## Before
- Public tables: `leads`, `outreach_log` (both zero rows).
- `leads`: 12 columns; `company NOT NULL`; source default `website_form`; non-unique email index; `notes` retained.
- `outreach_log`: 9 columns; FK to `leads(id) ON DELETE CASCADE`.
- Public functions: `handle_updated_at()`.
- Public triggers: `leads_updated_at`.
- Public policies: `anon_insert_only`, unrestricted `service_role_all`, unrestricted `service_role_all_outreach`.
- Broad `anon`/`authenticated`/`service_role` table grants and broad default privileges.
- Supabase migration history: empty.
- Storage buckets: zero.

## After the reviewed 14-migration package
- Migration history contains exactly versions `20260715000000` through `20260715000008`, `20260718000009`–`00010`, and `20260723000011`–`00013`, recorded only by the approved runner.
- `00011` transactionally reconciles legacy leads while preserving row counts/content, `notes`, `outreach_log`, its FK/index, and the lead trigger.
- `00012` transactionally replaces the non-unique email index with constraint-backed uniqueness after null/duplicate/index validation.
- `00013` transactionally removes permissive policies/default ACLs and establishes the exact server-only table/function grant matrix.
- Public tables: 30 total: 29 canonical plus retained legacy `outreach_log`.
- `leads`: adds `title`, `linkedin_url`, `icp_score`, `data_quality`, `last_contact_at`, `next_action`, `enriched_at`; makes `company` nullable; source default becomes `website`; retains existing source values and `notes`; email becomes unique.
- Public functions: 7 (`handle_updated_at`, CRM conversion, employee completion, four client-portal RPCs).
- Public triggers: 9 canonical/retained update triggers.
- RLS enabled; zero permissive public-schema policies; browser roles have no schema/table/function access.
- `service_role` receives only operations required by current server repositories and approved RPC execution.
- Storage adds private bucket `client-portal-private`.
- No rows rewritten, seeded, or deleted.
- Migration history changes only through the approved migration runner; never manually.
