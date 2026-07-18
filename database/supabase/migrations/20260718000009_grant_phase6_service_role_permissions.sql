-- Permit the server-side Supabase role to execute the Phase 6 auth and portal lifecycle.
-- Browser roles retain no direct table access.

grant usage on schema public to service_role;

grant select, insert, update on table public.users to service_role;
grant select, insert, update on table public.sessions to service_role;
grant select, insert, update on table public.refresh_tokens to service_role;
grant insert on table public.audit_logs to service_role;

grant select on table public.crm_clients to service_role;
grant select on table public.crm_projects to service_role;
grant select, update on table public.crm_tasks to service_role;
grant select on table public.crm_leads to service_role;