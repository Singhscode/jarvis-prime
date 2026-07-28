-- Versioned migration source: 20260723000011_reconcile_legacy_leads.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$
DECLARE required_relation text;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'STOP: expected current_user postgres'; END IF;
  FOREACH required_relation IN ARRAY ARRAY[
    'clients','prospects','messages','events','suppression','campaigns','campaign_steps','linkedin_actions',
    'scheduled_jobs','ab_tests','webhook_events','notifications','users','sessions','refresh_tokens',
    'email_verification_tokens','password_resets','audit_logs','password_history','companies','contacts',
    'crm_leads','crm_clients','crm_projects','crm_tasks','client_portal_memberships',
    'client_portal_invitations','client_portal_documents','leads','outreach_log'
  ] LOOP
    IF to_regclass(format('public.%I',required_relation)) IS NULL THEN
      RAISE EXCEPTION 'STOP: required relation public.% missing', required_relation;
    END IF;
  END LOOP;
  IF EXISTS (
    (SELECT column_name::text,udt_name::text,is_nullable::text
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='leads')
    EXCEPT (VALUES
      ('id','uuid','NO'),('name','text','NO'),('company','text','NO'),('email','text','NO'),
      ('phone','text','YES'),('revenue','text','YES'),('message','text','YES'),('source','text','NO'),
      ('status','text','NO'),('notes','text','YES'),('created_at','timestamptz','NO'),('updated_at','timestamptz','NO'))
  ) OR EXISTS (
    (VALUES
      ('id','uuid','NO'),('name','text','NO'),('company','text','NO'),('email','text','NO'),
      ('phone','text','YES'),('revenue','text','YES'),('message','text','YES'),('source','text','NO'),
      ('status','text','NO'),('notes','text','YES'),('created_at','timestamptz','NO'),('updated_at','timestamptz','NO'))
    EXCEPT
    (SELECT column_name::text,udt_name::text,is_nullable::text
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='leads')
  ) OR (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='source') IS DISTINCT FROM '''website_form''::text'
    OR (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='status') IS DISTINCT FROM '''new''::text' THEN
    RAISE EXCEPTION 'STOP: exact legacy leads shape/default drift detected';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name IN ('title','linkedin_url','icp_score','data_quality','last_contact_at','next_action','enriched_at')) THEN
    RAISE EXCEPTION 'STOP: reconciliation columns already exist or partially exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.leads'::regclass AND tgname='leads_updated_at' AND tgfoid='public.handle_updated_at()'::regprocedure AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.outreach_log'::regclass AND conname='outreach_log_lead_id_fkey' AND confrelid='public.leads'::regclass AND confdeltype='c') THEN
    RAISE EXCEPTION 'STOP: legacy trigger or outreach dependency drift detected';
  END IF;
END
$$;
CREATE TEMP TABLE _jarvis_legacy_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.leads) AS leads_count,
  (SELECT count(*) FROM public.outreach_log) AS outreach_count,
  (SELECT md5(coalesce(string_agg(jsonb_build_array(id,name,company,email,phone,revenue,message,source,status,notes,created_at,updated_at)::text,'' ORDER BY id),'')) FROM public.leads) AS leads_hash,
  (SELECT md5(coalesce(string_agg(to_jsonb(o)::text,'' ORDER BY id),'')) FROM public.outreach_log o) AS outreach_hash;
ALTER TABLE public.leads ADD COLUMN title text;
ALTER TABLE public.leads ADD COLUMN linkedin_url text;
ALTER TABLE public.leads ADD COLUMN icp_score integer;
ALTER TABLE public.leads ADD COLUMN data_quality text;
ALTER TABLE public.leads ADD COLUMN last_contact_at timestamptz;
ALTER TABLE public.leads ADD COLUMN next_action text;
ALTER TABLE public.leads ADD COLUMN enriched_at timestamptz;
ALTER TABLE public.leads ALTER COLUMN company DROP NOT NULL;
ALTER TABLE public.leads ALTER COLUMN source SET DEFAULT 'website';
COMMENT ON COLUMN public.leads.notes IS 'Temporary legacy compatibility field; remove only through a separately approved migration.';
COMMENT ON TABLE public.outreach_log IS 'Legacy compatibility table; remove only through a separately approved migration.';
DO $$
DECLARE current_leads_hash text; current_outreach_hash text;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='leads') <> 19
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='company' AND is_nullable<>'YES')
     OR (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='source') IS DISTINCT FROM '''website''::text' THEN
    RAISE EXCEPTION 'STOP: post-reconciliation leads shape mismatch';
  END IF;
  SELECT md5(coalesce(string_agg(jsonb_build_array(id,name,company,email,phone,revenue,message,source,status,notes,created_at,updated_at)::text,'' ORDER BY id),'')) INTO current_leads_hash FROM public.leads;
  SELECT md5(coalesce(string_agg(to_jsonb(o)::text,'' ORDER BY id),'')) INTO current_outreach_hash FROM public.outreach_log o;
  IF (SELECT leads_count FROM _jarvis_legacy_baseline) <> (SELECT count(*) FROM public.leads)
     OR (SELECT outreach_count FROM _jarvis_legacy_baseline) <> (SELECT count(*) FROM public.outreach_log)
     OR (SELECT leads_hash FROM _jarvis_legacy_baseline) <> current_leads_hash
     OR (SELECT outreach_hash FROM _jarvis_legacy_baseline) <> current_outreach_hash THEN
    RAISE EXCEPTION 'STOP: legacy row count or content changed';
  END IF;
  IF to_regclass('public.outreach_log') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='notes') THEN
    RAISE EXCEPTION 'STOP: legacy compatibility object lost';
  END IF;
END
$$;
COMMIT;
