-- Forward-only, server-generated business identifiers for Owner Workspace employees.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE SEQUENCE public.employee_business_id_seq;
ALTER TABLE public.users ADD COLUMN employee_code text;
UPDATE public.users SET employee_code = 'JP-EMP-' || lpad(nextval('public.employee_business_id_seq')::text, 6, '0') WHERE role = 'employee' AND employee_code IS NULL;
SELECT setval('public.employee_business_id_seq', COALESCE((SELECT max(substring(employee_code FROM '^JP-EMP-([0-9]+)$')::bigint) FROM public.users WHERE employee_code IS NOT NULL), 1), EXISTS (SELECT 1 FROM public.users WHERE employee_code ~ '^JP-EMP-[0-9]+$'));
ALTER TABLE public.users ADD CONSTRAINT users_employee_code_format CHECK (employee_code IS NULL OR employee_code ~ '^JP-EMP-[0-9]{6,}$');
CREATE UNIQUE INDEX users_employee_code_unique_idx ON public.users (employee_code) WHERE employee_code IS NOT NULL;
CREATE OR REPLACE FUNCTION public.create_owner_employee_invitation(p_owner_user_id uuid, p_email text, p_full_name text, p_department text, p_phone text, p_token_hash text, p_expires_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_employee public.users%rowtype; v_invitation public.employee_invitations%rowtype; v_email text;
BEGIN
  v_email := lower(btrim(p_email));
  IF p_full_name IS NULL OR char_length(btrim(p_full_name)) NOT BETWEEN 2 AND 150 OR p_department IS NULL OR char_length(btrim(p_department)) NOT BETWEEN 2 AND 80 OR p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_token_hash IS NULL OR char_length(p_token_hash) <> 64 OR p_expires_at <= now() THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR'; END IF;
  PERFORM 1 FROM public.users u WHERE u.id = p_owner_user_id AND u.role = 'client' AND u.status = 'active' FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = p_owner_user_id) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS'; END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE email_normalized = v_email) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'EMPLOYEE_INVITATION_NOT_AVAILABLE'; END IF;
  INSERT INTO public.users (email, email_normalized, full_name, department, phone, employee_code, status, role, failed_login_attempts, portal_owner_user_id) VALUES (v_email, v_email, btrim(p_full_name), btrim(p_department), p_phone, 'JP-EMP-' || lpad(nextval('public.employee_business_id_seq')::text, 6, '0'), 'pending_verification', 'employee', 0, p_owner_user_id) RETURNING * INTO v_employee;
  INSERT INTO public.employee_invitations (owner_user_id, employee_user_id, token_hash, expires_at) VALUES (p_owner_user_id, v_employee.id, p_token_hash, p_expires_at) RETURNING * INTO v_invitation;
  INSERT INTO public.password_resets (user_id, token_hash, expires_at) VALUES (v_employee.id, p_token_hash, p_expires_at);
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details) VALUES (p_owner_user_id, 'owner_employee_invitation', 'create', 'user', v_employee.id, true, jsonb_build_object('invitation_id', v_invitation.id, 'status', 'pending'));
  RETURN jsonb_build_object('id', v_employee.id, 'employee_code', v_employee.employee_code, 'invitation_id', v_invitation.id, 'email', v_employee.email, 'status', 'invited', 'expires_at', v_invitation.expires_at);
END;
$$;
CREATE OR REPLACE FUNCTION public.prepare_owner_employee_invitation_resend(p_owner_user_id uuid, p_employee_user_id uuid, p_token_hash text, p_expires_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_employee public.users%rowtype; v_invitation public.employee_invitations%rowtype; v_was_expired boolean;
BEGIN
  IF p_token_hash IS NULL OR char_length(p_token_hash) <> 64 OR p_expires_at <= now() THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR'; END IF;
  PERFORM 1 FROM public.users u WHERE u.id = p_owner_user_id AND u.role = 'client' AND u.status = 'active' FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = p_owner_user_id) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'INSUFFICIENT_PERMISSIONS'; END IF;
  SELECT * INTO v_employee FROM public.users WHERE id = p_employee_user_id AND portal_owner_user_id = p_owner_user_id AND role = 'employee' AND status = 'pending_verification' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'EMPLOYEE_INVITATION_NOT_FOUND'; END IF;
  SELECT * INTO v_invitation FROM public.employee_invitations WHERE owner_user_id = p_owner_user_id AND employee_user_id = p_employee_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'EMPLOYEE_INVITATION_NOT_FOUND'; END IF;
  IF v_invitation.status <> 'pending' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'EMPLOYEE_INVITATION_NOT_AVAILABLE'; END IF;
  v_was_expired := v_invitation.expires_at <= now();
  UPDATE public.password_resets SET used_at = now() WHERE user_id = p_employee_user_id AND token_hash = v_invitation.token_hash AND used_at IS NULL;
  UPDATE public.employee_invitations SET token_hash = p_token_hash, expires_at = p_expires_at, delivery_status = 'pending', delivered_at = NULL, updated_at = now() WHERE id = v_invitation.id;
  INSERT INTO public.password_resets (user_id, token_hash, expires_at) VALUES (p_employee_user_id, p_token_hash, p_expires_at);
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details) VALUES (p_owner_user_id, 'owner_employee_invitation', 'resend', 'employee_invitation', v_invitation.id, true, jsonb_build_object('was_expired', v_was_expired));
  RETURN jsonb_build_object('id', v_employee.id, 'employee_code', v_employee.employee_code, 'invitation_id', v_invitation.id, 'email', v_employee.email, 'status', 'invited', 'expires_at', p_expires_at);
END;
$$;
REVOKE ALL ON SEQUENCE public.employee_business_id_seq FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
