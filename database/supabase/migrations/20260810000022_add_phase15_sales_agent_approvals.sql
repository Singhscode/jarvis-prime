-- Phase 15A: approval-first, dry-run-only AI sales-agent workflow.
-- Forward-only. This migration does not backfill legacy outreach ownership and does not enable live delivery.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT;
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS source_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS consent_basis text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS outbound_action_id uuid;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS outbound_action_id uuid;
ALTER TABLE public.linkedin_actions ADD COLUMN IF NOT EXISTS outbound_action_id uuid;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS outbound_action_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prospects_consent_status_check') THEN
    ALTER TABLE public.prospects ADD CONSTRAINT prospects_consent_status_check
      CHECK (consent_status IN ('unknown', 'legitimate_interest', 'opted_in', 'opted_out'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS clients_owner_user_id_idx ON public.clients (owner_user_id);
CREATE INDEX IF NOT EXISTS prospects_source_reference_idx ON public.prospects (source, source_reference);

CREATE TABLE IF NOT EXISTS public.sales_agent_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE RESTRICT,
  artifact_type text NOT NULL CHECK (artifact_type IN ('research', 'enrichment', 'scoring', 'draft', 'draft_evaluation')),
  parent_artifact_id uuid REFERENCES public.sales_agent_artifacts(id) ON DELETE RESTRICT,
  source_kind text NOT NULL,
  source_reference text NOT NULL,
  source_collected_at timestamptz NOT NULL,
  content jsonb NOT NULL,
  model_provider text,
  model_name text,
  prompt_id text,
  prompt_version text,
  rules_version text NOT NULL,
  status text NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'failed')),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(content) = 'object'),
  CHECK ((status = 'complete' AND failure_code IS NULL) OR status = 'failed')
);

CREATE TABLE IF NOT EXISTS public.outbound_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE RESTRICT,
  channel text NOT NULL DEFAULT 'email' CHECK (channel = 'email'),
  step integer NOT NULL CHECK (step BETWEEN 1 AND 5),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  draft_artifact_id uuid NOT NULL REFERENCES public.sales_agent_artifacts(id) ON DELETE RESTRICT,
  evaluation_artifact_id uuid NOT NULL REFERENCES public.sales_agent_artifacts(id) ON DELETE RESTRICT,
  recipient_name text NOT NULL,
  recipient_email text NOT NULL,
  client_name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  evaluation jsonb NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('apollo', 'hunter', 'manual')),
  source_reference text NOT NULL,
  source_collected_at timestamptz NOT NULL,
  consent_status text NOT NULL CHECK (consent_status IN ('legitimate_interest', 'opted_in')),
  consent_basis text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending_review', 'changes_required', 'approved', 'rejected', 'stopped', 'released_dry_run', 'blocked')),
  prepare_idempotency_key text NOT NULL,
  approved_hash text,
  decision_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  decision_at timestamptz,
  decision_reason text,
  release_idempotency_key text,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  provider_status text CHECK (provider_status IS NULL OR provider_status IN ('dry_run', 'failed')),
  provider_id text,
  provider_error_code text,
  provider_result jsonb,
  released_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, prepare_idempotency_key),
  CHECK (jsonb_typeof(evaluation) = 'object'),
  CHECK (char_length(btrim(recipient_email)) BETWEEN 3 AND 254),
  CHECK (char_length(btrim(subject)) BETWEEN 1 AND 120),
  CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  CHECK (char_length(prepare_idempotency_key) BETWEEN 16 AND 128),
  CHECK (release_idempotency_key IS NULL OR char_length(release_idempotency_key) BETWEEN 16 AND 128),
  CHECK (approved_hash IS NULL OR approved_hash ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_outbound_action_id_fkey,
  ADD CONSTRAINT messages_outbound_action_id_fkey FOREIGN KEY (outbound_action_id) REFERENCES public.outbound_actions(id) ON DELETE RESTRICT;
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_outbound_action_id_fkey,
  ADD CONSTRAINT events_outbound_action_id_fkey FOREIGN KEY (outbound_action_id) REFERENCES public.outbound_actions(id) ON DELETE SET NULL;
ALTER TABLE public.linkedin_actions
  DROP CONSTRAINT IF EXISTS linkedin_actions_outbound_action_id_fkey,
  ADD CONSTRAINT linkedin_actions_outbound_action_id_fkey FOREIGN KEY (outbound_action_id) REFERENCES public.outbound_actions(id) ON DELETE SET NULL;
ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_outbound_action_id_fkey,
  ADD CONSTRAINT webhook_events_outbound_action_id_fkey FOREIGN KEY (outbound_action_id) REFERENCES public.outbound_actions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_agent_artifacts_trace_idx
  ON public.sales_agent_artifacts (owner_user_id, client_id, prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS outbound_actions_owner_status_idx
  ON public.outbound_actions (owner_user_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS outbound_actions_active_step_unique_idx
  ON public.outbound_actions (client_id, prospect_id, channel, step)
  WHERE status IN ('pending_review', 'changes_required', 'approved', 'released_dry_run');
CREATE UNIQUE INDEX IF NOT EXISTS messages_outbound_action_unique_idx
  ON public.messages (outbound_action_id) WHERE outbound_action_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS outbound_actions_release_key_unique_idx
  ON public.outbound_actions (owner_user_id, release_idempotency_key) WHERE release_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_sales_agent_artifact_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING errcode = 'P0001', message = 'SALES_AGENT_ARTIFACTS_ARE_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS sales_agent_artifacts_append_only ON public.sales_agent_artifacts;
CREATE TRIGGER sales_agent_artifacts_append_only
  BEFORE UPDATE OR DELETE ON public.sales_agent_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_sales_agent_artifact_mutation();

CREATE TRIGGER outbound_actions_updated_at
  BEFORE UPDATE ON public.outbound_actions
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.create_sales_agent_outbound_action(
  p_owner_user_id uuid,
  p_prospect_id uuid,
  p_campaign_id uuid,
  p_step integer,
  p_source_kind text,
  p_source_reference text,
  p_source_collected_at timestamptz,
  p_consent_status text,
  p_consent_basis text,
  p_research jsonb,
  p_enrichment jsonb,
  p_scoring jsonb,
  p_draft jsonb,
  p_evaluation jsonb,
  p_evaluation_passed boolean,
  p_subject text,
  p_body text,
  p_content_hash text,
  p_model_provider text,
  p_model_name text,
  p_prompt_id text,
  p_prompt_version text,
  p_rules_version text,
  p_idempotency_key text
) RETURNS public.outbound_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_prospect public.prospects%rowtype;
  v_client public.clients%rowtype;
  v_action public.outbound_actions%rowtype;
  v_research_id uuid;
  v_enrichment_id uuid;
  v_scoring_id uuid;
  v_draft_id uuid;
  v_evaluation_id uuid;
BEGIN
  PERFORM 1 FROM public.users u
    WHERE u.id = p_owner_user_id AND u.role = 'client' AND u.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = u.id)
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS'; END IF;

  IF p_step IS DISTINCT FROM 1
    OR p_source_kind IS NULL OR p_source_kind NOT IN ('apollo', 'hunter', 'manual')
    OR p_source_reference IS NULL OR char_length(btrim(p_source_reference)) NOT BETWEEN 4 AND 500
    OR p_source_collected_at IS NULL OR p_source_collected_at > now() + interval '5 minutes'
    OR p_source_collected_at < now() - interval '90 days'
    OR p_consent_status IS NULL OR p_consent_status NOT IN ('legitimate_interest', 'opted_in')
    OR p_consent_basis IS NULL OR char_length(btrim(p_consent_basis)) NOT BETWEEN 10 AND 500
    OR p_subject IS NULL OR char_length(btrim(p_subject)) NOT BETWEEN 1 AND 120
    OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 5000
    OR p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$'
    OR p_rules_version IS NULL OR char_length(p_rules_version) NOT BETWEEN 3 AND 100
    OR p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 128
    OR coalesce(jsonb_typeof(p_research), '') <> 'object' OR coalesce(jsonb_typeof(p_enrichment), '') <> 'object'
    OR coalesce(jsonb_typeof(p_scoring), '') <> 'object' OR coalesce(jsonb_typeof(p_draft), '') <> 'object'
    OR coalesce(jsonb_typeof(p_evaluation), '') <> 'object' OR p_evaluation_passed IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;

  SELECT * INTO v_action FROM public.outbound_actions
    WHERE owner_user_id = p_owner_user_id AND prepare_idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_action; END IF;

  SELECT * INTO v_prospect FROM public.prospects WHERE id = p_prospect_id FOR UPDATE;
  IF NOT FOUND OR v_prospect.client_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_NOT_FOUND';
  END IF;
  SELECT * INTO v_client FROM public.clients
    WHERE id = v_prospect.client_id AND owner_user_id = p_owner_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_NOT_FOUND'; END IF;
  IF v_prospect.email IS NULL OR lower(btrim(v_prospect.source)) <> p_source_kind THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'PROVENANCE_NOT_APPROVED';
  END IF;
  IF v_prospect.stage IN ('unsubscribed', 'disqualified')
    OR EXISTS (SELECT 1 FROM public.suppression s WHERE lower(s.email) = lower(v_prospect.email)) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_SUPPRESSED';
  END IF;
  IF p_campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = p_campaign_id AND c.client_id = v_client.id AND c.status IN ('draft', 'active')
  ) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_NOT_FOUND'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.outbound_actions a
    WHERE a.client_id = v_client.id AND a.prospect_id = v_prospect.id AND a.channel = 'email' AND a.step = p_step
      AND a.status IN ('pending_review', 'changes_required', 'approved', 'released_dry_run')
  ) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'DUPLICATE_OUTBOUND_ACTION'; END IF;

  UPDATE public.prospects SET
    source_reference = btrim(p_source_reference), source_collected_at = p_source_collected_at,
    consent_status = p_consent_status, consent_basis = btrim(p_consent_basis)
  WHERE id = v_prospect.id;

  INSERT INTO public.sales_agent_artifacts
    (owner_user_id, client_id, campaign_id, prospect_id, artifact_type, source_kind, source_reference, source_collected_at, content, rules_version)
  VALUES
    (p_owner_user_id, v_client.id, p_campaign_id, v_prospect.id, 'research', p_source_kind, btrim(p_source_reference), p_source_collected_at, p_research, p_rules_version)
  RETURNING id INTO v_research_id;
  INSERT INTO public.sales_agent_artifacts
    (owner_user_id, client_id, campaign_id, prospect_id, artifact_type, parent_artifact_id, source_kind, source_reference, source_collected_at, content, rules_version)
  VALUES
    (p_owner_user_id, v_client.id, p_campaign_id, v_prospect.id, 'enrichment', v_research_id, p_source_kind, btrim(p_source_reference), p_source_collected_at, p_enrichment, p_rules_version)
  RETURNING id INTO v_enrichment_id;
  INSERT INTO public.sales_agent_artifacts
    (owner_user_id, client_id, campaign_id, prospect_id, artifact_type, parent_artifact_id, source_kind, source_reference, source_collected_at, content, rules_version)
  VALUES
    (p_owner_user_id, v_client.id, p_campaign_id, v_prospect.id, 'scoring', v_enrichment_id, p_source_kind, btrim(p_source_reference), p_source_collected_at, p_scoring, p_rules_version)
  RETURNING id INTO v_scoring_id;
  INSERT INTO public.sales_agent_artifacts
    (owner_user_id, client_id, campaign_id, prospect_id, artifact_type, parent_artifact_id, source_kind, source_reference, source_collected_at, content, model_provider, model_name, prompt_id, prompt_version, rules_version)
  VALUES
    (p_owner_user_id, v_client.id, p_campaign_id, v_prospect.id, 'draft', v_scoring_id, p_source_kind, btrim(p_source_reference), p_source_collected_at, p_draft, p_model_provider, p_model_name, p_prompt_id, p_prompt_version, p_rules_version)
  RETURNING id INTO v_draft_id;
  INSERT INTO public.sales_agent_artifacts
    (owner_user_id, client_id, campaign_id, prospect_id, artifact_type, parent_artifact_id, source_kind, source_reference, source_collected_at, content, rules_version, status, failure_code)
  VALUES
    (p_owner_user_id, v_client.id, p_campaign_id, v_prospect.id, 'draft_evaluation', v_draft_id, p_source_kind, btrim(p_source_reference), p_source_collected_at,
     p_evaluation || jsonb_build_object('passed', p_evaluation_passed), p_rules_version,
     CASE WHEN p_evaluation_passed THEN 'complete' ELSE 'failed' END,
     CASE WHEN p_evaluation_passed THEN NULL ELSE 'DETERMINISTIC_EVALUATION_FAILED' END)
  RETURNING id INTO v_evaluation_id;

  INSERT INTO public.outbound_actions
    (owner_user_id, client_id, campaign_id, prospect_id, step, draft_artifact_id, evaluation_artifact_id,
     recipient_name, recipient_email, client_name, subject, body, content_hash, evaluation,
     source_kind, source_reference, source_collected_at, consent_status, consent_basis, status, prepare_idempotency_key)
  VALUES
    (p_owner_user_id, v_client.id, p_campaign_id, v_prospect.id, p_step, v_draft_id, v_evaluation_id,
     coalesce(nullif(btrim(v_prospect.full_name), ''), nullif(btrim(v_prospect.first_name), ''), 'Recipient'), lower(btrim(v_prospect.email)), v_client.name,
     btrim(p_subject), btrim(p_body), p_content_hash, p_evaluation || jsonb_build_object('passed', p_evaluation_passed),
     p_source_kind, btrim(p_source_reference), p_source_collected_at, p_consent_status, btrim(p_consent_basis),
     CASE WHEN p_evaluation_passed THEN 'pending_review' ELSE 'changes_required' END, p_idempotency_key)
  RETURNING * INTO v_action;

  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'sales_agent_approval', 'prepare', 'outbound_action', v_action.id, true,
    jsonb_build_object('client_id', v_client.id, 'prospect_id', v_prospect.id, 'step', p_step, 'status', v_action.status, 'revision', 1));
  RETURN v_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.revise_sales_agent_outbound_action(
  p_owner_user_id uuid,
  p_action_id uuid,
  p_expected_revision integer,
  p_subject text,
  p_body text,
  p_content_hash text,
  p_evaluation jsonb,
  p_evaluation_passed boolean,
  p_rules_version text
) RETURNS public.outbound_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_action public.outbound_actions%rowtype;
  v_draft_id uuid;
  v_evaluation_id uuid;
  v_was_approved boolean;
BEGIN
  SELECT * INTO v_action FROM public.outbound_actions
    WHERE id = p_action_id AND owner_user_id = p_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_NOT_FOUND'; END IF;
  IF v_action.revision <> p_expected_revision OR v_action.status NOT IN ('pending_review', 'changes_required', 'approved') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
  END IF;
  IF p_subject IS NULL OR char_length(btrim(p_subject)) NOT BETWEEN 1 AND 120
    OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 5000
    OR p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_evaluation) <> 'object' OR p_rules_version IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;
  v_was_approved := v_action.status = 'approved';

  INSERT INTO public.sales_agent_artifacts
    (owner_user_id, client_id, campaign_id, prospect_id, artifact_type, parent_artifact_id, source_kind, source_reference, source_collected_at, content, prompt_id, prompt_version, rules_version)
  VALUES
    (p_owner_user_id, v_action.client_id, v_action.campaign_id, v_action.prospect_id, 'draft', v_action.draft_artifact_id,
     'owner_edit', v_action.source_reference, v_action.source_collected_at,
     jsonb_build_object('subject', btrim(p_subject), 'body', btrim(p_body), 'revision', v_action.revision + 1),
     'owner-edit', (v_action.revision + 1)::text, p_rules_version)
  RETURNING id INTO v_draft_id;
  INSERT INTO public.sales_agent_artifacts
    (owner_user_id, client_id, campaign_id, prospect_id, artifact_type, parent_artifact_id, source_kind, source_reference, source_collected_at, content, rules_version, status, failure_code)
  VALUES
    (p_owner_user_id, v_action.client_id, v_action.campaign_id, v_action.prospect_id, 'draft_evaluation', v_draft_id,
     'deterministic_evaluator', v_action.source_reference, v_action.source_collected_at,
     p_evaluation || jsonb_build_object('passed', p_evaluation_passed), p_rules_version,
     CASE WHEN p_evaluation_passed THEN 'complete' ELSE 'failed' END,
     CASE WHEN p_evaluation_passed THEN NULL ELSE 'DETERMINISTIC_EVALUATION_FAILED' END)
  RETURNING id INTO v_evaluation_id;

  UPDATE public.outbound_actions SET
    revision = revision + 1,
    draft_artifact_id = v_draft_id,
    evaluation_artifact_id = v_evaluation_id,
    subject = btrim(p_subject), body = btrim(p_body), content_hash = p_content_hash,
    evaluation = p_evaluation || jsonb_build_object('passed', p_evaluation_passed),
    status = CASE WHEN p_evaluation_passed THEN 'pending_review' ELSE 'changes_required' END,
    approved_hash = NULL, decision_by = NULL, decision_at = NULL, decision_reason = NULL
  WHERE id = v_action.id RETURNING * INTO v_action;

  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'sales_agent_approval', 'revise', 'outbound_action', v_action.id, true,
    jsonb_build_object('revision', v_action.revision, 'status', v_action.status, 'approval_invalidated', v_was_approved));
  RETURN v_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_sales_agent_outbound_action(
  p_owner_user_id uuid,
  p_action_id uuid,
  p_expected_revision integer,
  p_decision text,
  p_reason text
) RETURNS public.outbound_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_action public.outbound_actions%rowtype;
BEGIN
  SELECT * INTO v_action FROM public.outbound_actions
    WHERE id = p_action_id AND owner_user_id = p_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_NOT_FOUND'; END IF;
  IF v_action.revision <> p_expected_revision OR p_decision NOT IN ('approve', 'reject', 'stop') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
  END IF;

  IF p_decision = 'approve' THEN
    IF v_action.status <> 'pending_review' OR coalesce((v_action.evaluation->>'passed')::boolean, false) = false
      OR v_action.source_collected_at < now() - interval '90 days'
      OR v_action.consent_status NOT IN ('legitimate_interest', 'opted_in')
      OR EXISTS (SELECT 1 FROM public.suppression s WHERE lower(s.email) = lower(v_action.recipient_email))
      OR NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = v_action.client_id AND c.owner_user_id = p_owner_user_id AND c.status = 'active')
      OR NOT EXISTS (SELECT 1 FROM public.prospects p WHERE p.id = v_action.prospect_id AND p.client_id = v_action.client_id AND p.stage NOT IN ('unsubscribed', 'disqualified')) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_APPROVAL_BLOCKED';
    END IF;
    UPDATE public.outbound_actions SET status = 'approved', approved_hash = content_hash,
      decision_by = p_owner_user_id, decision_at = now(), decision_reason = NULL
      WHERE id = v_action.id RETURNING * INTO v_action;
  ELSIF p_decision = 'reject' THEN
    IF v_action.status NOT IN ('pending_review', 'changes_required', 'approved')
      OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
    END IF;
    UPDATE public.outbound_actions SET status = 'rejected', approved_hash = NULL,
      decision_by = p_owner_user_id, decision_at = now(), decision_reason = btrim(p_reason)
      WHERE id = v_action.id RETURNING * INTO v_action;
  ELSE
    IF v_action.status NOT IN ('pending_review', 'changes_required', 'approved')
      OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
    END IF;
    UPDATE public.outbound_actions SET status = 'stopped', approved_hash = NULL, stopped_at = now(),
      decision_by = p_owner_user_id, decision_at = now(), decision_reason = btrim(p_reason)
      WHERE id = v_action.id RETURNING * INTO v_action;
  END IF;

  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'sales_agent_approval', p_decision, 'outbound_action', v_action.id, true,
    jsonb_build_object('revision', v_action.revision, 'status', v_action.status));
  RETURN v_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sales_agent_outbound_action_dry_run(
  p_owner_user_id uuid,
  p_action_id uuid,
  p_expected_revision integer,
  p_release_idempotency_key text,
  p_daily_limit integer,
  p_final_body text
) RETURNS public.outbound_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_action public.outbound_actions%rowtype;
  v_message public.messages%rowtype;
  v_sent_count bigint;
BEGIN
  IF p_release_idempotency_key IS NULL OR char_length(p_release_idempotency_key) NOT BETWEEN 16 AND 128
    OR p_daily_limit NOT BETWEEN 1 AND 500 OR p_final_body IS NULL OR char_length(p_final_body) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;
  SELECT * INTO v_action FROM public.outbound_actions
    WHERE id = p_action_id AND owner_user_id = p_owner_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_NOT_FOUND'; END IF;
  IF v_action.status = 'released_dry_run' AND v_action.release_idempotency_key = p_release_idempotency_key THEN RETURN v_action; END IF;
  IF v_action.status <> 'approved' OR v_action.revision <> p_expected_revision
    OR v_action.approved_hash IS NULL OR v_action.approved_hash <> v_action.content_hash
    OR coalesce((v_action.evaluation->>'passed')::boolean, false) = false THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
  END IF;
  IF v_action.source_kind NOT IN ('apollo', 'hunter', 'manual')
    OR v_action.source_collected_at < now() - interval '90 days'
    OR v_action.source_collected_at > now() + interval '5 minutes'
    OR v_action.consent_status NOT IN ('legitimate_interest', 'opted_in')
    OR EXISTS (SELECT 1 FROM public.suppression s WHERE lower(s.email) = lower(v_action.recipient_email))
    OR NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = v_action.client_id AND c.owner_user_id = p_owner_user_id AND c.status = 'active')
    OR NOT EXISTS (SELECT 1 FROM public.prospects p WHERE p.id = v_action.prospect_id AND p.client_id = v_action.client_id
      AND lower(p.email) = lower(v_action.recipient_email) AND p.stage NOT IN ('unsubscribed', 'disqualified')) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_RELEASE_BLOCKED';
  END IF;
  IF v_action.campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.campaigns c WHERE c.id = v_action.campaign_id AND c.client_id = v_action.client_id AND c.status = 'active'
  ) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_RELEASE_BLOCKED'; END IF;
  IF EXISTS (SELECT 1 FROM public.messages m WHERE m.outbound_action_id = v_action.id) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'DUPLICATE_OUTBOUND_ACTION';
  END IF;

  SELECT count(*) INTO STRICT v_sent_count FROM public.messages
    WHERE status IN ('sent', 'dry_run') AND created_at >= date_trunc('day', now());
  IF v_sent_count >= p_daily_limit THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_DAILY_CAP_REACHED'; END IF;

  INSERT INTO public.messages
    (prospect_id, client_id, channel, step, subject, body, status, provider_id, error, sent_at, outbound_action_id)
  VALUES
    (v_action.prospect_id, v_action.client_id, 'email', v_action.step, v_action.subject, p_final_body,
     'dry_run', NULL, NULL, now(), v_action.id)
  RETURNING * INTO v_message;

  UPDATE public.outbound_actions SET status = 'released_dry_run', release_idempotency_key = p_release_idempotency_key,
    message_id = v_message.id, provider_status = 'dry_run', provider_id = NULL, provider_error_code = NULL,
    provider_result = jsonb_build_object('mode', 'dry_run', 'policy', 'phase15a-approval-gate@1.0.0'), released_at = now()
  WHERE id = v_action.id RETURNING * INTO v_action;

  INSERT INTO public.events (prospect_id, message_id, outbound_action_id, type, meta)
  VALUES (v_action.prospect_id, v_message.id, v_action.id, 'sent', jsonb_build_object('mode', 'dry_run', 'step', v_action.step));
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'sales_agent_approval', 'release_dry_run', 'outbound_action', v_action.id, true,
    jsonb_build_object('revision', v_action.revision, 'message_id', v_message.id, 'provider_status', 'dry_run'));
  RETURN v_action;
END;
$$;

ALTER TABLE public.sales_agent_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_agent_artifacts, public.outbound_actions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.sales_agent_artifacts TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.outbound_actions TO service_role;

REVOKE ALL ON FUNCTION public.prevent_sales_agent_artifact_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_sales_agent_outbound_action(uuid, uuid, uuid, integer, text, text, timestamptz, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revise_sales_agent_outbound_action(uuid, uuid, integer, text, text, text, jsonb, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_sales_agent_outbound_action(uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_sales_agent_outbound_action_dry_run(uuid, uuid, integer, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_agent_outbound_action(uuid, uuid, uuid, integer, text, text, timestamptz, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revise_sales_agent_outbound_action(uuid, uuid, integer, text, text, text, jsonb, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_sales_agent_outbound_action(uuid, uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sales_agent_outbound_action_dry_run(uuid, uuid, integer, text, integer, text) TO service_role;
COMMIT;
