-- Forward-only bridge from the original main leads migration to the pre-20260723000011 shape.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$
DECLARE
  email_attnum smallint;
  has_notes boolean; has_outreach boolean; has_legacy_index boolean; has_bridge_unique boolean;
  has_email_unique boolean; has_23012 boolean; is_original boolean; is_bridge boolean;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STOP: expected current_user postgres'; END IF;
  IF to_regclass('public.leads') IS NULL THEN RAISE EXCEPTION 'STOP: leads relation missing'; END IF;
  SELECT attnum INTO email_attnum FROM pg_attribute
    WHERE attrelid = 'public.leads'::regclass AND attname = 'email' AND NOT attisdropped;
  IF email_attnum IS NULL THEN RAISE EXCEPTION 'STOP: leads.email missing'; END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'notes' AND udt_name = 'text') INTO has_notes;
  SELECT to_regclass('public.outreach_log') IS NOT NULL INTO has_outreach;
  SELECT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.leads_email_idx')
    AND indisvalid AND indisready AND NOT indisunique) INTO has_legacy_index;
  SELECT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.leads_email_bridge_unique_idx')
    AND indisvalid AND indisready AND indisunique) INTO has_bridge_unique;
  SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.leads'::regclass
    AND contype = 'u' AND conkey = ARRAY[email_attnum]) INTO has_email_unique;
  SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260723000012') INTO has_23012;
  IF has_23012 THEN
    IF NOT has_notes OR NOT has_outreach OR has_legacy_index OR NOT has_email_unique
      OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.leads'::regclass AND conname = 'leads_email_key' AND contype = 'u' AND conkey = ARRAY[email_attnum]) THEN
      RAISE EXCEPTION 'STOP: post-20260723000012 leads shape mismatch';
    END IF;
    RETURN;
  END IF;
  is_original := NOT has_notes AND NOT has_outreach AND NOT has_legacy_index AND NOT has_bridge_unique AND has_email_unique
    AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.leads'::regclass AND conname = 'leads_email_key' AND contype = 'u');
  is_bridge := has_notes AND has_outreach AND has_legacy_index AND NOT has_email_unique;
  IF is_original THEN
    IF EXISTS (SELECT 1 FROM public.leads WHERE email IS NULL) OR EXISTS (SELECT 1 FROM public.leads GROUP BY email HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'STOP: null or duplicate leads.email values';
    END IF;
    ALTER TABLE public.leads ADD COLUMN notes text;
    CREATE TABLE public.outreach_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid,
      channel text NOT NULL, step integer NOT NULL DEFAULT 1, subject text, body text,
      sent_at timestamptz NOT NULL DEFAULT now(), replied boolean DEFAULT false, reply_type text,
      CONSTRAINT outreach_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE
    );
    CREATE INDEX outreach_lead_idx ON public.outreach_log (lead_id);
    ALTER TABLE public.outreach_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "service_role_all_outreach" ON public.outreach_log FOR ALL USING (true) WITH CHECK (true);
    CREATE INDEX leads_email_idx ON public.leads (email);
    ALTER TABLE public.leads DROP CONSTRAINT leads_email_key;
  ELSIF NOT is_bridge THEN
    RAISE EXCEPTION 'STOP: unsupported pre-20260723000011 leads shape';
  END IF;
  IF NOT has_bridge_unique THEN
    IF EXISTS (SELECT 1 FROM public.leads WHERE email IS NULL) OR EXISTS (SELECT 1 FROM public.leads GROUP BY email HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'STOP: null or duplicate leads.email values';
    END IF;
    CREATE UNIQUE INDEX leads_email_bridge_unique_idx ON public.leads (email);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'notes' AND udt_name = 'text')
    OR to_regclass('public.outreach_log') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.outreach_log')
      AND conname = 'outreach_log_lead_id_fkey' AND confrelid = 'public.leads'::regclass AND confdeltype = 'c')
    OR to_regclass('public.outreach_lead_idx') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.outreach_log'::regclass AND relrowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'outreach_log' AND policyname = 'service_role_all_outreach')
    OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.leads_email_idx') AND indisvalid AND indisready AND NOT indisunique)
    OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.leads_email_bridge_unique_idx') AND indisvalid AND indisready AND indisunique)
    OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.leads'::regclass AND contype = 'u' AND conkey = ARRAY[email_attnum]) THEN
    RAISE EXCEPTION 'STOP: pre-20260723000011 bridge validation failed';
  END IF;
END
$$;
COMMIT;
