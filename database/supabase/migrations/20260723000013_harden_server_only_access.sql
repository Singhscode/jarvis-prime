-- Versioned migration source: 20260723000013_harden_server_only_access.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE TEMP TABLE _jarvis_expected_table_grants(table_name text,privilege_type text,PRIMARY KEY(table_name,privilege_type)) ON COMMIT DROP;
INSERT INTO _jarvis_expected_table_grants VALUES
 ('clients','SELECT'),
 ('prospects','SELECT'),('prospects','INSERT'),('prospects','UPDATE'),
 ('messages','SELECT'),('messages','INSERT'),('events','SELECT'),('events','INSERT'),
 ('campaigns','SELECT'),('campaigns','INSERT'),('linkedin_actions','SELECT'),('linkedin_actions','INSERT'),
 ('webhook_events','SELECT'),('webhook_events','INSERT'),
 ('suppression','SELECT'),('suppression','INSERT'),('suppression','UPDATE'),
 ('leads','SELECT'),('leads','INSERT'),('leads','UPDATE'),
 ('users','SELECT'),('users','INSERT'),('users','UPDATE'),
 ('sessions','SELECT'),('sessions','INSERT'),('sessions','UPDATE'),
 ('refresh_tokens','SELECT'),('refresh_tokens','INSERT'),('refresh_tokens','UPDATE'),
 ('email_verification_tokens','SELECT'),('email_verification_tokens','INSERT'),('email_verification_tokens','UPDATE'),
 ('password_resets','SELECT'),('password_resets','INSERT'),('password_resets','UPDATE'),
 ('password_history','SELECT'),('password_history','INSERT'),('audit_logs','SELECT'),('audit_logs','INSERT'),
 ('companies','SELECT'),('companies','INSERT'),('companies','UPDATE'),('companies','DELETE'),
 ('contacts','SELECT'),('contacts','INSERT'),('contacts','UPDATE'),('contacts','DELETE'),
 ('crm_projects','SELECT'),('crm_projects','INSERT'),('crm_projects','UPDATE'),('crm_projects','DELETE'),
 ('crm_tasks','SELECT'),('crm_tasks','INSERT'),('crm_tasks','UPDATE'),('crm_tasks','DELETE'),
 ('crm_leads','SELECT'),('crm_leads','INSERT'),('crm_leads','UPDATE'),('crm_leads','DELETE'),
 ('crm_clients','SELECT'),('crm_clients','INSERT'),('crm_clients','UPDATE'),('crm_clients','DELETE'),
 ('client_portal_memberships','SELECT'),
 ('client_portal_documents','SELECT'),('client_portal_documents','UPDATE');
CREATE TEMP TABLE _jarvis_expected_functions(signature text PRIMARY KEY,security_definer boolean) ON COMMIT DROP;
INSERT INTO _jarvis_expected_functions VALUES
 ('public.handle_updated_at()',false),
 ('public.convert_crm_lead_to_client(uuid,uuid,uuid,text)',false),
 ('public.complete_employee_portal_task(uuid,uuid,boolean,text)',true),
 ('public.reissue_client_portal_invitation(uuid,uuid,uuid,text,timestamp with time zone)',true),
 ('public.activate_client_portal_invitation(uuid,text)',true),
 ('public.revoke_client_portal_membership(uuid,uuid,uuid)',true),
 ('public.publish_client_portal_document(uuid,uuid,uuid,text,text,text,text)',true);
DO $$
BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'STOP: expected current_user postgres'; END IF;
  IF to_regrole('service_role') IS NULL OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') THEN RAISE EXCEPTION 'STOP: service_role missing or not BYPASSRLS'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') AND c.relowner<>'postgres'::regrole) THEN RAISE EXCEPTION 'STOP: unexpected public object owner'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proowner<>'postgres'::regrole) THEN RAISE EXCEPTION 'STOP: unexpected public function owner'; END IF;
END
$$;
DO $$
DECLARE entry text;
BEGIN
  FOREACH entry IN ARRAY ARRAY[
    'clients|service_all_clients','prospects|service_all_prospects','messages|service_all_messages','events|service_all_events',
    'suppression|service_all_suppression','campaigns|service_all_campaigns','campaign_steps|service_all_campaign_steps',
    'linkedin_actions|service_all_linkedin_actions','scheduled_jobs|service_all_scheduled_jobs','ab_tests|service_all_ab_tests',
    'webhook_events|service_all_webhook_events','notifications|service_all_notifications','leads|service_all_leads',
    'leads|anon_insert_only','leads|service_role_all','outreach_log|service_role_all_outreach'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',split_part(entry,'|',2),split_part(entry,'|',1));
  END LOOP;
END
$$;
REVOKE CREATE, USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT ON public.clients TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.prospects TO service_role;
GRANT SELECT,INSERT ON public.messages,public.events,public.campaigns,public.linkedin_actions,public.webhook_events TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.suppression,public.leads TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.users,public.sessions,public.refresh_tokens,public.email_verification_tokens,public.password_resets TO service_role;
GRANT SELECT,INSERT ON public.password_history,public.audit_logs TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.companies,public.contacts,public.crm_projects,public.crm_tasks,public.crm_leads,public.crm_clients TO service_role;
GRANT SELECT ON public.client_portal_memberships TO service_role;
GRANT SELECT,UPDATE ON public.client_portal_documents TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_crm_lead_to_client(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_employee_portal_task(uuid,uuid,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reissue_client_portal_invitation(uuid,uuid,uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_client_portal_invitation(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_client_portal_membership(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_client_portal_document(uuid,uuid,uuid,text,text,text,text) TO service_role;
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (
    (SELECT table_name::text,privilege_type::text FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='service_role')
    EXCEPT (SELECT table_name,privilege_type FROM _jarvis_expected_table_grants)
  ) OR EXISTS (
    (SELECT table_name,privilege_type FROM _jarvis_expected_table_grants)
    EXCEPT (SELECT table_name::text,privilege_type::text FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee='service_role')
  ) THEN RAISE EXCEPTION 'STOP: service_role table grant matrix mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated')) THEN RAISE EXCEPTION 'STOP: browser table grants remain'; END IF;
  IF has_schema_privilege('anon','public','USAGE') OR has_schema_privilege('anon','public','CREATE')
     OR has_schema_privilege('authenticated','public','USAGE') OR has_schema_privilege('authenticated','public','CREATE')
     OR NOT has_schema_privilege('service_role','public','USAGE')
     OR has_schema_privilege('service_role','public','CREATE') THEN RAISE EXCEPTION 'STOP: browser/service schema privilege mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace AND a.grantee IN (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) THEN RAISE EXCEPTION 'STOP: unwanted default ACL remains'; END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public') THEN RAISE EXCEPTION 'STOP: permissive public policy remains'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'STOP: public table without RLS'; END IF;
  FOR r IN SELECT signature,security_definer FROM _jarvis_expected_functions LOOP
    IF to_regprocedure(r.signature) IS NULL OR NOT has_function_privilege('service_role',r.signature,'EXECUTE') THEN RAISE EXCEPTION 'STOP: required service function grant missing: %',r.signature; END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure(r.signature))<>r.security_definer THEN RAISE EXCEPTION 'STOP: SECURITY DEFINER mismatch: %',r.signature; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT EXISTS (SELECT 1 FROM _jarvis_expected_functions e WHERE to_regprocedure(e.signature)=p.oid)) THEN RAISE EXCEPTION 'STOP: unexpected service function execution privilege'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'STOP: browser/PUBLIC function execution remains'; END IF;
  IF EXISTS (SELECT 1 FROM _jarvis_expected_functions e JOIN pg_proc p ON p.oid=to_regprocedure(e.signature) WHERE e.security_definer AND NOT coalesce(p.proconfig,ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN RAISE EXCEPTION 'STOP: SECURITY DEFINER search_path mismatch'; END IF;
END
$$;
COMMIT;
