\set ON_ERROR_STOP on
\if :{?expected_leads_rows}
\else
  \set expected_leads_rows 0
\endif
\if :{?expected_outreach_rows}
\else
  \set expected_outreach_rows 0
\endif
BEGIN READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SELECT set_config('jarvis.expected_leads_rows', :'expected_leads_rows', true);
SELECT set_config('jarvis.expected_outreach_rows', :'expected_outreach_rows', true);
DO $$
DECLARE
  required_relation text;
  expected_grants jsonb := '{
    "clients":["SELECT"],"prospects":["SELECT","INSERT","UPDATE"],
    "messages":["SELECT","INSERT"],"events":["SELECT","INSERT"],
    "campaigns":["SELECT","INSERT"],"linkedin_actions":["SELECT","INSERT"],
    "webhook_events":["SELECT","INSERT"],"suppression":["SELECT","INSERT","UPDATE"],
    "leads":["SELECT","INSERT","UPDATE"],"users":["SELECT","INSERT","UPDATE"],
    "sessions":["SELECT","INSERT","UPDATE"],"refresh_tokens":["SELECT","INSERT","UPDATE"],
    "email_verification_tokens":["SELECT","INSERT","UPDATE"],
    "password_resets":["SELECT","INSERT","UPDATE"],"password_history":["SELECT","INSERT"],
    "audit_logs":["SELECT","INSERT"],"companies":["SELECT","INSERT","UPDATE","DELETE"],
    "contacts":["SELECT","INSERT","UPDATE","DELETE"],
    "crm_projects":["SELECT","INSERT","UPDATE","DELETE"],
    "crm_tasks":["SELECT","INSERT","UPDATE","DELETE"],
    "crm_leads":["SELECT","INSERT","UPDATE","DELETE"],
    "crm_clients":["SELECT","INSERT","UPDATE","DELETE"],
    "client_portal_memberships":["SELECT"],"client_portal_documents":["SELECT","UPDATE"]}';
  expected_functions jsonb := '{
    "public.handle_updated_at()":false,
    "public.convert_crm_lead_to_client(uuid,uuid,uuid,text)":false,
    "public.complete_employee_portal_task(uuid,uuid,boolean,text)":true,
    "public.reissue_client_portal_invitation(uuid,uuid,uuid,text,timestamp with time zone)":true,
    "public.activate_client_portal_invitation(uuid,text)":true,
    "public.revoke_client_portal_membership(uuid,uuid,uuid)":true,
    "public.publish_client_portal_document(uuid,uuid,uuid,text,text,text,text)":true}';
  r record;
  expected_grant_count integer;
BEGIN
  IF current_user<>'postgres'
     OR current_setting('server_version_num')::integer<170000
     OR split_part(current_setting('server_version'),'.',1)<>'17' THEN
    RAISE EXCEPTION 'STOP: execution role or PostgreSQL 17 version mismatch';
  END IF;
  IF to_regrole('service_role') IS NULL OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') THEN RAISE EXCEPTION 'STOP: service_role missing or not BYPASSRLS'; END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RAISE EXCEPTION 'STOP: migration history relation missing'; END IF;
  IF EXISTS (
    (SELECT version::text FROM supabase_migrations.schema_migrations)
    EXCEPT (VALUES ('20260715000000'),('20260715000001'),('20260715000002'),('20260715000003'),('20260715000004'),('20260715000005'),('20260715000006'),('20260715000007'),('20260715000008'),('20260718000009'),('20260718000010'),('20260723000011'),('20260723000012'),('20260723000013'))
  ) OR EXISTS (
    (VALUES ('20260715000000'),('20260715000001'),('20260715000002'),('20260715000003'),('20260715000004'),('20260715000005'),('20260715000006'),('20260715000007'),('20260715000008'),('20260718000009'),('20260718000010'),('20260723000011'),('20260723000012'),('20260723000013'))
    EXCEPT (SELECT version::text FROM supabase_migrations.schema_migrations)
  ) THEN RAISE EXCEPTION 'STOP: migration history version set mismatch'; END IF;
  IF EXISTS (
    (SELECT tablename::text FROM pg_tables WHERE schemaname='public')
    EXCEPT (VALUES ('clients'),('prospects'),('messages'),('events'),('suppression'),('campaigns'),('campaign_steps'),('linkedin_actions'),('scheduled_jobs'),('ab_tests'),('webhook_events'),('notifications'),('users'),('sessions'),('refresh_tokens'),('email_verification_tokens'),('password_resets'),('audit_logs'),('password_history'),('leads'),('companies'),('contacts'),('crm_leads'),('crm_clients'),('crm_projects'),('crm_tasks'),('client_portal_memberships'),('client_portal_invitations'),('client_portal_documents'),('outreach_log'))
  ) OR EXISTS (
    (VALUES ('clients'),('prospects'),('messages'),('events'),('suppression'),('campaigns'),('campaign_steps'),('linkedin_actions'),('scheduled_jobs'),('ab_tests'),('webhook_events'),('notifications'),('users'),('sessions'),('refresh_tokens'),('email_verification_tokens'),('password_resets'),('audit_logs'),('password_history'),('leads'),('companies'),('contacts'),('crm_leads'),('crm_clients'),('crm_projects'),('crm_tasks'),('client_portal_memberships'),('client_portal_invitations'),('client_portal_documents'),('outreach_log'))
    EXCEPT (SELECT tablename::text FROM pg_tables WHERE schemaname='public')
  ) THEN RAISE EXCEPTION 'STOP: public table set mismatch'; END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public')<>30 THEN RAISE EXCEPTION 'STOP: expected exactly 30 public tables'; END IF;
  FOREACH required_relation IN ARRAY ARRAY['title','linkedin_url','icp_score','data_quality','last_contact_at','next_action','enriched_at','notes'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name=required_relation) THEN RAISE EXCEPTION 'STOP: required leads column missing: %',required_relation; END IF;
  END LOOP;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='leads')<>19
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='company' AND udt_name='text' AND is_nullable='YES')
     OR (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='source') IS DISTINCT FROM '''website''::text' THEN RAISE EXCEPTION 'STOP: reconciled leads shape mismatch'; END IF;
  IF (SELECT count(*) FROM public.leads)<>current_setting('jarvis.expected_leads_rows')::bigint OR (SELECT count(*) FROM public.outreach_log)<>current_setting('jarvis.expected_outreach_rows')::bigint THEN RAISE EXCEPTION 'STOP: legacy row count mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.leads'::regclass AND conname='leads_email_key' AND contype='u')
     OR to_regclass('public.leads_email_idx') IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid='public.leads_email_key'::regclass AND indisunique AND indisvalid AND indisready) THEN RAISE EXCEPTION 'STOP: leads email uniqueness mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.outreach_log'::regclass AND conname='outreach_log_lead_id_fkey' AND confrelid='public.leads'::regclass AND confdeltype='c')
     OR to_regclass('public.outreach_lead_idx') IS NULL THEN RAISE EXCEPTION 'STOP: outreach FK/index mismatch'; END IF;
  IF EXISTS (
    (SELECT t.tgname::text||'|'||p.proname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal)
    EXCEPT (VALUES ('clients_updated_at|handle_updated_at'),('prospects_updated_at|handle_updated_at'),('campaigns_updated_at|handle_updated_at'),('scheduled_jobs_updated_at|handle_updated_at'),('ab_tests_updated_at|handle_updated_at'),('leads_updated_at|handle_updated_at'),('companies_updated_at|handle_updated_at'),('contacts_updated_at|handle_updated_at'),('crm_clients_updated_at|handle_updated_at'))
  ) OR EXISTS (
    (VALUES ('clients_updated_at|handle_updated_at'),('prospects_updated_at|handle_updated_at'),('campaigns_updated_at|handle_updated_at'),('scheduled_jobs_updated_at|handle_updated_at'),('ab_tests_updated_at|handle_updated_at'),('leads_updated_at|handle_updated_at'),('companies_updated_at|handle_updated_at'),('contacts_updated_at|handle_updated_at'),('crm_clients_updated_at|handle_updated_at'))
    EXCEPT (SELECT t.tgname::text||'|'||p.proname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal)
  ) THEN RAISE EXCEPTION 'STOP: public trigger set mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (NOT c.relrowsecurity OR c.relowner<>'postgres'::regrole)) THEN RAISE EXCEPTION 'STOP: RLS or owner mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public') THEN RAISE EXCEPTION 'STOP: unexpected public policy'; END IF;
  IF has_schema_privilege('anon','public','USAGE') OR has_schema_privilege('anon','public','CREATE')
     OR has_schema_privilege('authenticated','public','USAGE') OR has_schema_privilege('authenticated','public','CREATE')
     OR NOT has_schema_privilege('service_role','public','USAGE')
     OR has_schema_privilege('service_role','public','CREATE') THEN RAISE EXCEPTION 'STOP: browser/service schema access mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated')) THEN RAISE EXCEPTION 'STOP: browser table grant remains'; END IF;
  IF EXISTS (SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace AND a.grantee IN (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) THEN RAISE EXCEPTION 'STOP: unwanted default ACL remains'; END IF;
  SELECT sum(jsonb_array_length(value)) INTO expected_grant_count FROM jsonb_each(expected_grants);
  IF (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='service_role')<>expected_grant_count
     OR EXISTS (SELECT 1 FROM information_schema.role_table_grants g WHERE g.table_schema='public' AND g.grantee='service_role' AND NOT (expected_grants ? g.table_name AND (expected_grants->g.table_name) ? g.privilege_type)) THEN RAISE EXCEPTION 'STOP: unexpected service table grant'; END IF;
  FOR r IN SELECT key AS table_name,jsonb_array_elements_text(value) AS privilege_type FROM jsonb_each(expected_grants) LOOP
    IF NOT has_table_privilege('service_role',format('public.%I',r.table_name),r.privilege_type) THEN RAISE EXCEPTION 'STOP: missing service grant %.%',r.table_name,r.privilege_type; END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')<>7 THEN RAISE EXCEPTION 'STOP: public function count mismatch'; END IF;
  FOR r IN SELECT key AS signature,(value::text)::boolean AS security_definer FROM jsonb_each(expected_functions) LOOP
    IF to_regprocedure(r.signature) IS NULL OR NOT has_function_privilege('service_role',r.signature,'EXECUTE') THEN RAISE EXCEPTION 'STOP: required service function missing: %',r.signature; END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure(r.signature))<>r.security_definer
       OR (SELECT proowner FROM pg_proc WHERE oid=to_regprocedure(r.signature))<>'postgres'::regrole THEN RAISE EXCEPTION 'STOP: function security/owner mismatch: %',r.signature; END IF;
    IF r.security_definer AND NOT (SELECT coalesce(proconfig,ARRAY[]::text[]) @> ARRAY['search_path=""'] FROM pg_proc WHERE oid=to_regprocedure(r.signature)) THEN RAISE EXCEPTION 'STOP: SECURITY DEFINER search_path mismatch: %',r.signature; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_object_keys(expected_functions) AS e(signature)
        WHERE to_regprocedure(e.signature)=p.oid
      )
  ) THEN RAISE EXCEPTION 'STOP: unexpected service function execution'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'STOP: browser/PUBLIC function execution remains'; END IF;
  IF (SELECT count(*) FROM storage.buckets)<>1 OR NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='client-portal-private' AND name='client-portal-private' AND public=false) THEN RAISE EXCEPTION 'STOP: storage bucket mismatch'; END IF;
  IF col_description('public.leads'::regclass,(SELECT attnum FROM pg_attribute WHERE attrelid='public.leads'::regclass AND attname='notes')) IS DISTINCT FROM 'Temporary legacy compatibility field; remove only through a separately approved migration.' THEN RAISE EXCEPTION 'STOP: notes preservation marker missing'; END IF;
  IF obj_description('public.outreach_log'::regclass,'pg_class') IS DISTINCT FROM 'Legacy compatibility table; remove only through a separately approved migration.' THEN RAISE EXCEPTION 'STOP: outreach_log preservation marker missing'; END IF;
END
$$;
SELECT count(*) AS public_tables FROM pg_tables WHERE schemaname='public';
COMMIT;
