-- Phase 15A release-capability enforcement.
-- Forward-only follow-up: do not rewrite migrations 22 or 23.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.outbound_actions
  ADD COLUMN IF NOT EXISTS approved_release_hash text;

-- Migration 23 wraps the original preparation RPC. Close both function ACLs
-- explicitly so only the service role can enter through the verified wrapper.
REVOKE ALL ON FUNCTION public.create_sales_agent_outbound_action_v22(
  uuid, uuid, uuid, integer, text, text, timestamptz, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text, text,
  text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_sales_agent_outbound_action(
  uuid, uuid, uuid, integer, text, text, timestamptz, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text, text,
  text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_agent_outbound_action(
  uuid, uuid, uuid, integer, text, text, timestamptz, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, boolean, text, text, text,
  text, text, text, text, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_phase15_approved_release_hash_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.subject IS DISTINCT FROM OLD.subject
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.draft_artifact_id IS DISTINCT FROM OLD.draft_artifact_id
    OR NEW.evaluation_artifact_id IS DISTINCT FROM OLD.evaluation_artifact_id THEN
    NEW.approved_release_hash := NULL;
  END IF;

  IF NEW.status NOT IN ('approved', 'released_dry_run') THEN
    NEW.approved_release_hash := NULL;
  END IF;

  IF NEW.status IN ('approved', 'released_dry_run')
    AND NEW.approved_release_hash IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_ACTION_STATE_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase15_approved_release_hash_state
  ON public.outbound_actions;
CREATE TRIGGER phase15_approved_release_hash_state
  BEFORE UPDATE ON public.outbound_actions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_phase15_approved_release_hash_state();

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
      OR p_reason IS NULL
      OR p_reason !~ '^[0-9a-f]{64}$'
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
        approved_release_hash = p_reason,
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
        approved_release_hash = NULL,
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
        approved_release_hash = NULL,
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

CREATE OR REPLACE FUNCTION public.enforce_phase15_message_release_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action public.outbound_actions%rowtype;
  v_release_hash text;
BEGIN
  IF NEW.status NOT IN ('sent', 'dry_run') THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'dry_run' OR NEW.outbound_action_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_APPROVAL_REQUIRED';
  END IF;

  SELECT * INTO v_action
  FROM public.outbound_actions
  WHERE id = NEW.outbound_action_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_RELEASE_BLOCKED';
  END IF;

  v_release_hash := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(v_action.subject || E'\n' || NEW.body, 'UTF8')
    ),
    'hex'
  );

  IF v_action.status <> 'approved'
    OR v_action.approved_hash IS NULL
    OR v_action.approved_hash <> v_action.content_hash
    OR v_action.approved_release_hash IS DISTINCT FROM v_release_hash
    OR (v_action.evaluation->>'passed') IS DISTINCT FROM 'true'
    OR NEW.prospect_id IS DISTINCT FROM v_action.prospect_id
    OR NEW.client_id IS DISTINCT FROM v_action.client_id
    OR NEW.channel IS DISTINCT FROM v_action.channel
    OR NEW.step IS DISTINCT FROM v_action.step
    OR NEW.subject IS DISTINCT FROM v_action.subject THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OUTBOUND_RELEASE_BLOCKED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS phase15_message_release_binding_insert
  ON public.messages;
CREATE TRIGGER phase15_message_release_binding_insert
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_phase15_message_release_binding();

DROP TRIGGER IF EXISTS phase15_message_release_binding_update
  ON public.messages;
CREATE TRIGGER phase15_message_release_binding_update
  BEFORE UPDATE OF status, outbound_action_id, prospect_id, client_id,
    channel, step, subject, body
  ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_phase15_message_release_binding();

REVOKE ALL ON FUNCTION public.enforce_phase15_approved_release_hash_state()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_phase15_message_release_binding()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.decide_sales_agent_outbound_action(
  uuid, uuid, integer, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_sales_agent_outbound_action(
  uuid, uuid, integer, text, text
) TO service_role;

COMMIT;
