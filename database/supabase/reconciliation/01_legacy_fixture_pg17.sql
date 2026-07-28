\set ON_ERROR_STOP on
-- Synthetic, schema-only equivalent of the captured legacy production surface.
-- This fixture contains no production data, users, credentials, or connection details.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, company text NOT NULL,
  email text NOT NULL, phone text, revenue text, message text,
  source text NOT NULL DEFAULT 'website_form', status text NOT NULL DEFAULT 'new', notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.outreach_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  channel text NOT NULL, step integer NOT NULL DEFAULT 1, subject text, body text,
  sent_at timestamptz NOT NULL DEFAULT now(), replied boolean DEFAULT false, reply_type text
);
CREATE INDEX leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX leads_email_idx ON public.leads (email);
CREATE INDEX leads_status_idx ON public.leads (status);
CREATE INDEX outreach_lead_idx ON public.outreach_log (lead_id);
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_insert_only ON public.leads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY service_role_all ON public.leads USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_outreach ON public.outreach_log USING (true) WITH CHECK (true);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.handle_updated_at() TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.leads, public.outreach_log TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
INSERT INTO public.leads (id, name, company, email, source, notes) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Rehearsal Legacy Lead', 'Legacy Company', 'legacy-lead@example.test', 'website_form', 'retain-for-compatibility'),
  ('10000000-0000-4000-8000-000000000002', 'Rehearsal Second Lead', 'Second Company', 'second-lead@example.test', 'manual', NULL);
INSERT INTO public.outreach_log (id, lead_id, channel, subject, body) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'email', 'Synthetic subject', 'Synthetic body');
