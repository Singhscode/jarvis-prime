-- Phase 15A follow-up hardening.
-- Additive only: migration 22 remains immutable and this migration replaces the
-- mutable RPC definitions after their original deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.outbound_actions
  ADD COLUMN IF NOT EXISTS approved_release_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'outbound_actions_approved_release_hash_check'
  ) THEN
    ALTER TABLE public.outbound_actions
      ADD CONSTRAINT outbound_actions_approved_release_hash_check
      CHECK (approved_release_hash IS NULL OR approved_release_hash ~ '^[0-9a-f]{64}$');
  END IF;
END;
$$;

-- Preserve the migration-22 implementation behind a non-callable name. The
-- public wrapper verifies that evidence was persisted before this request; the
-- legacy implementation can then build artifacts without trusting browser data.
ALTER FUNCTION public.create_sales_agent_outbound_action(
  uuid, uuid, uuid, integer, text, text, timestamptz, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text, text,
  text, text, text, text, text, text
) RENAME TO create_sales_agent_outbound_action_v22;

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
  v_existing public.outbound_actions%rowtype;
BEGIN
  PERFORM 1
  FROM public.users u
  WHERE u.id = p_owner_user_id
    AND u.role = 'client'
    AND u.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = u.id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS';
  END IF;

  SELECT * INTO v_existing
  FROM public.outbound_actions
  WHERE owner_user_id = p_owner_user_id
    AND prepare_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT p.* INTO v_prospect
  FROM public.prospects p
  JOIN public.clients c ON c.id = p.client_id
  WHERE p.id = p_prospect_id
    AND c.owner_user_id = p_owner_user_id
    AND c.status = 'active'
  FOR UPDATE OF p, c;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_NOT_FOUND';
  END IF;

  IF lower(btrim(v_prospect.source)) IS DISTINCT FROM p_source_kind
    OR btrim(v_prospect.source_reference) IS DISTINCT FROM btrim(p_source_reference)
    OR v_prospect.source_collected_at IS DISTINCT FROM p_source_collected_at
    OR v_prospect.consent_status IS DISTINCT FROM p_consent_status
    OR btrim(v_prospect.consent_basis) IS DISTINCT FROM btrim(p_consent_basis) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'PROVENANCE_NOT_APPROVED';
  END IF;

  RETURN public.create_sales_agent_outbound_action_v22(
    p_owner_user_id,
    p_prospect_id,
    p_campaign_id,
    p_step,
    p_source_kind,
    p_source_reference,
    p_source_collected_at,
    p_consent_status,
    p_consent_basis,
    p_research,
    p_enrichment,
    p_scoring,
    p_draft,
    p_evaluation,
    p_evaluation_passed,
    p_subject,
    p_body,
    p_content_hash,
    p_model_provider,
    p_model_name,
    p_prompt_id,
    p_prompt_version,
    p_rules_version,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_phase15_outbound_action_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.step IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;

  IF NEW.source_collected_at IS NULL
    OR NEW.source_collected_at < now() - interval '90 days'
    OR NEW.source_collected_at > now() + interval '5 minutes'
    OR NEW.consent_status NOT IN ('legitimate_interest', 'opted_in')
    OR NOT EXISTS (
      SELECT 1
      FROM public.prospects p
      JOIN public.clients c ON c.id = p.client_id
      JOIN public.users u ON u.id = c.owner_user_id
      WHERE p.id = NEW.prospect_id
        AND p.client_id = NEW.client_id
        AND c.id = NEW.client_id
        AND c.owner_user_id = NEW.owner_user_id
        AND c.status = 'active'
        AND u.id = NEW.owner_user_id
        AND u.role = 'client'
        AND u.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM public.client_portal_memberships m
          WHERE m.user_id = u.id
        )
        AND lower(btrim(p.email)) = lower(btrim(NEW.recipient_email))
        AND lower(btrim(p.source)) = NEW.source_kind
        AND btrim(p.source_reference) = btrim(NEW.source_reference)
        AND p.source_collected_at = NEW.source_collected_at
        AND p.consent_status = NEW.consent_status
        AND btrim(p.consent_basis) = btrim(NEW.consent_basis)
    ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'PROVENANCE_NOT_APPROVED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase15_outbound_action_binding_insert ON public.outbound_actions;
CREATE TRIGGER phase15_outbound_action_binding_insert
  BEFORE INSERT ON public.outbound_actions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_phase15_outbound_action_binding();

DROP TRIGGER IF EXISTS phase15_outbound_action_binding_update ON public.outbound_actions;
CREATE TRIGGER phase15_outbound_action_binding_update
  BEFORE UPDATE OF owner_user_id, client_id, prospect_id, recipient_email,
    source_kind, source_reference, source_collected_at, consent_status,
    consent_basis, step
  ON public.outbound_actions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_phase15_outbound_action_binding();

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
  PERFORM 1
  FROM public.users u
  WHERE u.id = p_owner_user_id
    AND u.role = 'client'
    AND u.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = u.id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS';
  END IF;

  SELECT * INTO v_action
  FROM public.outbound_actions
  WHERE id = p_action_id AND owner_user_id = p_owner_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_NOT_FOUND';
  END IF;

  IF p_expected_revision IS NULL
    OR p_expected_revision < 1
    OR v_action.revision <> p_expected_revision
    OR v_action.status NOT IN ('pending_review', 'changes_required', 'approved') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
  END IF;

  IF p_subject IS NULL OR char_length(btrim(p_subject)) NOT BETWEEN 1 AND 120
    OR p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 5000
    OR p_content_hash IS NULL OR p_content_hash !~ '^[0-9a-f]{64}$'
    OR coalesce(jsonb_typeof(p_evaluation), '') <> 'object'
    OR p_evaluation_passed IS NULL
    OR p_rules_version IS NULL OR char_length(p_rules_version) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;

  v_was_approved := v_action.status = 'approved';

  INSERT INTO public.sales_agent_artifacts
    (owner_user_id, client_id, campaign_id, prospect_id, artifact_type,
     parent_artifact_id, source_kind, source_reference, source_collected_at,
     content, prompt_id, prompt_version, rules_version)
  VALUES
    (p_owner_user_id, v_action.client_id, v_action.campaign_id,
     v_action.prospect_id, 'draft', v_action.draft_artifact_id, 'owner_edit',
     v_action.source_reference, v_action.source_collected_at,
     jsonb_build_object(
       'subject', btrim(p_subject),
       'body', btrim(p_body),
       'revision', v_action.revision + 1
     ),
     'owner-edit', (v_action.revision + 1)::text, p_rules_version)
  RETURNING id INTO v_draft_id;

  INSERT INTO public.sales_agent_artifacts
    (owner_user_id, client_id, campaign_id, prospect_id, artifact_type,
     parent_artifact_id, source_kind, source_reference, source_collected_at,
     content, rules_version, status, failure_code)
  VALUES
    (p_owner_user_id, v_action.client_id, v_action.campaign_id,
     v_action.prospect_id, 'draft_evaluation', v_draft_id,
     'deterministic_evaluator', v_action.source_reference,
     v_action.source_collected_at,
     p_evaluation || jsonb_build_object('passed', p_evaluation_passed),
     p_rules_version,
     CASE WHEN p_evaluation_passed THEN 'complete' ELSE 'failed' END,
     CASE WHEN p_evaluation_passed THEN NULL ELSE 'DETERMINISTIC_EVALUATION_FAILED' END)
  RETURNING id INTO v_evaluation_id;

  UPDATE public.outbound_actions
  SET revision = revision + 1,
      draft_artifact_id = v_draft_id,
      evaluation_artifact_id = v_evaluation_id,
      subject = btrim(p_subject),
      body = btrim(p_body),
      content_hash = p_content_hash,
      evaluation = p_evaluation || jsonb_build_object('passed', p_evaluation_passed),
      status = CASE WHEN p_evaluation_passed THEN 'pending_review' ELSE 'changes_required' END,
      approved_hash = NULL,
      decision_by = NULL,
      decision_at = NULL,
      decision_reason = NULL
  WHERE id = v_action.id
  RETURNING * INTO v_action;

  INSERT INTO public.audit_logs
    (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES
    (p_owner_user_id, 'sales_agent_approval', 'revise', 'outbound_action',
     v_action.id, true,
     jsonb_build_object(
       'revision', v_action.revision,
       'status', v_action.status,
       'approval_invalidated', v_was_approved
     ));

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
DECLARE
  v_action public.outbound_actions%rowtype;
BEGIN
  PERFORM 1
  FROM public.users u
  WHERE u.id = p_owner_user_id
    AND u.role = 'client'
    AND u.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = u.id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS';
  END IF;

  SELECT * INTO v_action
  FROM public.outbound_actions
  WHERE id = p_action_id AND owner_user_id = p_owner_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_NOT_FOUND';
  END IF;

  IF p_expected_revision IS NULL
    OR p_expected_revision < 1
    OR v_action.revision <> p_expected_revision
    OR p_decision IS NULL
    OR p_decision NOT IN ('approve', 'reject', 'stop') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
  END IF;

  IF p_decision = 'approve' THEN
    IF v_action.status <> 'pending_review'
      OR (v_action.evaluation->>'passed') IS DISTINCT FROM 'true'
      OR v_action.source_kind NOT IN ('apollo', 'hunter', 'manual')
      OR v_action.source_collected_at < now() - interval '90 days'
      OR v_action.source_collected_at > now() + interval '5 minutes'
      OR v_action.consent_status NOT IN ('legitimate_interest', 'opted_in')
      OR EXISTS (
        SELECT 1 FROM public.suppression s
        WHERE lower(s.email) = lower(v_action.recipient_email)
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id = v_action.client_id
          AND c.owner_user_id = p_owner_user_id
          AND c.status = 'active'
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.prospects p
        WHERE p.id = v_action.prospect_id
          AND p.client_id = v_action.client_id
          AND p.stage NOT IN ('unsubscribed', 'disqualified')
          AND lower(btrim(p.email)) = lower(v_action.recipient_email)
          AND lower(btrim(p.source)) = v_action.source_kind
          AND btrim(p.source_reference) = btrim(v_action.source_reference)
          AND p.source_collected_at = v_action.source_collected_at
          AND p.consent_status = v_action.consent_status
          AND btrim(p.consent_basis) = btrim(v_action.consent_basis)
      ) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_APPROVAL_BLOCKED';
    END IF;

    UPDATE public.outbound_actions
    SET status = 'approved',
        approved_hash = content_hash,
        decision_by = p_owner_user_id,
        decision_at = now(),
        decision_reason = NULL
    WHERE id = v_action.id
    RETURNING * INTO v_action;
  ELSIF p_decision = 'reject' THEN
    IF v_action.status NOT IN ('pending_review', 'changes_required', 'approved')
      OR p_reason IS NULL
      OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
    END IF;

    UPDATE public.outbound_actions
    SET status = 'rejected',
        approved_hash = NULL,
        decision_by = p_owner_user_id,
        decision_at = now(),
        decision_reason = btrim(p_reason)
    WHERE id = v_action.id
    RETURNING * INTO v_action;
  ELSE
    IF v_action.status NOT IN ('pending_review', 'changes_required', 'approved')
      OR p_reason IS NULL
      OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
    END IF;

    UPDATE public.outbound_actions
    SET status = 'stopped',
        approved_hash = NULL,
        stopped_at = now(),
        decision_by = p_owner_user_id,
        decision_at = now(),
        decision_reason = btrim(p_reason)
    WHERE id = v_action.id
    RETURNING * INTO v_action;
  END IF;

  INSERT INTO public.audit_logs
    (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES
    (p_owner_user_id, 'sales_agent_approval', p_decision, 'outbound_action',
     v_action.id, true,
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
  v_footer_lines text[];
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 1
    OR p_release_idempotency_key IS NULL
    OR char_length(p_release_idempotency_key) NOT BETWEEN 16 AND 128
    OR p_daily_limit IS NULL OR p_daily_limit NOT BETWEEN 1 AND 500
    OR p_final_body IS NULL
    OR char_length(p_final_body) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;

  PERFORM 1
  FROM public.users u
  WHERE u.id = p_owner_user_id
    AND u.role = 'client'
    AND u.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = u.id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS';
  END IF;

  SELECT * INTO v_action
  FROM public.outbound_actions
  WHERE id = p_action_id AND owner_user_id = p_owner_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_NOT_FOUND';
  END IF;

  IF v_action.status = 'released_dry_run'
    AND v_action.release_idempotency_key = p_release_idempotency_key THEN
    RETURN v_action;
  END IF;

  IF v_action.status <> 'approved'
    OR v_action.revision <> p_expected_revision
    OR v_action.approved_hash IS NULL
    OR v_action.approved_hash <> v_action.content_hash
    OR (v_action.evaluation->>'passed') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
  END IF;

  IF left(p_final_body, char_length(v_action.body)) IS DISTINCT FROM v_action.body THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_RELEASE_BLOCKED';
  END IF;
  v_footer_lines := string_to_array(
    substring(p_final_body FROM char_length(v_action.body) + 1),
    E'\n'
  );
  IF array_length(v_footer_lines, 1) IS DISTINCT FROM 5
    OR v_footer_lines[1] <> ''
    OR v_footer_lines[2] <> ''
    OR v_footer_lines[3] <> '—'
    OR char_length(btrim(v_footer_lines[4])) NOT BETWEEN 3 AND 500
    OR v_footer_lines[5] NOT LIKE 'Don''t want these emails? Unsubscribe: https://%'
    OR char_length(v_footer_lines[5]) > 1000 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_RELEASE_BLOCKED';
  END IF;

  IF v_action.source_kind NOT IN ('apollo', 'hunter', 'manual')
    OR v_action.source_collected_at < now() - interval '90 days'
    OR v_action.source_collected_at > now() + interval '5 minutes'
    OR v_action.consent_status NOT IN ('legitimate_interest', 'opted_in')
    OR EXISTS (
      SELECT 1 FROM public.suppression s
      WHERE lower(s.email) = lower(v_action.recipient_email)
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = v_action.client_id
        AND c.owner_user_id = p_owner_user_id
        AND c.status = 'active'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.prospects p
      WHERE p.id = v_action.prospect_id
        AND p.client_id = v_action.client_id
        AND lower(btrim(p.email)) = lower(v_action.recipient_email)
        AND lower(btrim(p.source)) = v_action.source_kind
        AND btrim(p.source_reference) = btrim(v_action.source_reference)
        AND p.source_collected_at = v_action.source_collected_at
        AND p.consent_status = v_action.consent_status
        AND btrim(p.consent_basis) = btrim(v_action.consent_basis)
        AND p.stage NOT IN ('unsubscribed', 'disqualified')
    ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_RELEASE_BLOCKED';
  END IF;

  IF v_action.campaign_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.campaigns c
    WHERE c.id = v_action.campaign_id
      AND c.client_id = v_action.client_id
      AND c.status = 'active'
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_RELEASE_BLOCKED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.messages m WHERE m.outbound_action_id = v_action.id
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'DUPLICATE_OUTBOUND_ACTION';
  END IF;

  -- Serialize against every message insertion, including legacy code paths,
  -- before checking and consuming the global daily allowance.
  LOCK TABLE public.messages IN SHARE ROW EXCLUSIVE MODE;
  SELECT count(*) INTO STRICT v_sent_count
  FROM public.messages
  WHERE status IN ('sent', 'dry_run')
    AND created_at >= date_trunc('day', now());
  IF v_sent_count >= p_daily_limit THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_DAILY_CAP_REACHED';
  END IF;

  INSERT INTO public.messages
    (prospect_id, client_id, channel, step, subject, body, status,
     provider_id, error, sent_at, outbound_action_id)
  VALUES
    (v_action.prospect_id, v_action.client_id, 'email', v_action.step,
     v_action.subject, p_final_body, 'dry_run', NULL, NULL, now(), v_action.id)
  RETURNING * INTO v_message;

  UPDATE public.outbound_actions
  SET status = 'released_dry_run',
      release_idempotency_key = p_release_idempotency_key,
      message_id = v_message.id,
      provider_status = 'dry_run',
      provider_id = NULL,
      provider_error_code = NULL,
      provider_result = jsonb_build_object(
        'mode', 'dry_run',
        'policy', 'phase15a-approval-gate@1.0.0'
      ),
      released_at = now()
  WHERE id = v_action.id
  RETURNING * INTO v_action;

  INSERT INTO public.events
    (prospect_id, message_id, outbound_action_id, type, meta)
  VALUES
    (v_action.prospect_id, v_message.id, v_action.id, 'dry_run',
     jsonb_build_object('mode', 'dry_run', 'step', v_action.step));

  INSERT INTO public.audit_logs
    (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES
    (p_owner_user_id, 'sales_agent_approval', 'release_dry_run',
     'outbound_action', v_action.id, true,
     jsonb_build_object(
       'revision', v_action.revision,
       'message_id', v_message.id,
       'provider_status', 'dry_run'
     ));

  RETURN v_action;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_phase15_outbound_action_binding()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revise_sales_agent_outbound_action(
  uuid, uuid, integer, text, text, text, jsonb, boolean, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_sales_agent_outbound_action(
  uuid, uuid, integer, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_sales_agent_outbound_action_dry_run(
  uuid, uuid, integer, text, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revise_sales_agent_outbound_action(
  uuid, uuid, integer, text, text, text, jsonb, boolean, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_sales_agent_outbound_action(
  uuid, uuid, integer, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sales_agent_outbound_action_dry_run(
  uuid, uuid, integer, text, integer, text
) TO service_role;

COMMIT;
