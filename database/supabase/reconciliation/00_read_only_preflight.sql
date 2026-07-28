\set ON_ERROR_STOP on
\if :{?expected_leads_rows}
\else
  \set expected_leads_rows 0
\endif
\if :{?expected_outreach_rows}
\else
  \set expected_outreach_rows 0
\endif
\if :{?expected_schema_fingerprint}
\else
  \set expected_schema_fingerprint 5917ae71c2ce1f9a80bbf3d5983afbb0
\endif
BEGIN READ ONLY;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT set_config('jarvis.expected_leads_rows', :'expected_leads_rows', true);
SELECT set_config('jarvis.expected_outreach_rows', :'expected_outreach_rows', true);
SELECT set_config('jarvis.expected_schema_fingerprint', :'expected_schema_fingerprint', true);
DO $$
DECLARE
  actual_fingerprint text;
  history_relation regclass;
  history_state text;
  migration_rows bigint;
  leads_rows bigint;
  outreach_rows bigint;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP: expected current_user postgres, found %', current_user;
  END IF;
  IF current_setting('server_version_num')::integer < 170000
     OR split_part(current_setting('server_version'), '.', 1) <> '17' THEN
    RAISE EXCEPTION 'STOP: expected PostgreSQL 17, found %', version();
  END IF;
  IF to_regrole('service_role') IS NULL
     OR NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'STOP: service_role is missing or lacks BYPASSRLS';
  END IF;
  history_relation := to_regclass('supabase_migrations.schema_migrations');
  IF history_relation IS NULL THEN
    -- First managed execution of the reviewed unmanaged legacy baseline.
    history_state := 'legacy_unmanaged_adoption';
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid=history_relation AND relkind='r'
    ) THEN
      RAISE EXCEPTION 'STOP: migration history relation is not a table';
    END IF;
    IF EXISTS (
      (SELECT column_name::text,data_type::text,udt_name::text,is_nullable::text
         FROM information_schema.columns
        WHERE table_schema='supabase_migrations' AND table_name='schema_migrations')
      EXCEPT
      (VALUES
        ('version','text','text','NO'),
        ('name','text','text','YES'),
        ('statements','ARRAY','_text','YES'))
    ) OR EXISTS (
      (VALUES
        ('version','text','text','NO'),
        ('name','text','text','YES'),
        ('statements','ARRAY','_text','YES'))
      EXCEPT
      (SELECT column_name::text,data_type::text,udt_name::text,is_nullable::text
         FROM information_schema.columns
        WHERE table_schema='supabase_migrations' AND table_name='schema_migrations')
    ) THEN
      RAISE EXCEPTION 'STOP: migration history relation shape is inconsistent';
    END IF;
    EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations' INTO migration_rows;
    IF migration_rows <> 0 THEN
      RAISE EXCEPTION 'STOP: migration history contains % version row(s); first-run adoption requires no recorded versions', migration_rows;
    END IF;
    history_state := 'managed_empty_adoption';
  END IF;
  PERFORM set_config('jarvis.migration_history_state', history_state, true);
  IF EXISTS (
    (SELECT tablename FROM pg_tables WHERE schemaname='public')
    EXCEPT (VALUES ('leads'::name), ('outreach_log'::name))
  ) OR EXISTS (
    (VALUES ('leads'::name), ('outreach_log'::name))
    EXCEPT (SELECT tablename FROM pg_tables WHERE schemaname='public')
  ) THEN RAISE EXCEPTION 'STOP: public table set differs from the reviewed baseline'; END IF;
  IF EXISTS (
    (SELECT table_name::text,column_name::text,udt_name::text,is_nullable::text
     FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('leads','outreach_log'))
    EXCEPT (VALUES
      ('leads','id','uuid','NO'),('leads','name','text','NO'),('leads','company','text','NO'),
      ('leads','email','text','NO'),('leads','phone','text','YES'),('leads','revenue','text','YES'),
      ('leads','message','text','YES'),('leads','source','text','NO'),('leads','status','text','NO'),
      ('leads','notes','text','YES'),('leads','created_at','timestamptz','NO'),('leads','updated_at','timestamptz','NO'),
      ('outreach_log','id','uuid','NO'),('outreach_log','lead_id','uuid','YES'),('outreach_log','channel','text','NO'),
      ('outreach_log','step','int4','NO'),('outreach_log','subject','text','YES'),('outreach_log','body','text','YES'),
      ('outreach_log','sent_at','timestamptz','NO'),('outreach_log','replied','bool','YES'),('outreach_log','reply_type','text','YES'))
  ) OR EXISTS (
    (VALUES
      ('leads','id','uuid','NO'),('leads','name','text','NO'),('leads','company','text','NO'),
      ('leads','email','text','NO'),('leads','phone','text','YES'),('leads','revenue','text','YES'),
      ('leads','message','text','YES'),('leads','source','text','NO'),('leads','status','text','NO'),
      ('leads','notes','text','YES'),('leads','created_at','timestamptz','NO'),('leads','updated_at','timestamptz','NO'),
      ('outreach_log','id','uuid','NO'),('outreach_log','lead_id','uuid','YES'),('outreach_log','channel','text','NO'),
      ('outreach_log','step','int4','NO'),('outreach_log','subject','text','YES'),('outreach_log','body','text','YES'),
      ('outreach_log','sent_at','timestamptz','NO'),('outreach_log','replied','bool','YES'),('outreach_log','reply_type','text','YES'))
    EXCEPT (SELECT table_name::text,column_name::text,udt_name::text,is_nullable::text
            FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('leads','outreach_log'))
  ) THEN RAISE EXCEPTION 'STOP: legacy column/type/nullability drift detected'; END IF;
  IF (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='source') IS DISTINCT FROM '''website_form''::text'
     OR (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='status') IS DISTINCT FROM '''new''::text'
     OR (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='outreach_log' AND column_name='step') IS DISTINCT FROM '1'
     OR (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='outreach_log' AND column_name='replied') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'STOP: legacy default drift detected';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.leads'::regclass,'public.outreach_log'::regclass) AND conname IN ('leads_pkey','outreach_log_pkey','outreach_log_lead_id_fkey')) <> 3
     OR pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname='outreach_log_lead_id_fkey' AND conrelid='public.outreach_log'::regclass)) <> 'FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'STOP: legacy constraint drift detected';
  END IF;
  IF EXISTS (
    (SELECT indexname::text FROM pg_indexes WHERE schemaname='public')
    EXCEPT (VALUES ('leads_pkey'),('leads_created_at_idx'),('leads_email_idx'),('leads_status_idx'),('outreach_log_pkey'),('outreach_lead_idx'))
  ) OR EXISTS (
    (VALUES ('leads_pkey'),('leads_created_at_idx'),('leads_email_idx'),('leads_status_idx'),('outreach_log_pkey'),('outreach_lead_idx'))
    EXCEPT (SELECT indexname::text FROM pg_indexes WHERE schemaname='public')
  ) OR (SELECT indisunique FROM pg_index WHERE indexrelid='public.leads_email_idx'::regclass) THEN
    RAISE EXCEPTION 'STOP: legacy index drift detected';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid IN ('public.leads'::regclass,'public.outreach_log'::regclass) AND NOT tgisinternal) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.leads'::regclass AND tgname='leads_updated_at' AND tgfoid='public.handle_updated_at()'::regprocedure AND tgenabled='O') THEN
    RAISE EXCEPTION 'STOP: legacy trigger drift detected';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') <> 1
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p WHERE p.oid='public.handle_updated_at()'::regprocedure
       AND p.prorettype='trigger'::regtype AND NOT p.prosecdef AND p.proowner='postgres'::regrole
       AND regexp_replace(lower(p.prosrc),'[[:space:]]','','g') LIKE '%new.updated_at=now();%returnnew;%'
     ) THEN RAISE EXCEPTION 'STOP: legacy function drift detected'; END IF;
  IF EXISTS (
    (SELECT policyname::text FROM pg_policies WHERE schemaname='public')
    EXCEPT (VALUES ('anon_insert_only'),('service_role_all'),('service_role_all_outreach'))
  ) OR EXISTS (
    (VALUES ('anon_insert_only'),('service_role_all'),('service_role_all_outreach'))
    EXCEPT (SELECT policyname::text FROM pg_policies WHERE schemaname='public')
  ) THEN RAISE EXCEPTION 'STOP: legacy policy drift detected'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.leads'::regclass AND relrowsecurity AND relowner='postgres'::regrole)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.outreach_log'::regclass AND relrowsecurity AND relowner='postgres'::regrole) THEN
    RAISE EXCEPTION 'STOP: owner or RLS drift detected';
  END IF;
  FOREACH actual_fingerprint IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF NOT has_schema_privilege(actual_fingerprint,'public','USAGE')
       OR NOT has_table_privilege(actual_fingerprint,'public.leads','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR NOT has_table_privilege(actual_fingerprint,'public.outreach_log','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR NOT has_function_privilege(actual_fingerprint,'public.handle_updated_at()','EXECUTE') THEN
      RAISE EXCEPTION 'STOP: legacy explicit grant drift for %', actual_fingerprint;
    END IF;
  END LOOP;
  IF EXISTS (
    (SELECT r.rolname::text,d.defaclobjtype::text,a.privilege_type::text
       FROM pg_default_acl d
       CROSS JOIN LATERAL aclexplode(d.defaclacl) a
       JOIN pg_roles r ON r.oid=a.grantee
      WHERE d.defaclrole='postgres'::regrole
        AND d.defaclnamespace='public'::regnamespace
        AND r.rolname IN ('anon','authenticated','service_role'))
    EXCEPT
    (SELECT role_name,object_type,privilege_type FROM (VALUES
      ('anon','r','DELETE'),('anon','r','INSERT'),('anon','r','MAINTAIN'),('anon','r','REFERENCES'),('anon','r','SELECT'),('anon','r','TRIGGER'),('anon','r','TRUNCATE'),('anon','r','UPDATE'),
      ('authenticated','r','DELETE'),('authenticated','r','INSERT'),('authenticated','r','MAINTAIN'),('authenticated','r','REFERENCES'),('authenticated','r','SELECT'),('authenticated','r','TRIGGER'),('authenticated','r','TRUNCATE'),('authenticated','r','UPDATE'),
      ('service_role','r','DELETE'),('service_role','r','INSERT'),('service_role','r','MAINTAIN'),('service_role','r','REFERENCES'),('service_role','r','SELECT'),('service_role','r','TRIGGER'),('service_role','r','TRUNCATE'),('service_role','r','UPDATE'),
      ('anon','S','SELECT'),('anon','S','UPDATE'),('anon','S','USAGE'),
      ('authenticated','S','SELECT'),('authenticated','S','UPDATE'),('authenticated','S','USAGE'),
      ('service_role','S','SELECT'),('service_role','S','UPDATE'),('service_role','S','USAGE'),
      ('anon','f','EXECUTE'),('authenticated','f','EXECUTE'),('service_role','f','EXECUTE')
    ) expected(role_name,object_type,privilege_type))
  ) OR EXISTS (
    (SELECT role_name,object_type,privilege_type FROM (VALUES
      ('anon','r','DELETE'),('anon','r','INSERT'),('anon','r','MAINTAIN'),('anon','r','REFERENCES'),('anon','r','SELECT'),('anon','r','TRIGGER'),('anon','r','TRUNCATE'),('anon','r','UPDATE'),
      ('authenticated','r','DELETE'),('authenticated','r','INSERT'),('authenticated','r','MAINTAIN'),('authenticated','r','REFERENCES'),('authenticated','r','SELECT'),('authenticated','r','TRIGGER'),('authenticated','r','TRUNCATE'),('authenticated','r','UPDATE'),
      ('service_role','r','DELETE'),('service_role','r','INSERT'),('service_role','r','MAINTAIN'),('service_role','r','REFERENCES'),('service_role','r','SELECT'),('service_role','r','TRIGGER'),('service_role','r','TRUNCATE'),('service_role','r','UPDATE'),
      ('anon','S','SELECT'),('anon','S','UPDATE'),('anon','S','USAGE'),
      ('authenticated','S','SELECT'),('authenticated','S','UPDATE'),('authenticated','S','USAGE'),
      ('service_role','S','SELECT'),('service_role','S','UPDATE'),('service_role','S','USAGE'),
      ('anon','f','EXECUTE'),('authenticated','f','EXECUTE'),('service_role','f','EXECUTE')
    ) expected(role_name,object_type,privilege_type))
    EXCEPT
    (SELECT r.rolname::text,d.defaclobjtype::text,a.privilege_type::text
       FROM pg_default_acl d
       CROSS JOIN LATERAL aclexplode(d.defaclacl) a
       JOIN pg_roles r ON r.oid=a.grantee
      WHERE d.defaclrole='postgres'::regrole
        AND d.defaclnamespace='public'::regnamespace
        AND r.rolname IN ('anon','authenticated','service_role'))
  ) THEN
    RAISE EXCEPTION 'STOP: legacy default ACL drift detected';
  END IF;
  SELECT md5(string_agg(part,E'\n' ORDER BY part)) INTO actual_fingerprint FROM (
    SELECT format('column|%s|%s|%s|%s|%s',table_name,column_name,udt_name,is_nullable,coalesce(column_default,'')) part
      FROM information_schema.columns WHERE table_schema='public'
    UNION ALL SELECT format('constraint|%s|%s|%s',c.relname,con.conname,pg_get_constraintdef(con.oid))
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT format('index|%s|%s',indexname,indexdef) FROM pg_indexes WHERE schemaname='public'
    UNION ALL SELECT format('trigger|%s|%s',t.tgname,pg_get_triggerdef(t.oid)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
    UNION ALL SELECT format('function|%s|%s|%s|%s',p.proname,p.prosecdef,r.rolname,regexp_replace(lower(p.prosrc),'[[:space:]]','','g')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='public'
    UNION ALL SELECT format('policy|%s|%s|%s|%s|%s|%s',tablename,policyname,cmd,array_to_string(roles,','),coalesce(qual,''),coalesce(with_check,'')) FROM pg_policies WHERE schemaname='public'
    UNION ALL SELECT format('grant|%s|%s|%s',grantee,table_name,privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
    UNION ALL SELECT format('default|%s|%s|%s',d.defaclobjtype,coalesce(r.rolname,'PUBLIC'),a.privilege_type) FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE d.defaclrole='postgres'::regrole AND d.defaclnamespace='public'::regnamespace AND a.grantee IN ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole)
  ) fingerprint_parts;
  IF actual_fingerprint <> current_setting('jarvis.expected_schema_fingerprint') THEN
    RAISE EXCEPTION 'STOP: schema fingerprint mismatch; actual=%', actual_fingerprint;
  END IF;
  SELECT count(*) INTO leads_rows FROM public.leads;
  SELECT count(*) INTO outreach_rows FROM public.outreach_log;
  IF leads_rows <> current_setting('jarvis.expected_leads_rows')::bigint
     OR outreach_rows <> current_setting('jarvis.expected_outreach_rows')::bigint THEN
    RAISE EXCEPTION 'STOP: row-count drift leads=%, outreach=%', leads_rows, outreach_rows;
  END IF;
  IF EXISTS (SELECT 1 FROM public.leads WHERE email IS NULL)
     OR EXISTS (SELECT 1 FROM public.leads GROUP BY email HAVING count(*)>1) THEN
    RAISE EXCEPTION 'STOP: lead email null/duplicate precondition failed';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets) THEN RAISE EXCEPTION 'STOP: storage bucket baseline changed'; END IF;
END
$$;
SELECT current_user AS execution_role, version() AS postgres_version,
       current_setting('jarvis.migration_history_state') AS migration_history_state,
       current_setting('jarvis.expected_schema_fingerprint') AS verified_schema_fingerprint,
       (SELECT count(*) FROM public.leads) AS leads_rows,
       (SELECT count(*) FROM public.outreach_log) AS outreach_log_rows;
COMMIT;
