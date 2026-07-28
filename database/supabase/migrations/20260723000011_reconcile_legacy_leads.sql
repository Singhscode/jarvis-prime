-- Versioned migration source: validate the canonical reconciled legacy-lead shape.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STOP: expected current_user postgres'; END IF;
  IF to_regclass('public.leads') IS NULL OR to_regclass('public.outreach_log') IS NULL THEN
    RAISE EXCEPTION 'STOP: required legacy relations are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='notes' AND udt_name='text')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='title' AND udt_name='text')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='company' AND is_nullable='YES')
     OR (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='source') IS DISTINCT FROM '''website''::text' THEN
    RAISE EXCEPTION 'STOP: reconciled legacy leads shape mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.outreach_log'::regclass AND conname='outreach_log_lead_id_fkey' AND confrelid='public.leads'::regclass AND confdeltype='c')
     OR to_regclass('public.outreach_lead_idx') IS NULL THEN
    RAISE EXCEPTION 'STOP: legacy outreach dependency mismatch';
  END IF;
END
$$;
COMMENT ON COLUMN public.leads.notes IS 'Temporary legacy compatibility field; remove only through a separately approved migration.';
COMMENT ON TABLE public.outreach_log IS 'Legacy compatibility table; remove only through a separately approved migration.';
COMMIT;
