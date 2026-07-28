\set ON_ERROR_STOP on
-- Operational pre-migration containment. Not a versioned schema migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STOP: expected current_user postgres'; END IF;
  IF to_regrole('service_role') IS NULL
     OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'STOP: service_role missing or not BYPASSRLS';
  END IF;
  IF to_regclass('public.leads') IS NULL OR to_regclass('public.outreach_log') IS NULL THEN
    RAISE EXCEPTION 'STOP: legacy tables missing';
  END IF;
END
$$;
DROP POLICY IF EXISTS anon_insert_only ON public.leads;
DROP POLICY IF EXISTS service_role_all ON public.leads;
DROP POLICY IF EXISTS service_role_all_outreach ON public.outreach_log;
REVOKE CREATE, USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.leads TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO service_role;
DO $$
BEGIN
  IF has_schema_privilege('anon','public','USAGE') OR has_schema_privilege('anon','public','CREATE')
     OR has_schema_privilege('authenticated','public','USAGE') OR has_schema_privilege('authenticated','public','CREATE') THEN
    RAISE EXCEPTION 'STOP: browser schema privileges remain';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated')) THEN
    RAISE EXCEPTION 'STOP: browser table grants remain';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND (has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'STOP: browser function execution remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole='postgres'::regrole
      AND d.defaclnamespace='public'::regnamespace
      AND a.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
  ) THEN
    RAISE EXCEPTION 'STOP: browser/PUBLIC default privileges remain';
  END IF;
  IF NOT has_schema_privilege('service_role','public','USAGE')
     OR has_schema_privilege('service_role','public','CREATE')
     OR EXISTS (
       (SELECT table_name::text,privilege_type::text
          FROM information_schema.role_table_grants
         WHERE table_schema='public' AND grantee='service_role')
       EXCEPT (VALUES ('leads','SELECT'),('leads','INSERT'),('leads','UPDATE'))
     ) OR EXISTS (
       (VALUES ('leads','SELECT'),('leads','INSERT'),('leads','UPDATE'))
       EXCEPT
       (SELECT table_name::text,privilege_type::text
          FROM information_schema.role_table_grants
         WHERE table_schema='public' AND grantee='service_role')
     )
     OR NOT has_function_privilege('service_role','public.handle_updated_at()','EXECUTE') THEN
    RAISE EXCEPTION 'STOP: server lead canary or containment grant mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole='postgres'::regrole
      AND d.defaclnamespace='public'::regnamespace
      AND a.grantee='service_role'::regrole
  ) THEN
    RAISE EXCEPTION 'STOP: service_role default privileges remain after containment';
  END IF;
END
$$;
COMMIT;
