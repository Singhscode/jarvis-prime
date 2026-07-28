-- Versioned migration source: 20260723000012_enforce_leads_email_uniqueness.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE TEMP TABLE _jarvis_unique_baseline ON COMMIT DROP AS
SELECT count(*) AS row_count,
       md5(coalesce(string_agg(jsonb_build_array(id,email)::text,'' ORDER BY id),'')) AS row_hash
FROM public.leads;
DO $$
DECLARE email_attnum smallint;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STOP: expected current_user postgres'; END IF;
  SELECT attnum INTO email_attnum FROM pg_attribute
  WHERE attrelid='public.leads'::regclass AND attname='email' AND NOT attisdropped;
  IF email_attnum IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='email' AND udt_name='text' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'STOP: leads.email shape mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM public.leads WHERE email IS NULL)
     OR EXISTS (SELECT 1 FROM public.leads GROUP BY email HAVING count(*)>1) THEN
    RAISE EXCEPTION 'STOP: null or duplicate leads.email values';
  END IF;
  IF to_regclass('public.leads_email_unique_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: candidate unique index name already exists';
  END IF;
  IF to_regclass('public.leads_email_idx') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid='public.leads_email_idx'::regclass AND indisvalid AND indisready AND NOT indisunique) THEN
    RAISE EXCEPTION 'STOP: legacy email index missing, invalid, or unexpectedly unique';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.leads'::regclass AND contype='u' AND conkey=ARRAY[email_attnum]) THEN
    RAISE EXCEPTION 'STOP: leads.email unique constraint already exists';
  END IF;
END
$$;
CREATE UNIQUE INDEX leads_email_unique_idx ON public.leads(email);
ALTER TABLE public.leads ADD CONSTRAINT leads_email_key UNIQUE USING INDEX leads_email_unique_idx;
DROP INDEX public.leads_email_idx;
DO $$
DECLARE current_hash text;
BEGIN
  SELECT md5(coalesce(string_agg(jsonb_build_array(id,email)::text,'' ORDER BY id),'')) INTO current_hash FROM public.leads;
  IF (SELECT row_count FROM _jarvis_unique_baseline)<>(SELECT count(*) FROM public.leads)
     OR (SELECT row_hash FROM _jarvis_unique_baseline)<>current_hash THEN RAISE EXCEPTION 'STOP: lead rows changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.leads'::regclass AND conname='leads_email_key' AND contype='u')
     OR to_regclass('public.leads_email_idx') IS NOT NULL THEN RAISE EXCEPTION 'STOP: email index replacement failed'; END IF;
END
$$;
COMMIT;
