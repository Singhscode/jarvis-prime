-- Client account provisioning: atomic owner-initiated onboarding without credential disclosure.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE FUNCTION public.provision_client_account(
  p_owner_user_id uuid,
  p_client_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner public.users%ROWTYPE;
  v_client public.crm_clients%ROWTYPE;
  v_contact public.contacts%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_existing_user public.users%ROWTYPE;
  v_membership public.client_portal_memberships%ROWTYPE;
  v_email text := lower(btrim(p_email));
  v_client_name text := btrim(p_client_name);
  v_contact_name text := btrim(p_contact_name);
  v_phone text := nullif(btrim(p_phone), '');
BEGIN
  IF char_length(v_client_name) NOT BETWEEN 2 AND 150
    OR char_length(v_contact_name) NOT BETWEEN 2 AND 150
    OR char_length(v_email) NOT BETWEEN 3 AND 254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR (v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{7,14}$')
    OR p_token_hash IS NULL OR btrim(p_token_hash) !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL OR p_expires_at <= now() OR p_expires_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'CLIENT_ACCOUNT_VALIDATION_ERROR';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 0));

  SELECT * INTO v_owner
  FROM public.users owner_user
  WHERE owner_user.id = p_owner_user_id
    AND owner_user.role = 'client'
    AND owner_user.status = 'active'
  FOR KEY SHARE;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.client_portal_memberships membership
    WHERE membership.user_id = p_owner_user_id
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OWNER_ACCESS_DENIED';
  END IF;

  SELECT * INTO v_existing_user
  FROM public.users existing_user
  WHERE existing_user.email_normalized = v_email
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing_user.role = 'client' AND v_existing_user.status = 'active' THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'CLIENT_ACCOUNT_ALREADY_EXISTS';
    END IF;

    IF v_existing_user.role = 'client'
      AND v_existing_user.status = 'pending_verification'
      AND v_existing_user.password_hash IS NULL THEN
      SELECT membership.* INTO v_membership
      FROM public.client_portal_memberships membership
      JOIN public.contacts contact ON contact.id = membership.contact_id
      JOIN public.crm_clients existing_client ON existing_client.id = membership.crm_client_id
      WHERE membership.user_id = v_existing_user.id
        AND membership.email_normalized = v_email
        AND membership.status = 'pending'
        AND contact.owner_user_id = p_owner_user_id
        AND contact.client_id = membership.crm_client_id
        AND lower(btrim(contact.email)) = v_email
        AND existing_client.owner_user_id = p_owner_user_id
      FOR UPDATE OF membership;

      IF FOUND THEN
        SELECT * INTO v_contact FROM public.contacts WHERE id = v_membership.contact_id FOR KEY SHARE;
        SELECT * INTO v_client FROM public.crm_clients WHERE id = v_membership.crm_client_id FOR KEY SHARE;
        UPDATE public.client_portal_invitations
        SET revoked_at = now()
        WHERE membership_id = v_membership.id AND consumed_at IS NULL AND revoked_at IS NULL;
        INSERT INTO public.client_portal_invitations (membership_id, token_hash, created_by_user_id, expires_at)
        VALUES (v_membership.id, btrim(p_token_hash), p_owner_user_id, p_expires_at);
        INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
        VALUES (p_owner_user_id, 'client_account_provisioning', 'resend', 'client_portal_membership',
          v_membership.id, true, jsonb_build_object('client_id', v_client.id, 'contact_id', v_contact.id));
        RETURN jsonb_build_object(
          'client_id', v_client.id,
          'client_code', v_client.client_code,
          'client_name', v_client.name,
          'membership_id', v_membership.id,
          'expires_at', p_expires_at
        );
      END IF;
    END IF;

    RAISE EXCEPTION USING errcode = 'P0001', message = 'CLIENT_ACCOUNT_EMAIL_UNAVAILABLE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contacts existing_contact
    WHERE existing_contact.owner_user_id = p_owner_user_id
      AND lower(btrim(existing_contact.email)) = v_email
  ) OR EXISTS (
    SELECT 1 FROM public.crm_clients existing_client
    WHERE existing_client.owner_user_id = p_owner_user_id
      AND lower(btrim(existing_client.email)) = v_email
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'CLIENT_ACCOUNT_EMAIL_UNAVAILABLE';
  END IF;

  INSERT INTO public.crm_clients (owner_user_id, name, email, phone)
  VALUES (p_owner_user_id, v_client_name, v_email, v_phone)
  RETURNING * INTO v_client;

  INSERT INTO public.contacts (owner_user_id, client_id, name, email, phone)
  VALUES (p_owner_user_id, v_client.id, v_contact_name, v_email, v_phone)
  RETURNING * INTO v_contact;

  INSERT INTO public.users (
    email, email_normalized, full_name, password_hash, status, role, email_verified_at
  ) VALUES (
    v_email, v_email, v_contact_name, NULL, 'pending_verification', 'client', NULL
  ) RETURNING * INTO v_user;

  INSERT INTO public.client_portal_memberships (
    crm_client_id, contact_id, user_id, email_normalized, status, created_by_user_id
  ) VALUES (
    v_client.id, v_contact.id, v_user.id, v_email, 'pending', p_owner_user_id
  ) RETURNING * INTO v_membership;

  INSERT INTO public.client_portal_invitations (
    membership_id, token_hash, created_by_user_id, expires_at
  ) VALUES (
    v_membership.id, btrim(p_token_hash), p_owner_user_id, p_expires_at
  );

  INSERT INTO public.audit_logs (
    user_id, event_type, action, resource_type, resource_id, success, details
  ) VALUES (
    p_owner_user_id, 'client_account_provisioning', 'create', 'client_portal_membership',
    v_membership.id, true, jsonb_build_object('client_id', v_client.id, 'contact_id', v_contact.id)
  );

  RETURN jsonb_build_object(
    'client_id', v_client.id,
    'client_code', v_client.client_code,
    'client_name', v_client.name,
    'membership_id', v_membership.id,
    'expires_at', p_expires_at
  );
END;
$$;

CREATE FUNCTION public.activate_provisioned_client_account(
  p_token_hash text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation public.client_portal_invitations%ROWTYPE;
  v_membership public.client_portal_memberships%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_contact public.contacts%ROWTYPE;
BEGIN
  IF p_token_hash IS NULL OR btrim(p_token_hash) !~ '^[0-9a-f]{64}$'
    OR p_password_hash IS NULL OR char_length(btrim(p_password_hash)) NOT BETWEEN 20 AND 512 THEN
    RETURN jsonb_build_object('activated', false);
  END IF;

  SELECT * INTO v_invitation
  FROM public.client_portal_invitations invitation
  WHERE invitation.token_hash = btrim(p_token_hash)
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.audit_logs (event_type, action, resource_type, success, details)
    VALUES ('client_account_activation', 'activate', 'client_portal_membership', false, jsonb_build_object('outcome', 'failure'));
    RETURN jsonb_build_object('activated', false);
  END IF;

  SELECT * INTO v_membership
  FROM public.client_portal_memberships membership
  WHERE membership.id = v_invitation.membership_id
  FOR UPDATE;
  SELECT * INTO v_user
  FROM public.users account_user
  WHERE account_user.id = v_membership.user_id
  FOR UPDATE;
  SELECT * INTO v_contact
  FROM public.contacts contact
  WHERE contact.id = v_membership.contact_id
    AND contact.client_id = v_membership.crm_client_id
  FOR KEY SHARE;

  IF v_invitation.consumed_at IS NOT NULL
    OR v_invitation.revoked_at IS NOT NULL
    OR v_invitation.expires_at <= now()
    OR v_membership.status <> 'pending'
    OR v_user.role <> 'client'
    OR v_user.status <> 'pending_verification'
    OR v_user.password_hash IS NOT NULL
    OR v_membership.email_normalized <> v_user.email_normalized
    OR v_contact.id IS NULL THEN
    INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
    VALUES (v_user.id, 'client_account_activation', 'activate', 'client_portal_membership', v_membership.id,
      false, jsonb_build_object('outcome', 'failure'));
    RETURN jsonb_build_object('activated', false);
  END IF;

  UPDATE public.users
  SET password_hash = btrim(p_password_hash), status = 'active', email_verified_at = now(), updated_at = now()
  WHERE id = v_user.id;

  UPDATE public.client_portal_memberships
  SET status = 'active', activated_at = now(), updated_at = now()
  WHERE id = v_membership.id;

  UPDATE public.client_portal_invitations
  SET consumed_at = now()
  WHERE id = v_invitation.id;

  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (v_user.id, 'client_account_activation', 'activate', 'client_portal_membership', v_membership.id,
    true, jsonb_build_object('client_id', v_membership.crm_client_id));

  RETURN jsonb_build_object('activated', true);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_client_account(uuid, text, text, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.activate_provisioned_client_account(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provision_client_account(uuid, text, text, text, text, text, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_provisioned_client_account(text, text)
  TO service_role;
COMMIT;
