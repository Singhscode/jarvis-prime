-- Forward-only Owner Workspace employee invitation and automation-run support.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS public.employee_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'dry_run', 'failed')),
  expires_at timestamptz NOT NULL,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_invitations_owner_created_idx ON public.employee_invitations (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.owner_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workflow text NOT NULL CHECK (workflow IN ('workspace_summary')),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (owner_user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS owner_automation_runs_owner_created_idx ON public.owner_automation_runs (owner_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_owner_employee_invitation(
  p_owner_user_id uuid, p_email text, p_full_name text, p_department text, p_phone text, p_token_hash text, p_expires_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_employee public.users%rowtype; v_invitation public.employee_invitations%rowtype; v_email text;
BEGIN
  v_email := lower(btrim(p_email));
  IF p_full_name IS NULL OR char_length(btrim(p_full_name)) NOT BETWEEN 2 AND 150
    OR p_department IS NULL OR char_length(btrim(p_department)) NOT BETWEEN 2 AND 80
    OR p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$'
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_token_hash IS NULL OR char_length(p_token_hash) <> 64 OR p_expires_at <= now() THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;
  PERFORM 1 FROM public.users u WHERE u.id = p_owner_user_id AND u.role = 'client' AND u.status = 'active' FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = p_owner_user_id) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE email_normalized = v_email) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'EMPLOYEE_INVITATION_NOT_AVAILABLE';
  END IF;
  INSERT INTO public.users (email, email_normalized, full_name, department, phone, status, role, failed_login_attempts, portal_owner_user_id)
  VALUES (v_email, v_email, btrim(p_full_name), btrim(p_department), p_phone, 'pending_verification', 'employee', 0, p_owner_user_id)
  RETURNING * INTO v_employee;
  INSERT INTO public.employee_invitations (owner_user_id, employee_user_id, token_hash, expires_at)
  VALUES (p_owner_user_id, v_employee.id, p_token_hash, p_expires_at) RETURNING * INTO v_invitation;
  INSERT INTO public.password_resets (user_id, token_hash, expires_at) VALUES (v_employee.id, p_token_hash, p_expires_at);
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'owner_employee_invitation', 'create', 'user', v_employee.id, true, jsonb_build_object('invitation_id', v_invitation.id, 'status', 'pending'));
  RETURN jsonb_build_object('id', v_employee.id, 'invitation_id', v_invitation.id, 'email', v_employee.email, 'status', 'invited', 'expires_at', v_invitation.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_owner_employee_invitation_delivery(p_owner_user_id uuid, p_invitation_id uuid, p_delivery_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_invitation public.employee_invitations%rowtype;
BEGIN
  IF p_delivery_status NOT IN ('sent', 'dry_run', 'failed') THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR'; END IF;
  UPDATE public.employee_invitations SET delivery_status = p_delivery_status, delivered_at = CASE WHEN p_delivery_status IN ('sent', 'dry_run') THEN now() ELSE NULL END, updated_at = now()
  WHERE id = p_invitation_id AND owner_user_id = p_owner_user_id AND status = 'pending' RETURNING * INTO v_invitation;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'EMPLOYEE_INVITATION_NOT_FOUND'; END IF;
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'owner_employee_invitation', 'deliver', 'employee_invitation', v_invitation.id, p_delivery_status <> 'failed', jsonb_build_object('delivery_status', p_delivery_status));
  RETURN jsonb_build_object('id', v_invitation.id, 'delivery_status', v_invitation.delivery_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_owner_automation_run(p_owner_user_id uuid, p_workflow text, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.owner_automation_runs%rowtype;
BEGIN
  IF p_workflow <> 'workspace_summary' OR p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;
  PERFORM 1 FROM public.users u WHERE u.id = p_owner_user_id AND u.role = 'client' AND u.status = 'active' FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = p_owner_user_id) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS';
  END IF;
  SELECT * INTO v_run FROM public.owner_automation_runs WHERE owner_user_id = p_owner_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('id', v_run.id, 'workflow', v_run.workflow, 'status', v_run.status, 'created', false); END IF;
  IF EXISTS (SELECT 1 FROM public.owner_automation_runs WHERE owner_user_id = p_owner_user_id AND status IN ('pending', 'running') AND created_at > now() - interval '5 minutes') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RATE_LIMITED';
  END IF;
  INSERT INTO public.owner_automation_runs (owner_user_id, workflow, idempotency_key, logs)
  VALUES (p_owner_user_id, p_workflow, p_idempotency_key, jsonb_build_array(jsonb_build_object('at', now(), 'message', 'Workspace summary queued.')))
  RETURNING * INTO v_run;
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'owner_automation', 'request', 'owner_automation_run', v_run.id, true, jsonb_build_object('workflow', v_run.workflow));
  RETURN jsonb_build_object('id', v_run.id, 'workflow', v_run.workflow, 'status', v_run.status, 'created', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_owner_automation_run(p_owner_user_id uuid, p_run_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.owner_automation_runs SET status = 'running', started_at = now(), logs = logs || jsonb_build_array(jsonb_build_object('at', now(), 'message', 'Workspace summary running.'))
  WHERE id = p_run_id AND owner_user_id = p_owner_user_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_owner_automation_run(p_owner_user_id uuid, p_run_id uuid, p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.owner_automation_runs%rowtype;
BEGIN
  UPDATE public.owner_automation_runs SET status = 'completed', result = p_result, completed_at = now(), logs = logs || jsonb_build_array(jsonb_build_object('at', now(), 'message', 'Workspace summary completed.'))
  WHERE id = p_run_id AND owner_user_id = p_owner_user_id AND status = 'running' RETURNING * INTO v_run;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RUN_NOT_FOUND'; END IF;
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'owner_automation', 'complete', 'owner_automation_run', v_run.id, true, jsonb_build_object('workflow', v_run.workflow));
  RETURN jsonb_build_object('id', v_run.id, 'status', v_run.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_owner_automation_run(p_owner_user_id uuid, p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.owner_automation_runs%rowtype;
BEGIN
  UPDATE public.owner_automation_runs SET status = 'failed', completed_at = now(), logs = logs || jsonb_build_array(jsonb_build_object('at', now(), 'message', 'Workspace summary could not complete.'))
  WHERE id = p_run_id AND owner_user_id = p_owner_user_id AND status = 'running' RETURNING * INTO v_run;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RUN_NOT_FOUND'; END IF;
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'owner_automation', 'fail', 'owner_automation_run', v_run.id, false, jsonb_build_object('workflow', v_run.workflow));
  RETURN jsonb_build_object('id', v_run.id, 'status', v_run.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_pending_employee_invitation(p_employee_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_employee public.users%rowtype; v_invitation public.employee_invitations%rowtype;
BEGIN
  SELECT * INTO v_employee FROM public.users WHERE id = p_employee_user_id AND role = 'employee' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('activated', false, 'accepted', false); END IF;
  SELECT * INTO v_invitation FROM public.employee_invitations WHERE employee_user_id = p_employee_user_id FOR UPDATE;
  IF NOT FOUND THEN
    IF v_employee.status = 'pending_verification' THEN
      UPDATE public.users SET email_verified_at = now(), status = 'active', updated_at = now() WHERE id = p_employee_user_id;
      RETURN jsonb_build_object('activated', true, 'accepted', false);
    END IF;
    RETURN jsonb_build_object('activated', false, 'accepted', false);
  END IF;
  IF v_invitation.status = 'accepted' THEN
    RETURN jsonb_build_object('activated', v_employee.status = 'active', 'accepted', true, 'already_accepted', true);
  END IF;
  IF v_invitation.status <> 'pending' OR v_employee.status NOT IN ('pending_verification', 'active') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'EMPLOYEE_INVITATION_NOT_AVAILABLE';
  END IF;
  IF v_employee.status = 'pending_verification' THEN
    UPDATE public.users SET email_verified_at = now(), status = 'active', updated_at = now() WHERE id = p_employee_user_id;
  END IF;
  UPDATE public.employee_invitations SET status = 'accepted', updated_at = now()
  WHERE id = v_invitation.id AND status = 'pending';
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (v_invitation.owner_user_id, 'owner_employee_invitation', 'accept', 'employee_invitation', v_invitation.id, true, jsonb_build_object('employee_user_id', p_employee_user_id));
  RETURN jsonb_build_object('activated', true, 'accepted', true, 'already_accepted', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_owner_employee_invitation_resend(
  p_owner_user_id uuid, p_employee_user_id uuid, p_token_hash text, p_expires_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_employee public.users%rowtype; v_invitation public.employee_invitations%rowtype; v_was_expired boolean;
BEGIN
  IF p_token_hash IS NULL OR char_length(p_token_hash) <> 64 OR p_expires_at <= now() THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;
  PERFORM 1 FROM public.users u WHERE u.id = p_owner_user_id AND u.role = 'client' AND u.status = 'active' FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = p_owner_user_id) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS';
  END IF;
  SELECT * INTO v_employee FROM public.users
  WHERE id = p_employee_user_id AND portal_owner_user_id = p_owner_user_id AND role = 'employee' AND status = 'pending_verification' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'EMPLOYEE_INVITATION_NOT_FOUND'; END IF;
  SELECT * INTO v_invitation FROM public.employee_invitations
  WHERE owner_user_id = p_owner_user_id AND employee_user_id = p_employee_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'EMPLOYEE_INVITATION_NOT_FOUND'; END IF;
  IF v_invitation.status <> 'pending' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'EMPLOYEE_INVITATION_NOT_AVAILABLE'; END IF;
  v_was_expired := v_invitation.expires_at <= now();
  UPDATE public.password_resets SET used_at = now()
  WHERE user_id = p_employee_user_id AND token_hash = v_invitation.token_hash AND used_at IS NULL;
  UPDATE public.employee_invitations SET token_hash = p_token_hash, expires_at = p_expires_at, delivery_status = 'pending', delivered_at = NULL, updated_at = now()
  WHERE id = v_invitation.id;
  INSERT INTO public.password_resets (user_id, token_hash, expires_at) VALUES (p_employee_user_id, p_token_hash, p_expires_at);
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'owner_employee_invitation', 'resend', 'employee_invitation', v_invitation.id, true, jsonb_build_object('was_expired', v_was_expired));
  RETURN jsonb_build_object('id', v_employee.id, 'invitation_id', v_invitation.id, 'email', v_employee.email, 'status', 'invited', 'expires_at', p_expires_at);
END;
$$;

ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_automation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.employee_invitations, public.owner_automation_runs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_owner_employee_invitation(uuid, text, text, text, text, text, timestamptz), public.record_owner_employee_invitation_delivery(uuid, uuid, text), public.activate_pending_employee_invitation(uuid), public.prepare_owner_employee_invitation_resend(uuid, uuid, text, timestamptz), public.create_owner_automation_run(uuid, text, text), public.claim_owner_automation_run(uuid, uuid), public.complete_owner_automation_run(uuid, uuid, jsonb), public.fail_owner_automation_run(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.employee_invitations, public.owner_automation_runs TO service_role;
GRANT EXECUTE ON FUNCTION public.create_owner_employee_invitation(uuid, text, text, text, text, text, timestamptz), public.record_owner_employee_invitation_delivery(uuid, uuid, text), public.activate_pending_employee_invitation(uuid), public.prepare_owner_employee_invitation_resend(uuid, uuid, text, timestamptz), public.create_owner_automation_run(uuid, text, text), public.claim_owner_automation_run(uuid, uuid), public.complete_owner_automation_run(uuid, uuid, jsonb), public.fail_owner_automation_run(uuid, uuid) TO service_role;
COMMIT;
