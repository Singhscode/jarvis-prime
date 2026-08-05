-- Removes the temporary bridge index after 20260723000012 restores leads_email_key.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$
DECLARE email_attnum smallint;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STOP: expected current_user postgres'; END IF;
  SELECT attnum INTO email_attnum FROM pg_attribute
    WHERE attrelid = 'public.leads'::regclass AND attname = 'email' AND NOT attisdropped;
  IF email_attnum IS NULL OR NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260723000012')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.leads'::regclass AND conname = 'leads_email_key' AND contype = 'u' AND conkey = ARRAY[email_attnum])
    OR to_regclass('public.leads_email_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'STOP: final leads email constraint state is required before bridge cleanup';
  END IF;
  IF to_regclass('public.leads_email_bridge_unique_idx') IS NOT NULL THEN
    EXECUTE 'DROP INDEX public.leads_email_bridge_unique_idx';
  END IF;
END
$$;
COMMIT;
