-- Phase 11 Automation Control Plane: additive durable execution foundation.
-- Deliberately does not modify Phase 10 Communication Hub, legacy outreach, Finance,
-- owner_automation_runs, or historical schema.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE public.automation_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^RCP_[A-Z0-9_]{3,60}$'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','ENABLED','DISABLED')),
  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, code)
);

CREATE TABLE public.automation_recipe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  recipe_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  definition jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(definition) = 'object' AND octet_length(definition::text) <= 65536),
  configuration_sha256 text NOT NULL CHECK (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, recipe_id, version),
  FOREIGN KEY (owner_user_id, recipe_id)
    REFERENCES public.automation_recipes(owner_user_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'APPROVED') = (approved_at IS NOT NULL))
);

CREATE TABLE public.automation_recipe_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  recipe_version_id uuid NOT NULL,
  employee_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','REVOKED')),
  -- Scope is server-created normalized data: {"ACT_TASK":["<input sha256>"]}.
  allowed_inputs jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(allowed_inputs) = 'object' AND octet_length(allowed_inputs::text) <= 8192),
  allowed_inputs_sha256 text NOT NULL CHECK (allowed_inputs_sha256 ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, recipe_version_id)
    REFERENCES public.automation_recipe_versions(owner_user_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX automation_recipe_assignments_active_uniq
  ON public.automation_recipe_assignments(owner_user_id, recipe_version_id, employee_user_id)
  WHERE status = 'ACTIVE';

CREATE TABLE public.automation_trigger_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  source_code text NOT NULL CHECK (source_code = 'MANUAL'),
  source_event_id text NOT NULL CHECK (char_length(btrim(source_event_id)) BETWEEN 1 AND 200),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(safe_metadata) = 'object' AND octet_length(safe_metadata::text) <= 8192),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSED','REJECTED','CONFLICT')),
  run_id uuid,
  processed_at timestamptz,
  reason_code text,
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, source_code, source_event_id)
);

CREATE TABLE public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  trigger_inbox_id uuid NOT NULL,
  recipe_version_id uuid NOT NULL,
  configuration_sha256 text NOT NULL CHECK (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  -- Immutable authorization snapshot for Employee executions.
  recipe_assignment_id uuid,
  assignment_allowed_inputs_sha256 text CHECK (assignment_allowed_inputs_sha256 ~ '^[0-9a-f]{64}$'),
  correlation_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,200}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'WAITING'
    CHECK (state IN ('RUNNING','WAITING','COMPLETED','RETRYABLE','FAILED','BLOCKED','CANCELLED','HUMAN_REVIEW')),
  requested_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  requested_by_kind text NOT NULL CHECK (requested_by_kind IN ('owner','employee','system')),
  pause_reason_code text,
  cancelled_at timestamptz,
  cancel_reason_code text,
  safe_result_summary jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(safe_result_summary) = 'object' AND octet_length(safe_result_summary::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, idempotency_key),
  UNIQUE (owner_user_id, correlation_id),
  FOREIGN KEY (owner_user_id, trigger_inbox_id)
    REFERENCES public.automation_trigger_inbox(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, recipe_version_id)
    REFERENCES public.automation_recipe_versions(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, recipe_assignment_id)
    REFERENCES public.automation_recipe_assignments(owner_user_id, id) ON DELETE RESTRICT,
  CHECK ((requested_by_kind = 'employee') =
    (recipe_assignment_id IS NOT NULL AND assignment_allowed_inputs_sha256 IS NOT NULL)),
  CHECK (requested_by_kind <> 'employee' OR recipe_assignment_id IS NOT NULL)
);
ALTER TABLE public.automation_trigger_inbox
  ADD CONSTRAINT automation_trigger_inbox_run_fk
  FOREIGN KEY (owner_user_id, run_id)
  REFERENCES public.automation_runs(owner_user_id, id) ON DELETE RESTRICT;

CREATE TABLE public.automation_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  dependency_work_item_id uuid,
  recipe_action_key text NOT NULL DEFAULT 'ACTION_1' CHECK (recipe_action_key ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  action_code text NOT NULL CHECK (action_code IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY')),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object' AND octet_length(input::text) <= 65536),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'WAITING'
    CHECK (state IN ('RUNNING','WAITING','COMPLETED','RETRYABLE','FAILED','BLOCKED','CANCELLED','HUMAN_REVIEW')),
  priority integer NOT NULL DEFAULT 0 CHECK (priority BETWEEN -100 AND 100),
  due_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  retry_policy_key text NOT NULL DEFAULT 'INTERNAL_V1' CHECK (retry_policy_key = 'INTERNAL_V1'),
  last_reason_code text,
  attempt_id uuid,
  attempt_phase text CHECK (attempt_phase IN ('CLAIMED','DISPATCHING','RESULT_RECORDED')),
  dispatch_started_at timestamptz,
  lease_owner text,
  lease_token uuid,
  lease_until timestamptz,
  provider_code text NOT NULL DEFAULT 'INTERNAL' CHECK (provider_code = 'INTERNAL'),
  provider_idempotency_key text,
  provider_correlation_id text,
  result_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(result_metadata) = 'object' AND octet_length(result_metadata::text) <= 16384),
  result_sha256 text CHECK (result_sha256 IS NULL OR result_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, run_id, sequence),
  FOREIGN KEY (owner_user_id, run_id)
    REFERENCES public.automation_runs(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, dependency_work_item_id)
    REFERENCES public.automation_work_items(owner_user_id, id) ON DELETE RESTRICT,
  CHECK ((state = 'RUNNING') = (lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((state NOT IN ('COMPLETED','FAILED','CANCELLED')) OR completed_at IS NOT NULL)
);
CREATE INDEX automation_work_items_due_claim_idx
  ON public.automation_work_items(state, due_at, priority DESC, owner_user_id, id)
  WHERE state IN ('WAITING','RETRYABLE');
CREATE INDEX automation_work_items_lease_idx
  ON public.automation_work_items(lease_until, owner_user_id, id) WHERE state = 'RUNNING';
CREATE INDEX automation_work_items_run_history_idx
  ON public.automation_work_items(owner_user_id, run_id, sequence);

CREATE TABLE public.automation_policy_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  correlation_id uuid NOT NULL,
  run_id uuid,
  work_item_id uuid,
  policy_code text NOT NULL CHECK (policy_code IN ('POL_LIMIT','POL_SCORE','POL_REPLY','POL_ADMISSION')),
  policy_version text NOT NULL CHECK (policy_version = 'V1'),
  decision text NOT NULL CHECK (decision IN ('ALLOW','WAIT','BLOCK','HUMAN_REVIEW')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{3,100}$'),
  evaluated_input_sha256 text NOT NULL CHECK (evaluated_input_sha256 ~ '^[0-9a-f]{64}$'),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(safe_metadata) = 'object' AND octet_length(safe_metadata::text) <= 8192),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  source_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, run_id) REFERENCES public.automation_runs(owner_user_id, id),
  FOREIGN KEY (owner_user_id, work_item_id) REFERENCES public.automation_work_items(owner_user_id, id)
);

CREATE TABLE public.automation_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  work_item_id uuid,
  correlation_id uuid NOT NULL,
  event_sequence integer NOT NULL,
  event_code text NOT NULL CHECK (event_code ~ '^[A-Z0-9_]{3,100}$'),
  action_code text,
  actor_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  actor_source text NOT NULL,
  previous_state text,
  new_state text,
  reason_code text,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(safe_metadata) = 'object' AND octet_length(safe_metadata::text) <= 8192),
  metadata_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, run_id, event_sequence),
  FOREIGN KEY (owner_user_id, run_id) REFERENCES public.automation_runs(owner_user_id, id),
  FOREIGN KEY (owner_user_id, work_item_id) REFERENCES public.automation_work_items(owner_user_id, id)
);

CREATE TABLE public.automation_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('GLOBAL','OWNER','RECIPE','RUN','PROVIDER')),
  scope_id text NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  emergency_stop boolean NOT NULL DEFAULT false,
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{3,100}$'),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  effective_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, scope_type, scope_id),
  CHECK ((scope_type = 'GLOBAL' AND owner_user_id IS NULL AND scope_id = 'GLOBAL')
    OR (scope_type <> 'GLOBAL' AND owner_user_id IS NOT NULL))
);

CREATE UNIQUE INDEX automation_controls_global_uniq
  ON public.automation_controls(scope_type, scope_id) WHERE scope_type = 'GLOBAL';

CREATE TABLE public.automation_quota_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('OWNER','RECIPE','ACTION')),
  scope_id text NOT NULL,
  reservation_type text NOT NULL CHECK (reservation_type IN ('DAILY','CONCURRENT')),
  policy_key text NOT NULL CHECK (policy_key = 'POL_LIMIT'),
  window_start timestamptz NOT NULL,
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  consumed integer NOT NULL DEFAULT 0 CHECK (consumed >= 0),
  limit_value integer NOT NULL CHECK (limit_value BETWEEN 1 AND 100000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, scope_type, scope_id, reservation_type, policy_key, window_start)
);
CREATE TABLE public.automation_work_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  work_item_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  reservation_type text NOT NULL CHECK (reservation_type IN ('DAILY','CONCURRENT')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  UNIQUE (owner_user_id, work_item_id, reservation_id),
  FOREIGN KEY (owner_user_id, work_item_id)
    REFERENCES public.automation_work_items(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (reservation_id) REFERENCES public.automation_quota_reservations(id) ON DELETE RESTRICT
);
CREATE INDEX automation_work_reservations_active_idx
  ON public.automation_work_reservations(work_item_id, active);

CREATE TABLE public.automation_claim_fairness (
  owner_user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  last_served_cycle bigint NOT NULL DEFAULT 0 CHECK (last_served_cycle >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION public.automation_reject_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_IMMUTABLE';
END;
$$;
CREATE TRIGGER automation_recipe_versions_immutable
  BEFORE UPDATE OR DELETE ON public.automation_recipe_versions
  FOR EACH ROW WHEN (OLD.status = 'APPROVED') EXECUTE FUNCTION public.automation_reject_immutable();
CREATE TRIGGER automation_run_events_immutable
  BEFORE UPDATE OR DELETE ON public.automation_run_events
  FOR EACH ROW EXECUTE FUNCTION public.automation_reject_immutable();
CREATE TRIGGER automation_policy_decisions_immutable
  BEFORE UPDATE OR DELETE ON public.automation_policy_decisions
  FOR EACH ROW EXECUTE FUNCTION public.automation_reject_immutable();

CREATE FUNCTION public.automation_append_event(
  p_owner uuid, p_run uuid, p_work uuid, p_correlation uuid, p_code text,
  p_action text, p_actor uuid, p_source text, p_previous text, p_new text,
  p_reason text, p_metadata jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_sequence integer;
BEGIN
  IF jsonb_typeof(p_metadata) <> 'object' OR octet_length(p_metadata::text) > 8192 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_INVALID_METADATA';
  END IF;
  -- Serialize each run's event sequence without a global or aggregate table lock.
  PERFORM 1 FROM public.automation_runs
    WHERE owner_user_id = p_owner AND id = p_run FOR UPDATE;
  SELECT coalesce(max(event_sequence), 0) + 1 INTO v_sequence
    FROM public.automation_run_events WHERE owner_user_id = p_owner AND run_id = p_run;
  INSERT INTO public.automation_run_events(
    owner_user_id, run_id, work_item_id, correlation_id, event_sequence, event_code,
    action_code, actor_user_id, actor_source, previous_state, new_state, reason_code, safe_metadata
  ) VALUES (
    p_owner, p_run, p_work, p_correlation, v_sequence, p_code,
    p_action, p_actor, p_source, p_previous, p_new, p_reason, p_metadata
  );
END;
$$;

CREATE FUNCTION public.automation_recompute_run(p_owner uuid, p_run uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_state text; v_total integer; v_completed integer; v_failed integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE state = 'COMPLETED'), count(*) FILTER (WHERE state = 'FAILED')
    INTO v_total, v_completed, v_failed
    FROM public.automation_work_items WHERE owner_user_id = p_owner AND run_id = p_run;
  SELECT CASE
    WHEN exists (SELECT 1 FROM public.automation_runs WHERE owner_user_id = p_owner AND id = p_run AND cancelled_at IS NOT NULL) THEN 'CANCELLED'
    WHEN v_total > 0 AND v_completed = v_total THEN 'COMPLETED'
    WHEN v_failed > 0 AND v_failed + v_completed = v_total THEN 'FAILED'
    WHEN exists (SELECT 1 FROM public.automation_work_items WHERE owner_user_id = p_owner AND run_id = p_run AND state = 'HUMAN_REVIEW') THEN 'HUMAN_REVIEW'
    WHEN exists (SELECT 1 FROM public.automation_work_items WHERE owner_user_id = p_owner AND run_id = p_run AND state = 'RUNNING') THEN 'RUNNING'
    WHEN exists (SELECT 1 FROM public.automation_work_items WHERE owner_user_id = p_owner AND run_id = p_run AND state = 'RETRYABLE') THEN 'RETRYABLE'
    WHEN exists (SELECT 1 FROM public.automation_work_items WHERE owner_user_id = p_owner AND run_id = p_run AND state = 'BLOCKED') THEN 'BLOCKED'
    ELSE 'WAITING'
  END INTO v_state;
  UPDATE public.automation_runs
     SET state = v_state,
         started_at = CASE WHEN v_state = 'RUNNING' THEN coalesce(started_at, now()) ELSE started_at END,
         completed_at = CASE WHEN v_state IN ('COMPLETED','FAILED','CANCELLED') THEN coalesce(completed_at, now()) ELSE completed_at END,
         updated_at = now()
   WHERE owner_user_id = p_owner AND id = p_run
     AND state NOT IN ('COMPLETED','FAILED','CANCELLED');
  RETURN v_state;
END;
$$;

CREATE FUNCTION public.automation_control_reason(
  p_owner uuid, p_recipe uuid, p_run uuid, p_provider text
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.reason_code
    FROM public.automation_controls c
   WHERE (
        (c.scope_type = 'GLOBAL' AND c.scope_id = 'GLOBAL')
     OR (c.scope_type = 'OWNER' AND c.owner_user_id = p_owner AND c.scope_id = p_owner::text)
     OR (c.scope_type = 'RECIPE' AND c.owner_user_id = p_owner AND c.scope_id = p_recipe::text)
     OR (c.scope_type = 'RUN' AND c.owner_user_id = p_owner AND c.scope_id = p_run::text)
     OR (c.scope_type = 'PROVIDER' AND c.owner_user_id = p_owner AND c.scope_id = p_provider)
   ) AND (c.paused OR c.emergency_stop)
   ORDER BY CASE c.scope_type WHEN 'GLOBAL' THEN 1 WHEN 'OWNER' THEN 2 WHEN 'RECIPE' THEN 3 WHEN 'RUN' THEN 4 ELSE 5 END
   LIMIT 1;
$$;

CREATE FUNCTION public.automation_lock_controls(
  p_owner uuid, p_recipe uuid, p_run uuid, p_provider text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.automation_controls c
   WHERE (c.scope_type = 'GLOBAL' AND c.scope_id = 'GLOBAL')
      OR (c.scope_type = 'OWNER' AND c.owner_user_id = p_owner AND c.scope_id = p_owner::text)
      OR (c.scope_type = 'RECIPE' AND c.owner_user_id = p_owner AND c.scope_id = p_recipe::text)
      OR (c.scope_type = 'RUN' AND c.owner_user_id = p_owner AND c.scope_id = p_run::text)
      OR (c.scope_type = 'PROVIDER' AND c.owner_user_id = p_owner AND c.scope_id = p_provider)
   FOR SHARE;
END;
$$;

CREATE FUNCTION public.automation_release_work_reservations(p_work uuid, p_consume boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_link record;
BEGIN
  FOR v_link IN
    SELECT wr.id AS link_id, wr.reservation_type, qr.id AS reservation_id
      FROM public.automation_work_reservations wr
      JOIN public.automation_quota_reservations qr ON qr.id = wr.reservation_id
     WHERE wr.work_item_id = p_work AND wr.active
     FOR UPDATE OF wr, qr
  LOOP
    UPDATE public.automation_quota_reservations
       SET reserved = greatest(0, reserved - 1),
           consumed = CASE WHEN p_consume AND v_link.reservation_type = 'DAILY' THEN consumed + 1 ELSE consumed END,
           updated_at = now()
     WHERE id = v_link.reservation_id;
    UPDATE public.automation_work_reservations
       SET active = false, released_at = now() WHERE id = v_link.link_id;
  END LOOP;
END;
$$;

CREATE FUNCTION public.automation_reserve_work(
  p_owner uuid, p_recipe uuid, p_action text, p_work uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing integer;
  v_link_count integer;
  v_bucket record;
  v_day timestamptz := date_trunc('day', now());
BEGIN
  SELECT count(*) INTO v_link_count
    FROM public.automation_work_reservations WHERE work_item_id = p_work;
  IF v_link_count > 0 THEN
    IF v_link_count <> 6 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RESERVATION_CORRUPT';
    END IF;
    PERFORM 1
      FROM public.automation_work_reservations wr
      JOIN public.automation_quota_reservations qr ON qr.id = wr.reservation_id
     WHERE wr.work_item_id = p_work
     FOR UPDATE OF wr, qr;
    SELECT count(*) INTO v_existing
      FROM public.automation_work_reservations wr
      JOIN public.automation_quota_reservations qr ON qr.id = wr.reservation_id
     WHERE wr.work_item_id = p_work AND NOT wr.active
       AND ((wr.reservation_type = 'DAILY' AND qr.reserved + qr.consumed >= qr.limit_value)
         OR (wr.reservation_type = 'CONCURRENT' AND qr.reserved >= qr.limit_value));
    IF v_existing > 0 THEN RETURN false; END IF;
    UPDATE public.automation_quota_reservations qr
       SET reserved = reserved + 1, updated_at = now()
      FROM public.automation_work_reservations wr
     WHERE wr.work_item_id = p_work AND wr.reservation_id = qr.id AND NOT wr.active;
    UPDATE public.automation_work_reservations
       SET active = true, released_at = null
     WHERE work_item_id = p_work AND NOT active;
    RETURN true;
  END IF;

  -- Exactly six durable links: owner/recipe/action × daily/concurrent.
  FOR v_bucket IN
    SELECT * FROM (VALUES
      ('OWNER'::text, p_owner::text, 'DAILY'::text, v_day, 100000),
      ('RECIPE', p_recipe::text, 'DAILY', v_day, 100000),
      ('ACTION', p_action, 'DAILY', v_day, 100000),
      ('OWNER', p_owner::text, 'CONCURRENT', 'epoch'::timestamptz, 10),
      ('RECIPE', p_recipe::text, 'CONCURRENT', 'epoch'::timestamptz, 10),
      ('ACTION', p_action, 'CONCURRENT', 'epoch'::timestamptz, 2)
    ) AS b(scope_type, scope_id, reservation_type, window_start, limit_value)
  LOOP
    INSERT INTO public.automation_quota_reservations(
      owner_user_id, scope_type, scope_id, reservation_type, policy_key, window_start, limit_value
    ) VALUES (p_owner, v_bucket.scope_type, v_bucket.scope_id, v_bucket.reservation_type, 'POL_LIMIT', v_bucket.window_start, v_bucket.limit_value)
    ON CONFLICT (owner_user_id, scope_type, scope_id, reservation_type, policy_key, window_start) DO NOTHING;
  END LOOP;
  PERFORM 1 FROM public.automation_quota_reservations
   WHERE owner_user_id = p_owner
     AND ((scope_type = 'OWNER' AND scope_id = p_owner::text)
       OR (scope_type = 'RECIPE' AND scope_id = p_recipe::text)
       OR (scope_type = 'ACTION' AND scope_id = p_action))
   FOR UPDATE;
  SELECT count(*) INTO v_existing
    FROM public.automation_quota_reservations
   WHERE owner_user_id = p_owner
     AND ((scope_type = 'OWNER' AND scope_id = p_owner::text)
       OR (scope_type = 'RECIPE' AND scope_id = p_recipe::text)
       OR (scope_type = 'ACTION' AND scope_id = p_action))
     AND ((reservation_type = 'DAILY' AND reserved + consumed >= limit_value)
       OR (reservation_type = 'CONCURRENT' AND reserved >= limit_value));
  IF v_existing > 0 THEN RETURN false; END IF;
  FOR v_bucket IN
    SELECT * FROM public.automation_quota_reservations
     WHERE owner_user_id = p_owner
       AND ((scope_type = 'OWNER' AND scope_id = p_owner::text)
         OR (scope_type = 'RECIPE' AND scope_id = p_recipe::text)
         OR (scope_type = 'ACTION' AND scope_id = p_action))
  LOOP
    UPDATE public.automation_quota_reservations
       SET reserved = reserved + 1, updated_at = now() WHERE id = v_bucket.id;
    INSERT INTO public.automation_work_reservations(owner_user_id, work_item_id, reservation_id, reservation_type)
      VALUES (p_owner, p_work, v_bucket.id, v_bucket.reservation_type);
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION public.automation_create_trigger_run(
  p_owner uuid, p_actor uuid, p_actor_kind text, p_source text, p_source_event text,
  p_payload_hash text, p_metadata jsonb, p_recipe_version uuid, p_configuration_hash text,
  p_idempotency text, p_request_hash text, p_action text, p_input jsonb, p_input_hash text,
  p_due_at timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_trigger public.automation_trigger_inbox%ROWTYPE;
  v_run public.automation_runs%ROWTYPE;
  v_version public.automation_recipe_versions%ROWTYPE;
  v_assignment public.automation_recipe_assignments%ROWTYPE;
  v_work uuid;
  v_actor_ok boolean;
  v_recipe_action_key text;
  v_recipe_action_code text;
  v_recipe_provider_code text;
  v_input_hash text := encode(extensions.digest(p_input::text, 'sha256'), 'hex');
BEGIN
  IF p_source <> 'MANUAL' OR p_actor_kind NOT IN ('owner','employee')
     OR p_action NOT IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY')
     OR p_payload_hash !~ '^[0-9a-f]{64}$' OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR p_input_hash IS NULL OR p_input_hash !~ '^[0-9a-f]{64}$' OR p_configuration_hash !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(p_metadata) <> 'object' OR jsonb_typeof(p_input) <> 'object'
     OR octet_length(p_metadata::text) > 8192 OR octet_length(p_input::text) > 65536 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;

  SELECT * INTO v_trigger FROM public.automation_trigger_inbox
   WHERE owner_user_id = p_owner AND source_code = p_source AND source_event_id = p_source_event
   FOR UPDATE;
  IF found THEN
    IF v_trigger.payload_sha256 <> p_payload_hash THEN
      UPDATE public.automation_trigger_inbox
         SET status = 'CONFLICT', reason_code = 'TRIGGER_EVIDENCE_CONFLICT', processed_at = now()
       WHERE id = v_trigger.id;
      INSERT INTO public.automation_policy_decisions(
        owner_user_id, correlation_id, run_id, policy_code, policy_version, decision,
        reason_code, evaluated_input_sha256, actor_user_id, source_code
      ) VALUES (
        p_owner, v_trigger.correlation_id, v_trigger.run_id, 'POL_ADMISSION', 'V1', 'HUMAN_REVIEW',
        'TRIGGER_EVIDENCE_CONFLICT', v_input_hash, p_actor, p_source
      );
      IF v_trigger.run_id IS NOT NULL THEN
        SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = p_owner AND id = v_trigger.run_id;
        PERFORM public.automation_append_event(
          p_owner, v_run.id, NULL, v_trigger.correlation_id, 'TRIGGER_CONFLICT', NULL,
          p_actor, p_source, v_run.state, v_run.state, 'TRIGGER_EVIDENCE_CONFLICT', '{}'::jsonb
        );
      END IF;
      RETURN jsonb_build_object('trigger_id', v_trigger.id, 'run_id', v_trigger.run_id,
        'rejected', true, 'reason', 'AUTOMATION_TRIGGER_CONFLICT');
    END IF;
    RETURN jsonb_build_object('trigger_id', v_trigger.id, 'run_id', v_trigger.run_id, 'replayed', true);
  END IF;

  INSERT INTO public.automation_trigger_inbox(owner_user_id, source_code, source_event_id, payload_sha256, safe_metadata)
    VALUES (p_owner, p_source, p_source_event, p_payload_hash, p_metadata) RETURNING * INTO v_trigger;
  SELECT * INTO v_version FROM public.automation_recipe_versions
   WHERE owner_user_id = p_owner AND id = p_recipe_version AND status = 'APPROVED' FOR SHARE;
  IF not found OR v_version.configuration_sha256 <> p_configuration_hash THEN
    UPDATE public.automation_trigger_inbox SET status = 'REJECTED', reason_code = 'VERSION_INVALID', processed_at = now() WHERE id = v_trigger.id;
    INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, actor_user_id, source_code)
      VALUES (p_owner, v_trigger.correlation_id, 'POL_ADMISSION', 'V1', 'BLOCK', 'VERSION_INVALID', v_input_hash, p_actor, p_source);
    RETURN jsonb_build_object('trigger_id', v_trigger.id, 'rejected', true, 'reason', 'AUTOMATION_VERSION_INVALID');
  END IF;

  IF jsonb_typeof(v_version.definition -> 'actions') = 'array'
     AND jsonb_array_length(v_version.definition -> 'actions') = 1 THEN
    SELECT action ->> 'key', action ->> 'action_code', action ->> 'provider_code'
      INTO v_recipe_action_key, v_recipe_action_code, v_recipe_provider_code
      FROM jsonb_array_elements(v_version.definition -> 'actions') AS action;
  END IF;
  IF v_recipe_action_key IS NULL OR v_recipe_action_key !~ '^[A-Z][A-Z0-9_]{2,60}$'
     OR v_recipe_action_code IS NULL OR v_recipe_action_code NOT IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY')
     OR v_recipe_action_code <> p_action OR v_recipe_provider_code <> 'INTERNAL' THEN
    UPDATE public.automation_trigger_inbox SET status = 'REJECTED', reason_code = 'RECIPE_ACTION_INVALID', processed_at = now() WHERE id = v_trigger.id;
    INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, actor_user_id, source_code)
      VALUES (p_owner, v_trigger.correlation_id, 'POL_ADMISSION', 'V1', 'BLOCK', 'RECIPE_ACTION_INVALID', v_input_hash, p_actor, p_source);
    RETURN jsonb_build_object('trigger_id', v_trigger.id, 'rejected', true, 'reason', 'AUTOMATION_RECIPE_ACTION_INVALID');
  END IF;

  IF p_actor_kind = 'employee' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = p_actor AND u.role = 'employee' AND u.status = 'active'
         AND u.portal_owner_user_id = p_owner
    ) INTO v_actor_ok;
    SELECT * INTO v_assignment FROM public.automation_recipe_assignments
     WHERE owner_user_id = p_owner AND recipe_version_id = p_recipe_version
       AND employee_user_id = p_actor AND status = 'ACTIVE' FOR SHARE;
    IF NOT v_actor_ok OR NOT found
       OR NOT ((v_assignment.allowed_inputs -> p_action) ? v_input_hash) THEN
      UPDATE public.automation_trigger_inbox SET status = 'REJECTED', reason_code = 'EMPLOYEE_SCOPE_DENIED', processed_at = now() WHERE id = v_trigger.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, actor_user_id, source_code)
        VALUES (p_owner, v_trigger.correlation_id, 'POL_ADMISSION', 'V1', 'BLOCK', 'EMPLOYEE_SCOPE_DENIED', v_input_hash, p_actor, p_source);
      RETURN jsonb_build_object('trigger_id', v_trigger.id, 'rejected', true, 'reason', 'AUTOMATION_EMPLOYEE_SCOPE_DENIED');
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = p_actor AND u.id = p_owner AND u.role = 'client' AND u.status = 'active'
    ) INTO v_actor_ok;
    IF NOT v_actor_ok THEN
      UPDATE public.automation_trigger_inbox SET status = 'REJECTED', reason_code = 'OWNER_SCOPE_DENIED', processed_at = now() WHERE id = v_trigger.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, actor_user_id, source_code)
        VALUES (p_owner, v_trigger.correlation_id, 'POL_ADMISSION', 'V1', 'BLOCK', 'OWNER_SCOPE_DENIED', v_input_hash, p_actor, p_source);
      RETURN jsonb_build_object('trigger_id', v_trigger.id, 'rejected', true, 'reason', 'AUTOMATION_OWNER_SCOPE_DENIED');
    END IF;
  END IF;

  INSERT INTO public.automation_runs(
    owner_user_id, trigger_inbox_id, recipe_version_id, configuration_sha256,
    recipe_assignment_id, assignment_allowed_inputs_sha256, correlation_id,
    idempotency_key, request_sha256, requested_by_user_id, requested_by_kind
  ) VALUES (
    p_owner, v_trigger.id, p_recipe_version, p_configuration_hash,
    CASE WHEN p_actor_kind = 'employee' THEN v_assignment.id END,
    CASE WHEN p_actor_kind = 'employee' THEN v_assignment.allowed_inputs_sha256 END,
    v_trigger.correlation_id, p_idempotency, p_request_hash, p_actor, p_actor_kind
  ) ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING RETURNING * INTO v_run;
  IF not found THEN
    SELECT * INTO v_run FROM public.automation_runs
      WHERE owner_user_id = p_owner AND idempotency_key = p_idempotency FOR UPDATE;
    IF v_run.request_sha256 <> p_request_hash THEN
      UPDATE public.automation_trigger_inbox SET status = 'CONFLICT', reason_code = 'IDEMPOTENCY_CONFLICT', processed_at = now() WHERE id = v_trigger.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, run_id, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, actor_user_id, source_code)
        VALUES (p_owner, v_trigger.correlation_id, v_run.id, 'POL_ADMISSION', 'V1', 'HUMAN_REVIEW', 'IDEMPOTENCY_CONFLICT', v_input_hash, p_actor, p_source);
      PERFORM public.automation_append_event(p_owner, v_run.id, NULL, v_trigger.correlation_id, 'TRIGGER_CONFLICT', NULL, p_actor, p_source, v_run.state, v_run.state, 'IDEMPOTENCY_CONFLICT', '{}'::jsonb);
      RETURN jsonb_build_object('trigger_id', v_trigger.id, 'run_id', v_run.id, 'rejected', true, 'reason', 'AUTOMATION_IDEMPOTENCY_CONFLICT');
    END IF;
    UPDATE public.automation_trigger_inbox SET run_id = v_run.id, status = 'PROCESSED', processed_at = now() WHERE id = v_trigger.id;
    RETURN jsonb_build_object('trigger_id', v_trigger.id, 'run_id', v_run.id, 'replayed', true);
  END IF;

  INSERT INTO public.automation_work_items(
    owner_user_id, run_id, sequence, recipe_action_key, action_code,
    input, input_sha256, provider_code, due_at
  ) VALUES (
    p_owner, v_run.id, 1, v_recipe_action_key, v_recipe_action_code,
    p_input, v_input_hash, v_recipe_provider_code, p_due_at
  ) RETURNING id INTO v_work;
  INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, run_id, work_item_id, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, actor_user_id, source_code)
    VALUES (p_owner, v_trigger.correlation_id, v_run.id, v_work, 'POL_ADMISSION', 'V1', 'ALLOW', 'ADMISSION_ALLOWED', v_input_hash, p_actor, p_source);
  INSERT INTO public.automation_claim_fairness(owner_user_id) VALUES (p_owner) ON CONFLICT DO NOTHING;
  UPDATE public.automation_trigger_inbox SET run_id = v_run.id, status = 'PROCESSED', processed_at = now() WHERE id = v_trigger.id;
  PERFORM public.automation_append_event(p_owner, v_run.id, v_work, v_trigger.correlation_id,
    'TRIGGER_ACCEPTED', v_recipe_action_code, p_actor, p_source, NULL, 'WAITING', 'ADMISSION_ALLOWED', '{}'::jsonb);
  RETURN jsonb_build_object('trigger_id', v_trigger.id, 'run_id', v_run.id, 'work_item_id', v_work, 'replayed', false);
END;
$$;

CREATE FUNCTION public.automation_claim_work(
  p_worker text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 60
) RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid;
  v_owners uuid[] := ARRAY[]::uuid[];
  v_work public.automation_work_items%ROWTYPE;
  v_run public.automation_runs%ROWTYPE;
  v_recipe_id uuid;
  v_reason text;
  v_cycle bigint := floor(extract(epoch FROM clock_timestamp()) * 1000000)::bigint;
  v_count integer := 0;
  v_pass integer;
BEGIN
  IF p_worker IS NULL OR char_length(btrim(p_worker)) NOT BETWEEN 1 AND 120
     OR p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds NOT BETWEEN 10 AND 3600 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;

  -- Bounded fair-row selection only: no aggregate/table-wide fairness mutex.
  FOR v_owner IN
    SELECT f.owner_user_id FROM public.automation_claim_fairness f
     WHERE exists (
       SELECT 1 FROM public.automation_work_items w
       JOIN public.automation_runs r ON r.owner_user_id = w.owner_user_id AND r.id = w.run_id
       WHERE w.owner_user_id = f.owner_user_id AND w.state IN ('WAITING','RETRYABLE')
         AND w.due_at <= now() AND w.attempt_count < w.max_attempts AND r.cancelled_at IS NULL
         AND (w.dependency_work_item_id IS NULL OR exists (
           SELECT 1 FROM public.automation_work_items d WHERE d.id = w.dependency_work_item_id AND d.state = 'COMPLETED'
         ))
     )
     ORDER BY f.last_served_cycle, f.owner_user_id
     LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    v_owners := array_append(v_owners, v_owner);
  END LOOP;

  FOR v_pass IN 1..2 LOOP
    FOREACH v_owner IN ARRAY v_owners LOOP
      EXIT WHEN v_count >= p_limit;
      SELECT w.* INTO v_work
        FROM public.automation_work_items w
        JOIN public.automation_runs r ON r.owner_user_id = w.owner_user_id AND r.id = w.run_id
       WHERE w.owner_user_id = v_owner
         AND w.state IN ('WAITING','RETRYABLE') AND w.due_at <= now()
         AND w.attempt_count < w.max_attempts AND r.cancelled_at IS NULL
         AND (w.dependency_work_item_id IS NULL OR exists (
           SELECT 1 FROM public.automation_work_items d WHERE d.id = w.dependency_work_item_id AND d.state = 'COMPLETED'
         ))
       ORDER BY w.due_at, w.priority DESC, w.id
       LIMIT 1 FOR UPDATE SKIP LOCKED;
      IF NOT found THEN CONTINUE; END IF;
      SELECT * INTO v_run FROM public.automation_runs
       WHERE owner_user_id = v_work.owner_user_id AND id = v_work.run_id FOR UPDATE;
      SELECT recipe_id INTO v_recipe_id FROM public.automation_recipe_versions
       WHERE owner_user_id = v_work.owner_user_id AND id = v_run.recipe_version_id FOR SHARE;
      PERFORM public.automation_lock_controls(v_work.owner_user_id, v_recipe_id, v_work.run_id, v_work.provider_code);
      v_reason := public.automation_control_reason(v_work.owner_user_id, v_recipe_id, v_work.run_id, v_work.provider_code);
      IF v_reason IS NOT NULL OR NOT exists (
        SELECT 1 FROM public.automation_recipe_versions rv
          WHERE rv.owner_user_id = v_work.owner_user_id AND rv.id = v_run.recipe_version_id
            AND rv.status = 'APPROVED' AND rv.configuration_sha256 = v_run.configuration_sha256
      ) THEN
        v_reason := coalesce(v_reason, 'VERSION_NOT_APPROVED');
        UPDATE public.automation_work_items
           SET state = 'BLOCKED', last_reason_code = v_reason, updated_at = now()
         WHERE id = v_work.id;
        INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, run_id, work_item_id, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, source_code)
          VALUES (v_work.owner_user_id, v_run.correlation_id, v_run.id, v_work.id, 'POL_LIMIT', 'V1', 'BLOCK', v_reason, v_work.input_sha256, 'claim');
        PERFORM public.automation_recompute_run(v_work.owner_user_id, v_work.run_id);
        PERFORM public.automation_append_event(v_work.owner_user_id, v_work.run_id, v_work.id, v_run.correlation_id, 'WORK_BLOCKED', v_work.action_code, NULL, 'claim', v_work.state, 'BLOCKED', v_reason, '{}'::jsonb);
        CONTINUE;
      END IF;
      IF NOT public.automation_reserve_work(v_work.owner_user_id, v_recipe_id, v_work.action_code, v_work.id) THEN
        UPDATE public.automation_work_items
           SET state = 'BLOCKED', last_reason_code = 'QUOTA_DENIED', updated_at = now()
         WHERE id = v_work.id;
        INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, run_id, work_item_id, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, source_code)
          VALUES (v_work.owner_user_id, v_run.correlation_id, v_run.id, v_work.id, 'POL_LIMIT', 'V1', 'BLOCK', 'QUOTA_DENIED', v_work.input_sha256, 'claim');
        PERFORM public.automation_recompute_run(v_work.owner_user_id, v_work.run_id);
        PERFORM public.automation_append_event(v_work.owner_user_id, v_work.run_id, v_work.id, v_run.correlation_id, 'WORK_BLOCKED', v_work.action_code, NULL, 'claim', v_work.state, 'BLOCKED', 'QUOTA_DENIED', '{}'::jsonb);
        CONTINUE;
      END IF;
      UPDATE public.automation_work_items
         SET state = 'RUNNING', attempt_count = attempt_count + 1, attempt_id = gen_random_uuid(),
             attempt_phase = 'CLAIMED', lease_owner = p_worker, lease_token = gen_random_uuid(),
             lease_until = now() + make_interval(secs => p_lease_seconds),
             started_at = coalesce(started_at, now()), updated_at = now()
       WHERE id = v_work.id RETURNING * INTO v_work;
      PERFORM public.automation_recompute_run(v_work.owner_user_id, v_work.run_id);
      PERFORM public.automation_append_event(v_work.owner_user_id, v_work.run_id, v_work.id, v_run.correlation_id,
        'WORK_CLAIMED', v_work.action_code, NULL, 'worker', 'WAITING', 'RUNNING', NULL, jsonb_build_object('worker', p_worker));
      UPDATE public.automation_claim_fairness
         SET last_served_cycle = greatest(last_served_cycle + 1, v_cycle), updated_at = now()
       WHERE owner_user_id = v_work.owner_user_id;
      v_count := v_count + 1;
      RETURN NEXT jsonb_build_object(
        'id', v_work.id, 'owner_user_id', v_work.owner_user_id, 'run_id', v_work.run_id,
        'action_code', v_work.action_code, 'input', v_work.input, 'lease_token', v_work.lease_token,
        'lease_until', v_work.lease_until, 'attempt_count', v_work.attempt_count,
        'attempt_phase', v_work.attempt_phase, 'requested_by_user_id', v_run.requested_by_user_id,
        'requested_by_kind', v_run.requested_by_kind, 'correlation_id', v_run.correlation_id
      );
    END LOOP;
  END LOOP;
END;
$$;

CREATE FUNCTION public.automation_transition_work(
  p_work uuid, p_worker text, p_token uuid, p_expected text, p_next text, p_reason text,
  p_result jsonb DEFAULT '{}'::jsonb, p_due timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE;
BEGIN
  IF p_expected <> 'RUNNING' OR p_next NOT IN ('WAITING','COMPLETED','RETRYABLE','FAILED','BLOCKED','CANCELLED','HUMAN_REVIEW')
     OR jsonb_typeof(p_result) <> 'object' OR octet_length(p_result::text) > 16384 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_TRANSITION_INVALID';
  END IF;
  SELECT * INTO v_work FROM public.automation_work_items WHERE id = p_work FOR UPDATE;
  IF NOT found THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_LEASE_LOST';
  END IF;
  IF v_work.state <> p_expected OR v_work.lease_owner <> p_worker
     OR v_work.lease_token <> p_token OR v_work.lease_until <= now() THEN
    SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = v_work.owner_user_id AND id = v_work.run_id;
    PERFORM public.automation_append_event(v_work.owner_user_id, v_work.run_id, v_work.id, v_run.correlation_id,
      'LATE_RESULT', v_work.action_code, NULL, 'worker', v_work.state, v_work.state, 'LATE_RESULT',
      jsonb_build_object('result_sha256', encode(extensions.digest(p_result::text, 'sha256'), 'hex')));
    RETURN jsonb_build_object('work_item_id', v_work.id, 'state', v_work.state, 'late', true);
  END IF;
  IF p_next = 'RETRYABLE' AND v_work.attempt_count >= v_work.max_attempts THEN
    p_next := 'FAILED'; p_reason := 'ATTEMPTS_EXHAUSTED';
  END IF;
  PERFORM public.automation_release_work_reservations(v_work.id, p_next = 'COMPLETED');
  UPDATE public.automation_work_items
     SET state = p_next, attempt_phase = 'RESULT_RECORDED', lease_owner = NULL, lease_token = NULL, lease_until = NULL,
         due_at = coalesce(p_due, due_at), last_reason_code = p_reason, result_metadata = p_result,
         completed_at = CASE WHEN p_next IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = p_work RETURNING * INTO v_work;
  PERFORM public.automation_recompute_run(v_work.owner_user_id, v_work.run_id);
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = v_work.owner_user_id AND id = v_work.run_id;
  PERFORM public.automation_append_event(v_work.owner_user_id, v_work.run_id, v_work.id, v_run.correlation_id,
    'WORK_TRANSITION', v_work.action_code, NULL, 'worker', p_expected, p_next, p_reason, '{}'::jsonb);
  RETURN jsonb_build_object('work_item_id', v_work.id, 'state', v_work.state, 'run_state', v_run.state);
END;
$$;

CREATE FUNCTION public.automation_mark_dispatching(p_work uuid, p_worker text, p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_work public.automation_work_items%ROWTYPE;
  v_run public.automation_runs%ROWTYPE;
  v_recipe_id uuid;
  v_assignment public.automation_recipe_assignments%ROWTYPE;
  v_reason text;
BEGIN
  SELECT * INTO v_work FROM public.automation_work_items WHERE id = p_work FOR UPDATE;
  IF NOT found OR v_work.state <> 'RUNNING' OR v_work.lease_owner <> p_worker
     OR v_work.lease_token <> p_token OR v_work.lease_until <= now() OR v_work.attempt_phase <> 'CLAIMED' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_LEASE_LOST';
  END IF;
  SELECT * INTO v_run FROM public.automation_runs
   WHERE owner_user_id = v_work.owner_user_id AND id = v_work.run_id FOR UPDATE;
  SELECT recipe_id INTO v_recipe_id FROM public.automation_recipe_versions
   WHERE owner_user_id = v_work.owner_user_id AND id = v_run.recipe_version_id FOR SHARE;
  PERFORM public.automation_lock_controls(v_work.owner_user_id, v_recipe_id, v_work.run_id, v_work.provider_code);
  v_reason := public.automation_control_reason(v_work.owner_user_id, v_recipe_id, v_work.run_id, v_work.provider_code);
  IF v_reason IS NULL AND NOT exists (
    SELECT 1 FROM public.automation_recipe_versions rv
     WHERE rv.owner_user_id = v_work.owner_user_id AND rv.id = v_run.recipe_version_id
       AND rv.status = 'APPROVED' AND rv.configuration_sha256 = v_run.configuration_sha256
  ) THEN v_reason := 'VERSION_NOT_APPROVED'; END IF;
  IF v_reason IS NULL AND v_run.requested_by_kind = 'employee' THEN
    SELECT a.* INTO v_assignment FROM public.automation_recipe_assignments a
     JOIN public.users u ON u.id = a.employee_user_id
     WHERE a.owner_user_id = v_work.owner_user_id AND a.id = v_run.recipe_assignment_id
       AND a.recipe_version_id = v_run.recipe_version_id AND a.employee_user_id = v_run.requested_by_user_id
       AND a.status = 'ACTIVE' AND u.role = 'employee' AND u.status = 'active'
       AND u.portal_owner_user_id = v_work.owner_user_id FOR SHARE OF a, u;
    IF NOT found OR v_assignment.allowed_inputs_sha256 <> v_run.assignment_allowed_inputs_sha256
       OR NOT ((v_assignment.allowed_inputs -> v_work.action_code) ? v_work.input_sha256) THEN
      v_reason := 'EMPLOYEE_SCOPE_REVOKED';
    END IF;
  END IF;
  IF v_reason IS NULL AND (SELECT count(*) FROM public.automation_work_reservations WHERE work_item_id = v_work.id AND active) <> 6 THEN
    v_reason := 'RESERVATION_INVALID';
  END IF;
  IF v_reason IS NOT NULL THEN
    PERFORM public.automation_release_work_reservations(v_work.id, false);
    UPDATE public.automation_work_items
       SET state = CASE WHEN v_reason LIKE '%STOP%' THEN 'CANCELLED' ELSE 'BLOCKED' END,
           lease_owner = NULL, lease_token = NULL, lease_until = NULL, last_reason_code = v_reason,
           completed_at = CASE WHEN v_reason LIKE '%STOP%' THEN now() ELSE NULL END, updated_at = now()
     WHERE id = v_work.id;
    INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, run_id, work_item_id, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, source_code)
      VALUES (v_work.owner_user_id, v_run.correlation_id, v_run.id, v_work.id, 'POL_ADMISSION', 'V1', 'BLOCK', v_reason, v_work.input_sha256, 'dispatch');
    PERFORM public.automation_recompute_run(v_work.owner_user_id, v_work.run_id);
    PERFORM public.automation_append_event(v_work.owner_user_id, v_work.run_id, v_work.id, v_run.correlation_id,
      'DISPATCH_DENIED', v_work.action_code, NULL, 'worker', 'RUNNING', 'BLOCKED', v_reason, '{}'::jsonb);
    RETURN jsonb_build_object('allowed', false, 'state', 'BLOCKED', 'reason', v_reason);
  END IF;
  UPDATE public.automation_work_items
     SET attempt_phase = 'DISPATCHING', dispatch_started_at = now(), updated_at = now() WHERE id = v_work.id;
  PERFORM public.automation_append_event(v_work.owner_user_id, v_work.run_id, v_work.id, v_run.correlation_id,
    'WORK_DISPATCHING', v_work.action_code, NULL, 'worker', 'RUNNING', 'RUNNING', NULL, '{}'::jsonb);
  RETURN jsonb_build_object('allowed', true, 'state', 'RUNNING');
END;
$$;

CREATE FUNCTION public.automation_recover_stale(p_limit integer DEFAULT 50)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_recipe_id uuid; v_next text; v_reason text;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  FOR v_work IN
    SELECT * FROM public.automation_work_items
     WHERE state = 'RUNNING' AND lease_until < now()
     ORDER BY lease_until, id LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = v_work.owner_user_id AND id = v_work.run_id FOR UPDATE;
    SELECT recipe_id INTO v_recipe_id FROM public.automation_recipe_versions
     WHERE owner_user_id = v_work.owner_user_id AND id = v_run.recipe_version_id FOR SHARE;
    PERFORM public.automation_lock_controls(v_work.owner_user_id, v_recipe_id, v_work.run_id, v_work.provider_code);
    v_reason := public.automation_control_reason(v_work.owner_user_id, v_recipe_id, v_work.run_id, v_work.provider_code);
    IF v_run.cancelled_at IS NOT NULL OR v_reason LIKE '%STOP%' THEN
      v_next := 'CANCELLED'; v_reason := coalesce(v_reason, 'RUN_CANCELLED');
    ELSIF v_work.attempt_phase = 'CLAIMED' AND v_work.attempt_count >= v_work.max_attempts THEN
      v_next := 'FAILED'; v_reason := 'ATTEMPTS_EXHAUSTED';
    ELSIF v_work.attempt_phase = 'CLAIMED' AND v_reason IS NULL THEN
      v_next := 'RETRYABLE'; v_reason := 'LEASE_EXPIRED_UNSTARTED';
    ELSIF v_work.attempt_phase = 'CLAIMED' THEN
      v_next := 'BLOCKED';
    ELSE
      v_next := 'HUMAN_REVIEW'; v_reason := 'LEASE_EXPIRED_DISPATCHING';
    END IF;
    PERFORM public.automation_release_work_reservations(v_work.id, false);
    UPDATE public.automation_work_items
       SET state = v_next, lease_owner = NULL, lease_token = NULL, lease_until = NULL,
           last_reason_code = v_reason, due_at = CASE WHEN v_next = 'RETRYABLE' THEN now() + interval '1 second' ELSE due_at END,
           completed_at = CASE WHEN v_next IN ('FAILED','CANCELLED') THEN now() ELSE NULL END,
           updated_at = now()
     WHERE id = v_work.id;
    PERFORM public.automation_recompute_run(v_work.owner_user_id, v_work.run_id);
    PERFORM public.automation_append_event(v_work.owner_user_id, v_work.run_id, v_work.id, v_run.correlation_id,
      'LEASE_RECOVERED', v_work.action_code, NULL, 'recovery', 'RUNNING', v_next, v_reason, '{}'::jsonb);
    RETURN NEXT jsonb_build_object('work_item_id', v_work.id, 'state', v_next);
  END LOOP;
END;
$$;

CREATE FUNCTION public.automation_set_control(
  p_owner uuid, p_scope_type text, p_scope_id text, p_paused boolean,
  p_emergency boolean, p_reason text, p_actor uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_scope_type NOT IN ('GLOBAL','OWNER','RECIPE','RUN','PROVIDER') OR p_reason !~ '^[A-Z0-9_]{3,100}$'
     OR (p_scope_type = 'GLOBAL' AND (p_owner IS NOT NULL OR p_scope_id <> 'GLOBAL'))
     OR (p_scope_type <> 'GLOBAL' AND p_owner IS NULL) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  IF p_scope_type = 'GLOBAL' THEN
    UPDATE public.automation_controls
       SET paused = p_paused, emergency_stop = p_emergency, reason_code = p_reason,
           actor_user_id = p_actor, updated_at = now()
     WHERE scope_type = 'GLOBAL' AND scope_id = 'GLOBAL';
    IF NOT found THEN
      INSERT INTO public.automation_controls(owner_user_id, scope_type, scope_id, paused, emergency_stop, reason_code, actor_user_id)
        VALUES (NULL, 'GLOBAL', 'GLOBAL', p_paused, p_emergency, p_reason, p_actor);
    END IF;
  ELSE
    INSERT INTO public.automation_controls(owner_user_id, scope_type, scope_id, paused, emergency_stop, reason_code, actor_user_id)
      VALUES (p_owner, p_scope_type, p_scope_id, p_paused, p_emergency, p_reason, p_actor)
    ON CONFLICT(owner_user_id, scope_type, scope_id) DO UPDATE
      SET paused = excluded.paused, emergency_stop = excluded.emergency_stop,
          reason_code = excluded.reason_code, actor_user_id = excluded.actor_user_id, updated_at = now();
  END IF;
END;
$$;

CREATE FUNCTION public.automation_cancel_run(
  p_owner uuid, p_run uuid, p_actor uuid, p_reason text DEFAULT 'OWNER_CANCELLED'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.automation_runs%ROWTYPE; v_work public.automation_work_items%ROWTYPE;
BEGIN
  IF p_reason !~ '^[A-Z0-9_]{3,100}$' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = p_owner AND id = p_run FOR UPDATE;
  IF NOT found THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RUN_NOT_FOUND'; END IF;
  IF v_run.state IN ('COMPLETED','FAILED','CANCELLED') THEN
    RETURN jsonb_build_object('run_id', v_run.id, 'state', v_run.state, 'replayed', true);
  END IF;
  UPDATE public.automation_runs SET cancelled_at = now(), cancel_reason_code = p_reason, updated_at = now()
   WHERE owner_user_id = p_owner AND id = p_run;
  FOR v_work IN SELECT * FROM public.automation_work_items
    WHERE owner_user_id = p_owner AND run_id = p_run AND state NOT IN ('COMPLETED','FAILED','CANCELLED') FOR UPDATE
  LOOP
    PERFORM public.automation_release_work_reservations(v_work.id, false);
    UPDATE public.automation_work_items
       SET state = 'CANCELLED', lease_owner = NULL, lease_token = NULL, lease_until = NULL,
           last_reason_code = p_reason, completed_at = now(), updated_at = now() WHERE id = v_work.id;
    PERFORM public.automation_append_event(p_owner, p_run, v_work.id, v_run.correlation_id,
      'WORK_CANCELLED', v_work.action_code, p_actor, 'control', v_work.state, 'CANCELLED', p_reason, '{}'::jsonb);
  END LOOP;
  PERFORM public.automation_recompute_run(p_owner, p_run);
  RETURN jsonb_build_object('run_id', p_run, 'state', 'CANCELLED', 'replayed', false);
END;
$$;

ALTER TABLE public.automation_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_recipe_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_recipe_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_trigger_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_policy_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_run_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_quota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_work_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_claim_fairness ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.automation_recipes, public.automation_recipe_versions,
  public.automation_recipe_assignments, public.automation_trigger_inbox, public.automation_runs,
  public.automation_work_items, public.automation_policy_decisions, public.automation_run_events,
  public.automation_controls, public.automation_quota_reservations, public.automation_work_reservations,
  public.automation_claim_fairness FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.automation_recipes, public.automation_recipe_versions,
  public.automation_recipe_assignments, public.automation_trigger_inbox, public.automation_runs,
  public.automation_work_items, public.automation_policy_decisions, public.automation_run_events,
  public.automation_controls, public.automation_quota_reservations, public.automation_work_reservations,
  public.automation_claim_fairness TO service_role;

REVOKE ALL ON FUNCTION
  public.automation_reject_immutable(),
  public.automation_append_event(uuid,uuid,uuid,uuid,text,text,uuid,text,text,text,text,jsonb),
  public.automation_recompute_run(uuid,uuid),
  public.automation_control_reason(uuid,uuid,uuid,text),
  public.automation_lock_controls(uuid,uuid,uuid,text),
  public.automation_release_work_reservations(uuid,boolean),
  public.automation_reserve_work(uuid,uuid,text,uuid),
  public.automation_create_trigger_run(uuid,uuid,text,text,text,text,jsonb,uuid,text,text,text,text,jsonb,text,timestamptz),
  public.automation_claim_work(text,integer,integer),
  public.automation_transition_work(uuid,text,uuid,text,text,text,jsonb,timestamptz),
  public.automation_mark_dispatching(uuid,text,uuid),
  public.automation_recover_stale(integer),
  public.automation_set_control(uuid,text,text,boolean,boolean,text,uuid),
  public.automation_cancel_run(uuid,uuid,uuid,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.automation_create_trigger_run(uuid,uuid,text,text,text,text,jsonb,uuid,text,text,text,text,jsonb,text,timestamptz),
  public.automation_claim_work(text,integer,integer),
  public.automation_transition_work(uuid,text,uuid,text,text,text,jsonb,timestamptz),
  public.automation_mark_dispatching(uuid,text,uuid),
  public.automation_recover_stale(integer),
  public.automation_set_control(uuid,text,text,boolean,boolean,text,uuid),
  public.automation_cancel_run(uuid,uuid,uuid,text)
TO service_role;
COMMIT;
