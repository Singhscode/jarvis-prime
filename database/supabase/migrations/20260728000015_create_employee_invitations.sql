-- Server-only, invitation-based Employee onboarding.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE public.employee_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  email_normalized text NOT NULL CHECK (
    char_length(email_normalized) BETWEEN 3 AND 320
    AND email_normalized = lower(btrim(email_normalized))
  ),
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 120),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (consumed_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX employee_invitations_usable_owner_email_idx
  ON public.employee_invitations (owner_user_id, email_normalized)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_invitations FORCE ROW LEVEL SECURITY;

CREATE FUNCTION public.issue_employee_invitation(
  p_owner_user_id uuid,
  p_email_normalized text,
  p_full_name text,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation_row public.employee_invitations%rowtype;
BEGIN
  IF p_owner_user_id IS NULL
    OR p_email_normalized IS NULL
    OR char_length(p_email_normalized) NOT BETWEEN 3 AND 320
    OR p_email_normalized <> lower(btrim(p_email_normalized))
    OR p_full_name IS NULL
    OR char_length(btrim(p_full_name)) NOT BETWEEN 1 AND 120
    OR p_token_hash IS NULL
    OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= now()
    OR p_expires_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'VALIDATION_ERROR';
  END IF;

  PERFORM 1
  FROM public.users owner_user
  JOIN public.owner_workspace_entitlements entitlement
    ON entitlement.user_id = owner_user.id
   AND entitlement.revoked_at IS NULL
  WHERE owner_user.id = p_owner_user_id
    AND owner_user.role = 'client'
    AND owner_user.status = 'active'
  FOR UPDATE OF owner_user, entitlement;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EMPLOYEE_INVITATION_UNAVAILABLE';
  END IF;

  PERFORM 1
  FROM public.users target_user
  WHERE target_user.email_normalized = p_email_normalized
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EMPLOYEE_INVITATION_UNAVAILABLE';
  END IF;

  UPDATE public.employee_invitations
  SET revoked_at = now()
  WHERE owner_user_id = p_owner_user_id
    AND email_normalized = p_email_normalized
    AND consumed_at IS NULL
    AND revoked_at IS NULL;

  INSERT INTO public.employee_invitations (
    owner_user_id, email_normalized, full_name, token_hash, expires_at
  ) VALUES (
    p_owner_user_id, p_email_normalized, btrim(p_full_name), p_token_hash, p_expires_at
  )
  RETURNING * INTO invitation_row;

  INSERT INTO public.audit_logs (
    user_id, event_type, action, resource_type, resource_id, success, details
  ) VALUES (
    p_owner_user_id, 'employee.invitation_issued', 'create',
    'employee_invitation', invitation_row.id, true,
    jsonb_build_object('version', 1)
  );

  RETURN jsonb_build_object(
    'id', invitation_row.id,
    'status', 'pending',
    'expires_at', invitation_row.expires_at
  );
END;
$$;

CREATE FUNCTION public.activate_employee_invitation(
  p_token_hash text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  invitation_row public.employee_invitations%rowtype;
  invitation_owner_id uuid;
  employee_id uuid;
BEGIN
  IF p_token_hash IS NULL
    OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_password_hash IS NULL
    OR char_length(p_password_hash) NOT BETWEEN 20 AND 1024 THEN
    RETURN jsonb_build_object('activated', false);
  END IF;

  SELECT invitation.owner_user_id INTO invitation_owner_id
  FROM public.employee_invitations invitation
  WHERE invitation.token_hash = p_token_hash;

  IF NOT FOUND THEN
    INSERT INTO public.audit_logs (
      event_type, action, resource_type, success, details
    ) VALUES (
      'employee.invitation_activated', 'activate',
      'employee_invitation', false, jsonb_build_object('outcome', 'failure')
    );
    RETURN jsonb_build_object('activated', false);
  END IF;

  PERFORM 1
  FROM public.users owner_user
  JOIN public.owner_workspace_entitlements entitlement
    ON entitlement.user_id = owner_user.id
   AND entitlement.revoked_at IS NULL
  WHERE owner_user.id = invitation_owner_id
    AND owner_user.role = 'client'
    AND owner_user.status = 'active'
  FOR UPDATE OF owner_user, entitlement;
  IF NOT FOUND THEN
    INSERT INTO public.audit_logs (
      user_id, event_type, action, resource_type, success, details
    ) VALUES (
      invitation_owner_id, 'employee.invitation_activated', 'activate',
      'employee_invitation', NULL, false,
      jsonb_build_object('outcome', 'failure')
    );
    RETURN jsonb_build_object('activated', false);
  END IF;

  SELECT invitation.* INTO invitation_row
  FROM public.employee_invitations invitation
  WHERE invitation.token_hash = p_token_hash
    AND invitation.owner_user_id = invitation_owner_id
  FOR UPDATE;

  IF NOT FOUND
    OR invitation_row.consumed_at IS NOT NULL
    OR invitation_row.revoked_at IS NOT NULL
    OR invitation_row.expires_at <= now() THEN
    INSERT INTO public.audit_logs (
      user_id, event_type, action, resource_type, resource_id, success, details
    ) VALUES (
      invitation_owner_id, 'employee.invitation_activated', 'activate',
      'employee_invitation', invitation_row.id, false,
      jsonb_build_object('outcome', 'failure')
    );
    RETURN jsonb_build_object('activated', false);
  END IF;

  PERFORM 1
  FROM public.users target_user
  WHERE target_user.email_normalized = invitation_row.email_normalized
  FOR UPDATE;
  IF FOUND THEN
    INSERT INTO public.audit_logs (
      user_id, event_type, action, resource_type, resource_id, success, details
    ) VALUES (
      invitation_row.owner_user_id, 'employee.invitation_activated', 'activate',
      'employee_invitation', invitation_row.id, false,
      jsonb_build_object('outcome', 'failure')
    );
    RETURN jsonb_build_object('activated', false);
  END IF;

  INSERT INTO public.users (
    email, email_normalized, full_name, password_hash, status, role,
    email_verified_at, failed_login_attempts, last_failed_login_at,
    account_locked_until, portal_owner_user_id, created_at, updated_at
  ) VALUES (
    invitation_row.email_normalized, invitation_row.email_normalized,
    invitation_row.full_name, p_password_hash, 'active', 'employee',
    now(), 0, NULL, NULL, invitation_row.owner_user_id, now(), now()
  )
  RETURNING id INTO employee_id;

  UPDATE public.employee_invitations
  SET consumed_at = now()
  WHERE id = invitation_row.id;

  INSERT INTO public.audit_logs (
    user_id, event_type, action, resource_type, resource_id, success, details
  ) VALUES (
    invitation_row.owner_user_id, 'employee.invitation_activated', 'activate',
    'user', employee_id, true,
    jsonb_build_object('version', 1)
  );

  RETURN jsonb_build_object(
    'activated', true,
    'employee_id', employee_id,
    'status', 'active'
  );
END;
$$;
CREATE FUNCTION public.revoke_employee_invitation(
  p_owner_user_id uuid,
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  revoked_id uuid;
BEGIN
  PERFORM 1
  FROM public.users owner_user
  JOIN public.owner_workspace_entitlements entitlement
    ON entitlement.user_id = owner_user.id
   AND entitlement.revoked_at IS NULL
  WHERE owner_user.id = p_owner_user_id
    AND owner_user.role = 'client'
    AND owner_user.status = 'active'
  FOR UPDATE OF owner_user, entitlement;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('revoked', false);
  END IF;

  UPDATE public.employee_invitations
  SET revoked_at = now()
  WHERE id = p_invitation_id
    AND owner_user_id = p_owner_user_id
    AND consumed_at IS NULL
    AND revoked_at IS NULL
  RETURNING id INTO revoked_id;

  IF revoked_id IS NULL THEN
    RETURN jsonb_build_object('revoked', false);
  END IF;

  INSERT INTO public.audit_logs (
    user_id, event_type, action, resource_type, resource_id, success, details
  ) VALUES (
    p_owner_user_id, 'employee.invitation_delivery_failed', 'revoke',
    'employee_invitation', revoked_id, true,
    jsonb_build_object('version', 1)
  );

  RETURN jsonb_build_object('revoked', true);
END;
$$;

REVOKE ALL ON TABLE public.employee_invitations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.issue_employee_invitation(uuid, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_employee_invitation(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_employee_invitation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.issue_employee_invitation(uuid, text, text, text, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_employee_invitation(text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_employee_invitation(uuid, uuid)
  TO service_role;

COMMIT;