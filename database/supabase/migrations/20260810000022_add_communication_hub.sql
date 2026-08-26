-- Phase 10 Communication Hub: additive, server-only participant-scoped communication records.
-- This migration deliberately does not alter legacy outreach, public webhooks, Finance, or portal data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE public.communication_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 200),
  create_idempotency_key text NOT NULL CHECK (create_idempotency_key ~ '^[A-Za-z0-9._:-]{16,128}$'),
  create_request_sha256 text NOT NULL CHECK (create_request_sha256 ~ '^[0-9a-f]{64}$'),
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, created_by_user_id, create_idempotency_key)
);

CREATE TABLE public.communication_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  thread_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  participant_kind text NOT NULL CHECK (participant_kind IN ('owner', 'employee', 'client')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_read_sequence bigint NOT NULL DEFAULT 0 CHECK (last_read_sequence >= 0),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (owner_user_id, thread_id, user_id),
  UNIQUE (owner_user_id, thread_id, id),
  FOREIGN KEY (owner_user_id, thread_id)
    REFERENCES public.communication_threads(owner_user_id, id) ON DELETE RESTRICT,
  CHECK (
    (status = 'active' AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE TABLE public.communication_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  thread_id uuid NOT NULL,
  sender_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  sequence bigint NOT NULL CHECK (sequence > 0),
  body text NOT NULL CHECK (
    char_length(btrim(body)) BETWEEN 1 AND 10000
    AND body !~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
  ),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,136}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, thread_id, sequence),
  UNIQUE (owner_user_id, thread_id, sender_user_id, idempotency_key),
  UNIQUE (owner_user_id, thread_id, id),
  FOREIGN KEY (owner_user_id, thread_id)
    REFERENCES public.communication_threads(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, thread_id, sender_user_id)
    REFERENCES public.communication_participants(owner_user_id, thread_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.communication_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  thread_id uuid NOT NULL,
  message_id uuid NOT NULL,
  storage_bucket text NOT NULL CHECK (storage_bucket = 'communication-private'),
  storage_path text NOT NULL CHECK (char_length(btrim(storage_path)) BETWEEN 1 AND 1024),
  display_filename text NOT NULL CHECK (char_length(btrim(display_filename)) BETWEEN 1 AND 240),
  media_type text NOT NULL CHECK (media_type IN ('application/pdf', 'image/png', 'image/jpeg', 'text/plain')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path),
  FOREIGN KEY (owner_user_id, thread_id, message_id)
    REFERENCES public.communication_messages(owner_user_id, thread_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.communication_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  thread_id uuid NOT NULL,
  message_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'new_message' CHECK (kind = 'new_message'),
  state text NOT NULL DEFAULT 'unread' CHECK (state IN ('unread', 'read', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  UNIQUE (owner_user_id, recipient_user_id, message_id, kind),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, thread_id)
    REFERENCES public.communication_threads(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, thread_id, message_id)
    REFERENCES public.communication_messages(owner_user_id, thread_id, id) ON DELETE RESTRICT,
  CHECK (
    (state = 'unread' AND read_at IS NULL AND dismissed_at IS NULL)
    OR (state = 'read' AND read_at IS NOT NULL AND dismissed_at IS NULL)
    OR (state = 'dismissed' AND dismissed_at IS NOT NULL)
  )
);

CREATE TABLE public.communication_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, user_id),
  UNIQUE (owner_user_id, id)
);

CREATE TABLE public.communication_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  notification_id uuid REFERENCES public.communication_notifications(id) ON DELETE RESTRICT,
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel = 'email'),
  provider text NOT NULL CHECK (provider = 'resend'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'accepted', 'delivered', 'failed_retryable', 'failed_permanent', 'outcome_unknown'
  )),
  terminal_reason text CHECK (terminal_reason IN ('known_permanent_failure', 'attempts_exhausted', 'bounced', 'complained')),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,200}$'),
  provider_message_id text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts = 3),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code IN (
    'provider_rejected', 'provider_unavailable', 'provider_timeout', 'provider_unknown', 'attempts_exhausted'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  UNIQUE (owner_user_id, idempotency_key),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, notification_id)
    REFERENCES public.communication_notifications(owner_user_id, id) ON DELETE RESTRICT,
  CHECK (
    (status <> 'failed_permanent' OR terminal_reason IS NOT NULL)
    AND (status <> 'processing' OR lease_until IS NOT NULL)
    AND (status <> 'accepted' OR accepted_at IS NOT NULL)
    AND (status <> 'delivered' OR delivered_at IS NOT NULL)
  )
);

CREATE TABLE public.communication_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  delivery_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = 'resend'),
  provider_event_id text NOT NULL CHECK (char_length(btrim(provider_event_id)) BETWEEN 1 AND 240),
  event_type text NOT NULL CHECK (event_type IN ('accepted', 'delivered', 'failed', 'bounced', 'complained')),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(safe_metadata) = 'object' AND octet_length(safe_metadata::text) <= 2048
  ),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id),
  FOREIGN KEY (owner_user_id, delivery_id)
    REFERENCES public.communication_deliveries(owner_user_id, id) ON DELETE RESTRICT
);

CREATE INDEX communication_threads_owner_last_message_idx
  ON public.communication_threads (owner_user_id, last_message_at DESC, id DESC);
CREATE INDEX communication_participants_inbox_idx
  ON public.communication_participants (owner_user_id, user_id, status, thread_id);
CREATE INDEX communication_messages_thread_sequence_idx
  ON public.communication_messages (owner_user_id, thread_id, sequence DESC, id DESC);
CREATE INDEX communication_attachments_message_idx
  ON public.communication_attachments (owner_user_id, thread_id, message_id);
CREATE INDEX communication_notifications_recipient_idx
  ON public.communication_notifications (owner_user_id, recipient_user_id, state, created_at DESC, id DESC);
CREATE INDEX communication_deliveries_due_idx
  ON public.communication_deliveries (status, next_attempt_at, lease_until);
CREATE UNIQUE INDEX communication_deliveries_provider_message_idx
  ON public.communication_deliveries (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX communication_delivery_events_delivery_idx
  ON public.communication_delivery_events (owner_user_id, delivery_id, occurred_at, id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('communication-private', 'communication-private', false)
ON CONFLICT (id) DO UPDATE SET public = false;

ALTER TABLE public.communication_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.communication_reject_content_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_CONTENT_IMMUTABLE';
END;
$$;

CREATE TRIGGER communication_messages_immutable
  BEFORE UPDATE OR DELETE ON public.communication_messages
  FOR EACH ROW EXECUTE FUNCTION public.communication_reject_content_mutation();
CREATE TRIGGER communication_attachments_immutable
  BEFORE UPDATE OR DELETE ON public.communication_attachments
  FOR EACH ROW EXECUTE FUNCTION public.communication_reject_content_mutation();
CREATE TRIGGER communication_delivery_events_immutable
  BEFORE UPDATE OR DELETE ON public.communication_delivery_events
  FOR EACH ROW EXECUTE FUNCTION public.communication_reject_content_mutation();

CREATE FUNCTION public.communication_identity_is_eligible(
  p_user_id uuid,
  p_owner_user_id uuid,
  p_participant_kind text
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_membership_count integer;
BEGIN
  IF p_user_id IS NULL OR p_owner_user_id IS NULL OR p_participant_kind NOT IN ('owner', 'employee', 'client') THEN
    RETURN false;
  END IF;

  IF p_participant_kind = 'owner' THEN
    RETURN p_user_id = p_owner_user_id AND EXISTS (
      SELECT 1 FROM public.users owner_user
      WHERE owner_user.id = p_owner_user_id
        AND owner_user.role = 'client'
        AND owner_user.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.client_portal_memberships membership
          WHERE membership.user_id = owner_user.id
        )
    );
  END IF;

  IF p_participant_kind = 'employee' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.users employee_user
      WHERE employee_user.id = p_user_id
        AND employee_user.role = 'employee'
        AND employee_user.status = 'active'
        AND employee_user.portal_owner_user_id = p_owner_user_id
    );
  END IF;

  SELECT count(*) INTO v_membership_count
  FROM public.client_portal_memberships membership
  JOIN public.crm_clients client ON client.id = membership.crm_client_id
  JOIN public.users client_user ON client_user.id = membership.user_id
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND client.owner_user_id = p_owner_user_id
    AND client_user.role = 'client'
    AND client_user.status = 'active';
  RETURN v_membership_count = 1;
END;
$$;

CREATE FUNCTION public.communication_assert_actor(
  p_actor_user_id uuid,
  p_owner_user_id uuid
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_kind text;
BEGIN
  IF public.communication_identity_is_eligible(p_actor_user_id, p_owner_user_id, 'owner') THEN
    RETURN 'owner';
  END IF;
  IF public.communication_identity_is_eligible(p_actor_user_id, p_owner_user_id, 'employee') THEN
    RETURN 'employee';
  END IF;
  IF public.communication_identity_is_eligible(p_actor_user_id, p_owner_user_id, 'client') THEN
    RETURN 'client';
  END IF;
  RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_ACCESS_DENIED';
END;
$$;

CREATE FUNCTION public.communication_sync_thread_participants(
  p_owner_user_id uuid,
  p_thread_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.communication_participants participant
  SET status = 'revoked', revoked_at = now()
  WHERE participant.owner_user_id = p_owner_user_id
    AND participant.thread_id = p_thread_id
    AND participant.status = 'active'
    AND NOT public.communication_identity_is_eligible(
      participant.user_id, participant.owner_user_id, participant.participant_kind
    );
END;
$$;

CREATE FUNCTION public.communication_sync_actor_participants(
  p_actor_user_id uuid,
  p_owner_user_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.communication_participants participant
  SET status = 'revoked', revoked_at = now()
  WHERE participant.owner_user_id = p_owner_user_id
    AND participant.user_id = p_actor_user_id
    AND participant.status = 'active'
    AND NOT public.communication_identity_is_eligible(
      participant.user_id, participant.owner_user_id, participant.participant_kind
    );
END;
$$;

CREATE FUNCTION public.communication_assert_active_participant(
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_thread_id uuid
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_kind text;
BEGIN
  v_kind := public.communication_assert_actor(p_actor_user_id, p_owner_user_id);
  PERFORM public.communication_sync_thread_participants(p_owner_user_id, p_thread_id);
  PERFORM 1 FROM public.communication_participants participant
  WHERE participant.owner_user_id = p_owner_user_id
    AND participant.thread_id = p_thread_id
    AND participant.user_id = p_actor_user_id
    AND participant.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_THREAD_NOT_FOUND';
  END IF;
  RETURN v_kind;
END;
$$;

CREATE FUNCTION public.communication_write_audit(
  p_actor_user_id uuid,
  p_event_type text,
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_details jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_actor_user_id, p_event_type, p_action, p_resource_type, p_resource_id, true, p_details);
END;
$$;

CREATE FUNCTION public.communication_create_thread(
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_subject text,
  p_participants jsonb,
  p_initial_body text,
  p_idempotency_key text,
  p_request_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_thread public.communication_threads%ROWTYPE;
  v_initial_message public.communication_messages%ROWTYPE;
  v_participant jsonb;
  v_participant_kind text;
  v_user_id uuid;
  v_membership_id uuid;
  v_user_ids uuid[] := '{}'::uuid[];
  v_participant_count integer := 0;
BEGIN
  IF public.communication_assert_actor(p_actor_user_id, p_owner_user_id) <> 'owner' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_OWNER_REQUIRED';
  END IF;
  IF p_subject IS NULL OR char_length(btrim(p_subject)) NOT BETWEEN 1 AND 200
    OR p_initial_body IS NULL OR char_length(btrim(p_initial_body)) NOT BETWEEN 1 AND 10000
    OR p_initial_body ~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
    OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
    OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_participants) <> 'array' OR jsonb_array_length(p_participants) < 2 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;

  SELECT * INTO v_thread FROM public.communication_threads thread
  WHERE thread.owner_user_id = p_owner_user_id
    AND thread.created_by_user_id = p_actor_user_id
    AND thread.create_idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_thread.create_request_sha256 <> p_request_sha256 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_IDEMPOTENCY_CONFLICT';
    END IF;
    SELECT * INTO v_initial_message FROM public.communication_messages message
    WHERE message.owner_user_id = p_owner_user_id AND message.thread_id = v_thread.id AND message.sequence = 1;
    RETURN jsonb_build_object('thread_id', v_thread.id, 'message_id', v_initial_message.id, 'created', false);
  END IF;

  FOR v_participant IN SELECT value FROM jsonb_array_elements(p_participants)
  LOOP
    v_participant_kind := v_participant->>'kind';
    v_user_id := NULL;
    IF v_participant_kind = 'owner' THEN
      IF v_participant->>'user_id' !~ '^[0-9a-fA-F-]{36}$' THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
      END IF;
      v_user_id := (v_participant->>'user_id')::uuid;
      IF v_user_id <> p_actor_user_id OR NOT public.communication_identity_is_eligible(v_user_id, p_owner_user_id, 'owner') THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_PARTICIPANT_NOT_FOUND';
      END IF;
    ELSIF v_participant_kind = 'employee' THEN
      IF v_participant->>'user_id' !~ '^[0-9a-fA-F-]{36}$' THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
      END IF;
      v_user_id := (v_participant->>'user_id')::uuid;
      IF NOT public.communication_identity_is_eligible(v_user_id, p_owner_user_id, 'employee') THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_PARTICIPANT_NOT_FOUND';
      END IF;
    ELSIF v_participant_kind = 'client' THEN
      IF v_participant->>'membership_id' !~ '^[0-9a-fA-F-]{36}$' THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
      END IF;
      v_membership_id := (v_participant->>'membership_id')::uuid;
      SELECT membership.user_id INTO v_user_id
      FROM public.client_portal_memberships membership
      JOIN public.crm_clients client ON client.id = membership.crm_client_id
      WHERE membership.id = v_membership_id
        AND membership.status = 'active'
        AND client.owner_user_id = p_owner_user_id
      FOR UPDATE OF membership;
      IF NOT FOUND OR NOT public.communication_identity_is_eligible(v_user_id, p_owner_user_id, 'client') THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_PARTICIPANT_NOT_FOUND';
      END IF;
    ELSE
      RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
    END IF;

    IF v_user_ids @> ARRAY[v_user_id] THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_PARTICIPANT_DUPLICATE';
    END IF;
    v_user_ids := array_append(v_user_ids, v_user_id);
    v_participant_count := v_participant_count + 1;
  END LOOP;

  IF NOT (v_user_ids @> ARRAY[p_actor_user_id]) OR v_participant_count <> jsonb_array_length(p_participants) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_PARTICIPANT_NOT_FOUND';
  END IF;

  INSERT INTO public.communication_threads (
    owner_user_id, created_by_user_id, subject, create_idempotency_key, create_request_sha256,
    last_sequence, last_message_at
  ) VALUES (
    p_owner_user_id, p_actor_user_id, btrim(p_subject), p_idempotency_key, p_request_sha256, 1, now()
  )
  ON CONFLICT (owner_user_id, created_by_user_id, create_idempotency_key) DO NOTHING
  RETURNING * INTO v_thread;

  IF NOT FOUND THEN
    SELECT * INTO v_thread FROM public.communication_threads thread
    WHERE thread.owner_user_id = p_owner_user_id
      AND thread.created_by_user_id = p_actor_user_id
      AND thread.create_idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_CONFLICT';
    END IF;
    IF v_thread.create_request_sha256 <> p_request_sha256 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_IDEMPOTENCY_CONFLICT';
    END IF;
    SELECT * INTO v_initial_message FROM public.communication_messages message
    WHERE message.owner_user_id = p_owner_user_id AND message.thread_id = v_thread.id AND message.sequence = 1;
    RETURN jsonb_build_object('thread_id', v_thread.id, 'message_id', v_initial_message.id, 'created', false);
  END IF;

  FOR v_participant IN SELECT value FROM jsonb_array_elements(p_participants)
  LOOP
    v_participant_kind := v_participant->>'kind';
    IF v_participant_kind = 'client' THEN
      SELECT membership.user_id INTO v_user_id
      FROM public.client_portal_memberships membership
      WHERE membership.id = (v_participant->>'membership_id')::uuid;
    ELSE
      v_user_id := (v_participant->>'user_id')::uuid;
    END IF;
    INSERT INTO public.communication_participants (owner_user_id, thread_id, user_id, participant_kind)
    VALUES (p_owner_user_id, v_thread.id, v_user_id, v_participant_kind);
  END LOOP;

  INSERT INTO public.communication_messages (
    owner_user_id, thread_id, sender_user_id, sequence, body, idempotency_key, request_sha256
  ) VALUES (
    p_owner_user_id, v_thread.id, p_actor_user_id, 1, btrim(p_initial_body),
    'initial:' || p_idempotency_key, p_request_sha256
  ) RETURNING * INTO v_initial_message;

  INSERT INTO public.communication_notifications (owner_user_id, recipient_user_id, thread_id, message_id)
  SELECT p_owner_user_id, participant.user_id, v_thread.id, v_initial_message.id
  FROM public.communication_participants participant
  LEFT JOIN public.communication_preferences preference
    ON preference.owner_user_id = participant.owner_user_id AND preference.user_id = participant.user_id
  WHERE participant.owner_user_id = p_owner_user_id
    AND participant.thread_id = v_thread.id
    AND participant.user_id <> p_actor_user_id
    AND participant.status = 'active'
    AND coalesce(preference.in_app_enabled, true);

  PERFORM public.communication_write_audit(
    p_actor_user_id, 'communication.thread', 'create', 'communication_thread', v_thread.id,
    jsonb_build_object('participant_count', v_participant_count)
  );
  RETURN jsonb_build_object('thread_id', v_thread.id, 'message_id', v_initial_message.id, 'created', true);
END;
$$;

CREATE FUNCTION public.communication_send_message(
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_thread_id uuid,
  p_body text,
  p_idempotency_key text,
  p_request_sha256 text,
  p_attachment_metadata jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_thread public.communication_threads%ROWTYPE;
  v_message public.communication_messages%ROWTYPE;
  v_sequence bigint;
  v_attachment_count integer;
BEGIN
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 10000
    OR p_body ~ E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]'
    OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,128}$'
    OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_attachment_metadata) <> 'array' OR jsonb_array_length(p_attachment_metadata) > 5 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;

  PERFORM public.communication_assert_active_participant(p_actor_user_id, p_owner_user_id, p_thread_id);
  SELECT * INTO v_message FROM public.communication_messages message
  WHERE message.owner_user_id = p_owner_user_id
    AND message.thread_id = p_thread_id
    AND message.sender_user_id = p_actor_user_id
    AND message.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_message.request_sha256 <> p_request_sha256 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('thread_id', p_thread_id, 'message_id', v_message.id, 'sequence', v_message.sequence, 'created', false);
  END IF;

  SELECT * INTO v_thread FROM public.communication_threads thread
  WHERE thread.owner_user_id = p_owner_user_id AND thread.id = p_thread_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_THREAD_NOT_FOUND';
  END IF;

  SELECT count(*) INTO v_attachment_count
  FROM jsonb_to_recordset(p_attachment_metadata) AS attachment(
    storage_path text, display_filename text, media_type text, size_bytes bigint, sha256 text
  );
  IF v_attachment_count <> jsonb_array_length(p_attachment_metadata)
    OR EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_attachment_metadata) AS attachment(
        storage_path text, display_filename text, media_type text, size_bytes bigint, sha256 text
      ) WHERE attachment.storage_path IS NULL OR char_length(btrim(attachment.storage_path)) NOT BETWEEN 1 AND 1024
        OR attachment.display_filename IS NULL OR char_length(btrim(attachment.display_filename)) NOT BETWEEN 1 AND 240
        OR attachment.media_type NOT IN ('application/pdf', 'image/png', 'image/jpeg', 'text/plain')
        OR attachment.size_bytes NOT BETWEEN 1 AND 10485760
        OR attachment.sha256 !~ '^[0-9a-f]{64}$'
    ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;

  v_sequence := v_thread.last_sequence + 1;
  UPDATE public.communication_threads
  SET last_sequence = v_sequence, last_message_at = now(), updated_at = now()
  WHERE owner_user_id = p_owner_user_id AND id = p_thread_id;

  INSERT INTO public.communication_messages (
    owner_user_id, thread_id, sender_user_id, sequence, body, idempotency_key, request_sha256
  ) VALUES (
    p_owner_user_id, p_thread_id, p_actor_user_id, v_sequence, btrim(p_body), p_idempotency_key, p_request_sha256
  ) RETURNING * INTO v_message;

  INSERT INTO public.communication_attachments (
    owner_user_id, thread_id, message_id, storage_bucket, storage_path, display_filename, media_type, size_bytes, sha256
  )
  SELECT p_owner_user_id, p_thread_id, v_message.id, 'communication-private', btrim(attachment.storage_path),
    btrim(attachment.display_filename), attachment.media_type, attachment.size_bytes, attachment.sha256
  FROM jsonb_to_recordset(p_attachment_metadata) AS attachment(
    storage_path text, display_filename text, media_type text, size_bytes bigint, sha256 text
  );

  PERFORM public.communication_sync_thread_participants(p_owner_user_id, p_thread_id);
  INSERT INTO public.communication_notifications (owner_user_id, recipient_user_id, thread_id, message_id)
  SELECT p_owner_user_id, participant.user_id, p_thread_id, v_message.id
  FROM public.communication_participants participant
  LEFT JOIN public.communication_preferences preference
    ON preference.owner_user_id = participant.owner_user_id AND preference.user_id = participant.user_id
  WHERE participant.owner_user_id = p_owner_user_id
    AND participant.thread_id = p_thread_id
    AND participant.user_id <> p_actor_user_id
    AND participant.status = 'active'
    AND coalesce(preference.in_app_enabled, true);

  PERFORM public.communication_write_audit(
    p_actor_user_id, 'communication.message', 'send', 'communication_message', v_message.id,
    jsonb_build_object('sequence', v_message.sequence, 'attachment_count', v_attachment_count)
  );
  RETURN jsonb_build_object('thread_id', p_thread_id, 'message_id', v_message.id, 'sequence', v_message.sequence, 'created', true);
END;
$$;

CREATE FUNCTION public.communication_mark_read(
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_thread_id uuid,
  p_sequence bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_thread public.communication_threads%ROWTYPE;
  v_participant public.communication_participants%ROWTYPE;
BEGIN
  PERFORM public.communication_assert_active_participant(p_actor_user_id, p_owner_user_id, p_thread_id);
  SELECT * INTO v_thread FROM public.communication_threads thread
  WHERE thread.owner_user_id = p_owner_user_id AND thread.id = p_thread_id
  FOR UPDATE;
  IF NOT FOUND OR p_sequence IS NULL OR p_sequence < 1 OR p_sequence > v_thread.last_sequence THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;
  SELECT * INTO v_participant FROM public.communication_participants participant
  WHERE participant.owner_user_id = p_owner_user_id AND participant.thread_id = p_thread_id
    AND participant.user_id = p_actor_user_id AND participant.status = 'active'
  FOR UPDATE;
  UPDATE public.communication_participants
  SET last_read_sequence = greatest(last_read_sequence, p_sequence),
      last_read_at = CASE WHEN p_sequence > v_participant.last_read_sequence THEN now() ELSE last_read_at END
  WHERE id = v_participant.id
  RETURNING * INTO v_participant;
  PERFORM public.communication_write_audit(
    p_actor_user_id, 'communication.thread', 'read', 'communication_thread', p_thread_id,
    jsonb_build_object('sequence', v_participant.last_read_sequence)
  );
  RETURN jsonb_build_object('thread_id', p_thread_id, 'last_read_sequence', v_participant.last_read_sequence);
END;
$$;

CREATE FUNCTION public.communication_set_notification_state(
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_notification_id uuid,
  p_state text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_notification public.communication_notifications%ROWTYPE;
BEGIN
  PERFORM public.communication_assert_actor(p_actor_user_id, p_owner_user_id);
  IF p_state NOT IN ('read', 'dismissed') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;
  SELECT * INTO v_notification FROM public.communication_notifications notification
  WHERE notification.owner_user_id = p_owner_user_id
    AND notification.id = p_notification_id
    AND notification.recipient_user_id = p_actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_NOTIFICATION_NOT_FOUND';
  END IF;

  IF p_state = 'read' AND v_notification.state = 'unread' THEN
    UPDATE public.communication_notifications SET state = 'read', read_at = now() WHERE id = v_notification.id
    RETURNING * INTO v_notification;
  ELSIF p_state = 'dismissed' AND v_notification.state <> 'dismissed' THEN
    UPDATE public.communication_notifications
    SET state = 'dismissed', read_at = coalesce(read_at, now()), dismissed_at = now()
    WHERE id = v_notification.id
    RETURNING * INTO v_notification;
  END IF;

  PERFORM public.communication_write_audit(
    p_actor_user_id, 'communication.notification', p_state, 'communication_notification', v_notification.id, '{}'::jsonb
  );
  RETURN jsonb_build_object('id', v_notification.id, 'state', v_notification.state,
    'read_at', v_notification.read_at, 'dismissed_at', v_notification.dismissed_at);
END;
$$;

CREATE FUNCTION public.communication_upsert_preferences(
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_in_app_enabled boolean,
  p_email_enabled boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_preference public.communication_preferences%ROWTYPE;
BEGIN
  PERFORM public.communication_assert_actor(p_actor_user_id, p_owner_user_id);
  IF p_in_app_enabled IS NULL OR p_email_enabled IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;
  INSERT INTO public.communication_preferences (owner_user_id, user_id, in_app_enabled, email_enabled)
  VALUES (p_owner_user_id, p_actor_user_id, p_in_app_enabled, p_email_enabled)
  ON CONFLICT (owner_user_id, user_id) DO UPDATE
  SET in_app_enabled = EXCLUDED.in_app_enabled, email_enabled = EXCLUDED.email_enabled, updated_at = now()
  RETURNING * INTO v_preference;
  PERFORM public.communication_write_audit(
    p_actor_user_id, 'communication.preference', 'update', 'communication_preference', v_preference.id, '{}'::jsonb
  );
  RETURN jsonb_build_object('in_app_enabled', v_preference.in_app_enabled, 'email_enabled', v_preference.email_enabled);
END;
$$;

CREATE FUNCTION public.communication_claim_due_deliveries(p_limit integer DEFAULT 10)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_delivery public.communication_deliveries%ROWTYPE;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;
  FOR v_delivery IN
    SELECT * FROM public.communication_deliveries delivery
    WHERE delivery.status IN ('pending', 'failed_retryable')
      AND delivery.attempt_count < delivery.max_attempts
      AND delivery.next_attempt_at <= now()
      AND (delivery.lease_until IS NULL OR delivery.lease_until < now())
    ORDER BY delivery.next_attempt_at, delivery.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.communication_deliveries
    SET status = 'processing', attempt_count = attempt_count + 1,
      lease_until = now() + interval '5 minutes', updated_at = now()
    WHERE id = v_delivery.id
    RETURNING * INTO v_delivery;
    RETURN NEXT jsonb_build_object('id', v_delivery.id, 'owner_user_id', v_delivery.owner_user_id,
      'recipient_user_id', v_delivery.recipient_user_id, 'idempotency_key', v_delivery.idempotency_key,
      'attempt_count', v_delivery.attempt_count, 'lease_until', v_delivery.lease_until);
  END LOOP;
END;
$$;

CREATE FUNCTION public.communication_record_delivery_event(
  p_provider text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_occurred_at timestamptz,
  p_safe_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_delivery public.communication_deliveries%ROWTYPE;
  v_event public.communication_delivery_events%ROWTYPE;
  v_next_status text;
  v_terminal_reason text;
BEGIN
  IF p_provider <> 'resend' OR p_provider_event_id IS NULL OR char_length(btrim(p_provider_event_id)) NOT BETWEEN 1 AND 240
    OR p_provider_message_id IS NULL OR char_length(btrim(p_provider_message_id)) NOT BETWEEN 1 AND 240
    OR p_event_type NOT IN ('accepted', 'delivered', 'failed', 'bounced', 'complained')
    OR p_payload_sha256 IS NULL OR p_payload_sha256 !~ '^[0-9a-f]{64}$'
    OR p_occurred_at IS NULL OR jsonb_typeof(p_safe_metadata) <> 'object' OR octet_length(p_safe_metadata::text) > 2048 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'VALIDATION_ERROR';
  END IF;

  SELECT * INTO v_delivery FROM public.communication_deliveries delivery
  WHERE delivery.provider = p_provider AND delivery.provider_message_id = btrim(p_provider_message_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_DELIVERY_NOT_FOUND';
  END IF;

  INSERT INTO public.communication_delivery_events (
    owner_user_id, delivery_id, provider, provider_event_id, event_type, payload_sha256, safe_metadata, occurred_at
  ) VALUES (
    v_delivery.owner_user_id, v_delivery.id, p_provider, btrim(p_provider_event_id), p_event_type,
    p_payload_sha256, p_safe_metadata, p_occurred_at
  )
  ON CONFLICT (provider, provider_event_id) DO NOTHING
  RETURNING * INTO v_event;

  IF NOT FOUND THEN
    SELECT * INTO v_event FROM public.communication_delivery_events event
    WHERE event.provider = p_provider AND event.provider_event_id = btrim(p_provider_event_id);
    IF NOT FOUND
      OR v_event.delivery_id <> v_delivery.id
      OR v_event.event_type <> p_event_type
      OR v_event.payload_sha256 <> p_payload_sha256
      OR v_event.safe_metadata IS DISTINCT FROM p_safe_metadata THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'COMMUNICATION_WEBHOOK_EVIDENCE_CONFLICT';
    END IF;
    RETURN jsonb_build_object('duplicate', true, 'delivery_id', v_event.delivery_id, 'status', v_delivery.status);
  END IF;

  v_next_status := v_delivery.status;
  v_terminal_reason := v_delivery.terminal_reason;
  IF v_delivery.status = 'failed_permanent' THEN
    NULL;
  ELSIF p_event_type IN ('bounced', 'complained') THEN
    v_next_status := 'failed_permanent';
    v_terminal_reason := p_event_type;
  ELSIF p_event_type = 'delivered' THEN
    v_next_status := 'delivered';
  ELSIF p_event_type = 'accepted' AND v_delivery.status IN ('pending', 'processing', 'failed_retryable', 'outcome_unknown') THEN
    v_next_status := 'accepted';
  ELSIF p_event_type = 'failed' AND v_delivery.status IN ('pending', 'processing', 'failed_retryable', 'outcome_unknown') THEN
    v_next_status := 'failed_retryable';
  END IF;

  UPDATE public.communication_deliveries
  SET status = v_next_status,
    terminal_reason = v_terminal_reason,
    lease_until = CASE WHEN v_next_status = 'processing' THEN lease_until ELSE NULL END,
    accepted_at = CASE
      WHEN v_next_status IN ('accepted', 'delivered') AND p_event_type IN ('accepted', 'delivered')
        THEN coalesce(accepted_at, p_occurred_at)
      ELSE accepted_at
    END,
    delivered_at = CASE
      WHEN v_next_status = 'delivered' AND p_event_type = 'delivered'
        THEN coalesce(delivered_at, p_occurred_at)
      ELSE delivered_at
    END,
    updated_at = now()
  WHERE id = v_delivery.id
  RETURNING * INTO v_delivery;

  IF v_delivery.status = 'failed_permanent' THEN
    PERFORM public.communication_write_audit(
      NULL, 'communication.delivery', 'permanent_failure', 'communication_delivery', v_delivery.id,
      jsonb_build_object('terminal_reason', v_delivery.terminal_reason)
    );
  END IF;
  RETURN jsonb_build_object('duplicate', false, 'delivery_id', v_delivery.id, 'status', v_delivery.status);
END;
$$;

REVOKE ALL ON TABLE public.communication_threads, public.communication_participants,
  public.communication_messages, public.communication_attachments, public.communication_notifications,
  public.communication_preferences, public.communication_deliveries, public.communication_delivery_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_reject_content_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_identity_is_eligible(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_assert_actor(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_sync_thread_participants(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_sync_actor_participants(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_assert_active_participant(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_write_audit(uuid, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_create_thread(uuid, uuid, text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_send_message(uuid, uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_mark_read(uuid, uuid, uuid, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_set_notification_state(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_upsert_preferences(uuid, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_claim_due_deliveries(integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.communication_record_delivery_event(text, text, text, text, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.communication_threads, public.communication_participants,
  public.communication_messages, public.communication_attachments, public.communication_notifications,
  public.communication_preferences, public.communication_deliveries, public.communication_delivery_events TO service_role;
GRANT EXECUTE ON FUNCTION public.communication_sync_actor_participants(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.communication_create_thread(uuid, uuid, text, jsonb, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.communication_send_message(uuid, uuid, uuid, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.communication_mark_read(uuid, uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.communication_set_notification_state(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.communication_upsert_preferences(uuid, uuid, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.communication_claim_due_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.communication_record_delivery_event(text, text, text, text, text, timestamptz, jsonb) TO service_role;
COMMIT;
