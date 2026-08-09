-- One-time registration email verification for pending client accounts.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_token_hash_unique_idx
  ON public.email_verification_tokens (token_hash);

CREATE OR REPLACE FUNCTION public.issue_registration_email_verification(
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_authorized_email text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_authorized_email text := lower(btrim(COALESCE(p_authorized_email, '')));
BEGIN
  IF p_user_id IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
     OR p_expires_at IS NULL OR p_expires_at <= now() OR v_authorized_email = '' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VERIFICATION_NOT_AVAILABLE';
  END IF;

  PERFORM 1 FROM public.users u
    WHERE u.id = p_user_id AND u.email_normalized = v_authorized_email
      AND u.role = 'client' AND u.status = 'pending_verification'
      AND u.email_verified_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VERIFICATION_NOT_AVAILABLE';
  END IF;

  DELETE FROM public.email_verification_tokens
    WHERE user_id = p_user_id AND verified_at IS NULL;
  INSERT INTO public.email_verification_tokens
    (user_id, token_hash, created_at, expires_at, attempts)
    VALUES (p_user_id, p_token_hash, now(), p_expires_at, 0);
  INSERT INTO public.audit_logs
    (user_id, event_type, action, resource_type, resource_id, success, details)
    VALUES (p_user_id, 'email.verification_issued', 'create', 'user', p_user_id, true,
      jsonb_build_object('expires_at', p_expires_at));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_registration_email_verification(
  p_token_hash text,
  p_verification_ip text,
  p_authorized_email text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_token_id uuid;
  v_user_id uuid;
  v_verification_ip text := NULLIF(left(COALESCE(p_verification_ip, ''), 64), '');
  v_authorized_email text := lower(btrim(COALESCE(p_authorized_email, '')));
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
     OR v_authorized_email = '' THEN
    RETURN false;
  END IF;

  SELECT t.id, t.user_id INTO v_token_id, v_user_id
    FROM public.email_verification_tokens t
    JOIN public.users u ON u.id = t.user_id
    WHERE t.token_hash = p_token_hash
      AND t.verified_at IS NULL
      AND t.expires_at > now()
      AND u.email_normalized = v_authorized_email
      AND u.role = 'client'
      AND u.status = 'pending_verification'
      AND u.email_verified_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.client_portal_memberships m WHERE m.user_id = u.id
      )
    FOR UPDATE OF t, u;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.email_verification_tokens
    SET verified_at = now(), verification_ip = v_verification_ip
    WHERE id = v_token_id AND verified_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.users
    SET status = 'active', email_verified_at = now(), updated_at = now()
    WHERE id = v_user_id AND role = 'client'
      AND status = 'pending_verification' AND email_verified_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  DELETE FROM public.email_verification_tokens
    WHERE user_id = v_user_id AND id <> v_token_id AND verified_at IS NULL;
  INSERT INTO public.audit_logs
    (user_id, event_type, action, resource_type, resource_id, success, ip_address, details)
    VALUES (v_user_id, 'email.verified', 'update', 'user', v_user_id, true,
      v_verification_ip, jsonb_build_object('method', 'registration_email_verification'));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_registration_email_verification(uuid, text, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_registration_email_verification(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_registration_email_verification(uuid, text, timestamptz, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_registration_email_verification(text, text, text)
  TO service_role;
COMMIT;
