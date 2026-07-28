\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $$
BEGIN
  IF split_part(current_setting('server_version'),'.',1)<>'17' THEN RAISE EXCEPTION 'restore requires PostgreSQL 17'; END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','auth','storage'))<>33
     OR (SELECT count(*) FROM pg_tables WHERE schemaname='public')<>2
     OR (SELECT count(*) FROM pg_tables WHERE schemaname='auth')<>23
     OR (SELECT count(*) FROM pg_tables WHERE schemaname='storage')<>8 THEN
    RAISE EXCEPTION 'restored table inventory mismatch';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage','extensions'))<>28
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')<>1
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth')<>4
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='storage')<>17
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='extensions')<>6 THEN
    RAISE EXCEPTION 'restored function inventory mismatch';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND NOT t.tgisinternal)<>5
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.leads'::regclass AND tgname='leads_updated_at' AND tgfoid='public.handle_updated_at()'::regprocedure AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'restored trigger inventory mismatch';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind='r' AND c.relrowsecurity)<>26
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.leads'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.outreach_log'::regclass AND relrowsecurity)
     OR (SELECT count(*) FROM pg_policies WHERE schemaname='public')<>3 THEN
    RAISE EXCEPTION 'restored RLS or policy inventory mismatch';
  END IF;
  IF (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid=i.indexrelid))<>69 THEN
    RAISE EXCEPTION 'restored explicit-index inventory mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.outreach_log'::regclass AND conname='outreach_log_lead_id_fkey' AND confrelid='public.leads'::regclass AND confdeltype='c') THEN
    RAISE EXCEPTION 'restored outreach foreign key mismatch';
  END IF;
  IF (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role'))<>42
     OR NOT has_function_privilege('anon','public.handle_updated_at()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.handle_updated_at()','EXECUTE')
     OR NOT has_function_privilege('service_role','public.handle_updated_at()','EXECUTE') THEN
    RAISE EXCEPTION 'restored public grant inventory mismatch';
  END IF;
  IF (SELECT count(*) FROM public.leads)<>0 OR (SELECT count(*) FROM public.outreach_log)<>0
     OR (SELECT count(*) FROM auth.users)<>0 OR (SELECT count(*) FROM storage.buckets)<>0
     OR (SELECT count(*) FROM storage.objects)<>0 THEN RAISE EXCEPTION 'restored row counts mismatch'; END IF;
END
$$;
SELECT current_setting('server_version') AS postgres_version,
       (SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','auth','storage')) AS tables,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage','extensions')) AS functions,
       (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND NOT t.tgisinternal) AS triggers,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind='r' AND c.relrowsecurity) AS rls_tables,
       (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS public_policies,
       (SELECT count(*) FROM public.leads) AS leads_rows,
       (SELECT count(*) FROM public.outreach_log) AS outreach_rows,
       (SELECT count(*) FROM auth.users) AS auth_users,
       (SELECT count(*) FROM storage.objects) AS storage_objects;
COMMIT;
