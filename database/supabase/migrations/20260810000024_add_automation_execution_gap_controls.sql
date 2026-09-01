-- Phase 11 Step 2 gap closure: durable schedules, lease heartbeat, review decisions,
-- dependent-work fan-out, and worker compatibility. This is additive and does not alter
-- Phase 10, owner_automation_runs, legacy outreach, or process-local runtime systems.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE public.automation_execution_contract (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  schema_version integer NOT NULL CHECK (schema_version = 2),
  registry_version text NOT NULL CHECK (registry_version = 'AUTOMATION_REGISTRY_V1'),
  worker_version text NOT NULL CHECK (worker_version = 'AUTOMATION_WORKER_V1'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.automation_execution_contract(singleton, schema_version, registry_version, worker_version)
  VALUES (true, 2, 'AUTOMATION_REGISTRY_V1', 'AUTOMATION_WORKER_V1');

CREATE TABLE public.automation_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  recipe_version_id uuid NOT NULL,
  configuration_sha256 text NOT NULL CHECK (configuration_sha256 ~ '^[0-9a-f]{64}$'),
  recipe_action_key text NOT NULL CHECK (recipe_action_key ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  action_code text NOT NULL CHECK (action_code IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY')),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object' AND octet_length(input::text) <= 65536),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  recurrence jsonb NOT NULL DEFAULT '{"kind":"DAILY"}'::jsonb
    CHECK (jsonb_typeof(recurrence) = 'object' AND recurrence = '{"kind":"DAILY"}'::jsonb),
  timezone text NOT NULL CHECK (char_length(btrim(timezone)) BETWEEN 1 AND 80),
  local_time time NOT NULL,
  next_occurrence_at timestamptz NOT NULL,
  last_materialized_occurrence_key text,
  enabled boolean NOT NULL DEFAULT true,
  paused boolean NOT NULL DEFAULT false,
  catch_up_limit integer NOT NULL DEFAULT 25 CHECK (catch_up_limit BETWEEN 1 AND 25),
  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, recipe_version_id)
    REFERENCES public.automation_recipe_versions(owner_user_id, id) ON DELETE RESTRICT
);
CREATE INDEX automation_schedules_due_idx
  ON public.automation_schedules(enabled, paused, next_occurrence_at, id)
  WHERE enabled AND NOT paused;

CREATE TABLE public.automation_schedule_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  schedule_id uuid NOT NULL,
  occurrence_key text NOT NULL CHECK (occurrence_key ~ '^\d{4}-\d{2}-\d{2}$'),
  scheduled_for timestamptz NOT NULL,
  run_id uuid,
  work_item_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, schedule_id, occurrence_key),
  FOREIGN KEY (owner_user_id, schedule_id)
    REFERENCES public.automation_schedules(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, run_id)
    REFERENCES public.automation_runs(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, work_item_id)
    REFERENCES public.automation_work_items(owner_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.automation_control_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  work_item_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,200}$'),
  operation_code text NOT NULL CHECK (operation_code IN ('REVIEW_RESUME','REVIEW_FAIL','REVIEW_CANCEL','RETRY_RESUME')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{3,100}$'),
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  UNIQUE (owner_user_id, idempotency_key),
  FOREIGN KEY (owner_user_id, work_item_id)
    REFERENCES public.automation_work_items(owner_user_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.automation_trigger_inbox
  DROP CONSTRAINT automation_trigger_inbox_source_code_check;
ALTER TABLE public.automation_trigger_inbox
  ADD CONSTRAINT automation_trigger_inbox_source_code_check CHECK (source_code IN ('MANUAL','SCHEDULE'));

CREATE FUNCTION public.automation_create_daily_schedule(
  p_owner uuid, p_actor uuid, p_recipe_version uuid, p_configuration_hash text,
  p_action text, p_input jsonb, p_timezone text, p_local_time time
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_version public.automation_recipe_versions%ROWTYPE;
  v_action_key text;
  v_action_code text;
  v_provider text;
  v_now_local timestamp;
  v_next timestamptz;
  v_schedule public.automation_schedules%ROWTYPE;
BEGIN
  IF p_configuration_hash !~ '^[0-9a-f]{64}$' OR p_action NOT IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY')
     OR jsonb_typeof(p_input) <> 'object' OR octet_length(p_input::text) > 65536
     OR p_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  PERFORM 1 FROM public.users u WHERE u.id = p_owner AND u.id = p_actor AND u.role = 'client' AND u.status = 'active';
  IF NOT found THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_OWNER_SCOPE_DENIED'; END IF;
  SELECT * INTO v_version FROM public.automation_recipe_versions
   WHERE owner_user_id = p_owner AND id = p_recipe_version AND status = 'APPROVED' FOR SHARE;
  IF NOT found OR v_version.configuration_sha256 <> p_configuration_hash
     OR jsonb_typeof(v_version.definition -> 'actions') <> 'array'
     OR jsonb_array_length(v_version.definition -> 'actions') <> 1 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VERSION_INVALID';
  END IF;
  SELECT action ->> 'key', action ->> 'action_code', action ->> 'provider_code'
    INTO v_action_key, v_action_code, v_provider
    FROM jsonb_array_elements(v_version.definition -> 'actions') AS action;
  IF v_action_key IS NULL OR v_action_key !~ '^[A-Z][A-Z0-9_]{2,60}$'
     OR v_action_code <> p_action OR v_provider <> 'INTERNAL' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_ACTION_INVALID';
  END IF;
  v_now_local := now() AT TIME ZONE p_timezone;
  v_next := ((v_now_local::date + p_local_time) AT TIME ZONE p_timezone);
  IF v_next <= now() THEN v_next := (((v_now_local::date + 1) + p_local_time) AT TIME ZONE p_timezone); END IF;
  INSERT INTO public.automation_schedules(
    owner_user_id, recipe_version_id, configuration_sha256, recipe_action_key, action_code,
    input, input_sha256, timezone, local_time, next_occurrence_at, created_by_user_id
  ) VALUES (
    p_owner, p_recipe_version, p_configuration_hash, v_action_key, v_action_code,
    p_input, encode(extensions.digest(p_input::text, 'sha256'), 'hex'), p_timezone, p_local_time, v_next, p_actor
  ) RETURNING * INTO v_schedule;
  RETURN jsonb_build_object('schedule_id', v_schedule.id, 'next_occurrence_at', v_schedule.next_occurrence_at);
END;
$$;

CREATE FUNCTION public.automation_materialize_schedules(p_limit integer DEFAULT 25)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_schedule public.automation_schedules%ROWTYPE;
  v_version public.automation_recipe_versions%ROWTYPE;
  v_trigger public.automation_trigger_inbox%ROWTYPE;
  v_run public.automation_runs%ROWTYPE;
  v_occurrence public.automation_schedule_occurrences%ROWTYPE;
  v_work uuid;
  v_key text;
  v_count integer := 0;
  v_local_date date;
  v_next timestamptz;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  FOR v_schedule IN
    SELECT * FROM public.automation_schedules
     WHERE enabled AND NOT paused AND next_occurrence_at <= now()
     ORDER BY next_occurrence_at, id LIMIT p_limit FOR UPDATE SKIP LOCKED
  LOOP
    WHILE v_schedule.next_occurrence_at <= now() AND v_count < v_schedule.catch_up_limit LOOP
      SELECT * INTO v_version FROM public.automation_recipe_versions
       WHERE owner_user_id = v_schedule.owner_user_id AND id = v_schedule.recipe_version_id
         AND status = 'APPROVED' AND configuration_sha256 = v_schedule.configuration_sha256 FOR SHARE;
      IF NOT found THEN
        UPDATE public.automation_schedules SET enabled = false, updated_at = now() WHERE id = v_schedule.id;
        EXIT;
      END IF;
      v_key := to_char(v_schedule.next_occurrence_at AT TIME ZONE v_schedule.timezone, 'YYYY-MM-DD');
      INSERT INTO public.automation_schedule_occurrences(owner_user_id, schedule_id, occurrence_key, scheduled_for)
        VALUES (v_schedule.owner_user_id, v_schedule.id, v_key, v_schedule.next_occurrence_at)
        ON CONFLICT (owner_user_id, schedule_id, occurrence_key) DO NOTHING RETURNING * INTO v_occurrence;
      IF found THEN
        INSERT INTO public.automation_trigger_inbox(owner_user_id, source_code, source_event_id, payload_sha256, safe_metadata)
          VALUES (
            v_schedule.owner_user_id, 'SCHEDULE', 'schedule:' || v_schedule.id::text || ':' || v_key,
            encode(extensions.digest(v_schedule.input::text, 'sha256'), 'hex'),
            jsonb_build_object('schedule_id', v_schedule.id, 'occurrence_key', v_key)
          ) RETURNING * INTO v_trigger;
        INSERT INTO public.automation_runs(
          owner_user_id, trigger_inbox_id, recipe_version_id, configuration_sha256, correlation_id,
          idempotency_key, request_sha256, requested_by_user_id, requested_by_kind
        ) VALUES (
          v_schedule.owner_user_id, v_trigger.id, v_schedule.recipe_version_id, v_schedule.configuration_sha256,
          v_trigger.correlation_id, 'schedule:' || v_schedule.id::text || ':' || v_key,
          encode(extensions.digest(('schedule:' || v_schedule.id::text || ':' || v_key), 'sha256'), 'hex'),
          v_schedule.created_by_user_id, 'owner'
        ) RETURNING * INTO v_run;
        INSERT INTO public.automation_work_items(
          owner_user_id, run_id, sequence, recipe_action_key, action_code, input, input_sha256, provider_code, due_at
        ) VALUES (
          v_schedule.owner_user_id, v_run.id, 1, v_schedule.recipe_action_key, v_schedule.action_code,
          v_schedule.input, v_schedule.input_sha256, 'INTERNAL', v_schedule.next_occurrence_at
        ) RETURNING id INTO v_work;
        INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, run_id, work_item_id, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, actor_user_id, source_code)
          VALUES (v_schedule.owner_user_id, v_trigger.correlation_id, v_run.id, v_work, 'POL_ADMISSION', 'V1', 'ALLOW', 'SCHEDULE_MATERIALIZED', v_schedule.input_sha256, v_schedule.created_by_user_id, 'schedule');
        INSERT INTO public.automation_claim_fairness(owner_user_id) VALUES (v_schedule.owner_user_id) ON CONFLICT DO NOTHING;
        UPDATE public.automation_trigger_inbox SET run_id = v_run.id, status = 'PROCESSED', processed_at = now() WHERE id = v_trigger.id;
        UPDATE public.automation_schedule_occurrences SET run_id = v_run.id, work_item_id = v_work WHERE id = v_occurrence.id;
        PERFORM public.automation_append_event(v_schedule.owner_user_id, v_run.id, v_work, v_trigger.correlation_id,
          'SCHEDULE_MATERIALIZED', v_schedule.action_code, v_schedule.created_by_user_id, 'schedule', NULL, 'WAITING', 'SCHEDULE_MATERIALIZED',
          jsonb_build_object('schedule_id', v_schedule.id, 'occurrence_key', v_key));
        RETURN NEXT jsonb_build_object('schedule_id', v_schedule.id, 'occurrence_key', v_key, 'run_id', v_run.id, 'work_item_id', v_work);
      END IF;
      v_local_date := (v_schedule.next_occurrence_at AT TIME ZONE v_schedule.timezone)::date + 1;
      v_next := ((v_local_date + v_schedule.local_time) AT TIME ZONE v_schedule.timezone);
      UPDATE public.automation_schedules
         SET last_materialized_occurrence_key = v_key, next_occurrence_at = v_next, updated_at = now()
       WHERE id = v_schedule.id
       RETURNING * INTO v_schedule;
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
END;
$$;

CREATE FUNCTION public.automation_heartbeat_work(
  p_work uuid, p_worker text, p_token uuid, p_lease_seconds integer DEFAULT 60
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE;
BEGIN
  IF p_worker IS NULL OR char_length(btrim(p_worker)) NOT BETWEEN 1 AND 120 OR p_lease_seconds NOT BETWEEN 10 AND 3600 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  SELECT * INTO v_work FROM public.automation_work_items WHERE id = p_work FOR UPDATE;
  IF NOT found OR v_work.state <> 'RUNNING' OR v_work.lease_owner <> p_worker
     OR v_work.lease_token <> p_token OR v_work.lease_until <= now() THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_LEASE_LOST';
  END IF;
  UPDATE public.automation_work_items SET lease_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
   WHERE id = p_work RETURNING * INTO v_work;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = v_work.owner_user_id AND id = v_work.run_id;
  PERFORM public.automation_append_event(v_work.owner_user_id, v_work.run_id, v_work.id, v_run.correlation_id,
    'LEASE_HEARTBEAT', v_work.action_code, NULL, 'worker', 'RUNNING', 'RUNNING', NULL, '{}'::jsonb);
  RETURN jsonb_build_object('work_item_id', v_work.id, 'lease_until', v_work.lease_until);
END;
$$;

CREATE FUNCTION public.automation_create_dependent_work(
  p_owner uuid, p_parent uuid, p_sequence integer, p_input jsonb, p_due timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_parent public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_work uuid;
BEGIN
  IF p_sequence NOT BETWEEN 2 AND 10000 OR jsonb_typeof(p_input) <> 'object' OR octet_length(p_input::text) > 65536 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  SELECT * INTO v_parent FROM public.automation_work_items
   WHERE owner_user_id = p_owner AND id = p_parent FOR UPDATE;
  IF NOT found OR v_parent.state <> 'COMPLETED' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_DEPENDENCY_NOT_COMPLETED';
  END IF;
  IF (SELECT count(*) FROM public.automation_work_items WHERE owner_user_id = p_owner AND dependency_work_item_id = p_parent) >= 25 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_FANOUT_LIMIT';
  END IF;
  INSERT INTO public.automation_work_items(
    owner_user_id, run_id, sequence, dependency_work_item_id, recipe_action_key, action_code,
    input, input_sha256, provider_code, due_at
  ) VALUES (
    p_owner, v_parent.run_id, p_sequence, p_parent, v_parent.recipe_action_key, v_parent.action_code,
    p_input, encode(extensions.digest(p_input::text, 'sha256'), 'hex'), v_parent.provider_code, p_due
  ) ON CONFLICT (owner_user_id, run_id, sequence) DO NOTHING RETURNING id INTO v_work;
  IF NOT found THEN
    SELECT id INTO v_work FROM public.automation_work_items WHERE owner_user_id = p_owner AND run_id = v_parent.run_id AND sequence = p_sequence;
    RETURN jsonb_build_object('work_item_id', v_work, 'replayed', true);
  END IF;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = p_owner AND id = v_parent.run_id;
  PERFORM public.automation_recompute_run(p_owner, v_parent.run_id);
  PERFORM public.automation_append_event(p_owner, v_parent.run_id, v_work, v_run.correlation_id,
    'DEPENDENT_WORK_CREATED', v_parent.action_code, NULL, 'worker', NULL, 'WAITING', 'DEPENDENCY_COMPLETED',
    jsonb_build_object('parent_work_item_id', p_parent));
  RETURN jsonb_build_object('work_item_id', v_work, 'replayed', false);
END;
$$;

CREATE FUNCTION public.automation_resolve_human_review(
  p_owner uuid, p_work uuid, p_actor uuid, p_decision text, p_reason text, p_idempotency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_next text; v_operation public.automation_control_operations%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('RESUME','FAIL','CANCEL') OR p_reason !~ '^[A-Z0-9_]{3,100}$'
     OR p_idempotency !~ '^[A-Za-z0-9._:-]{16,200}$' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  PERFORM 1 FROM public.users WHERE id = p_actor AND id = p_owner AND role = 'client' AND status = 'active';
  IF NOT found THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_REVIEW_DENIED'; END IF;
  SELECT * INTO v_operation FROM public.automation_control_operations
   WHERE owner_user_id = p_owner AND idempotency_key = p_idempotency FOR UPDATE;
  IF found THEN
    IF v_operation.work_item_id <> p_work OR v_operation.operation_code <> ('REVIEW_' || p_decision) OR v_operation.reason_code <> p_reason THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_IDEMPOTENCY_CONFLICT';
    END IF;
    SELECT * INTO v_work FROM public.automation_work_items WHERE owner_user_id = p_owner AND id = p_work;
    RETURN jsonb_build_object('work_item_id', p_work, 'state', v_work.state, 'replayed', true);
  END IF;
  SELECT * INTO v_work FROM public.automation_work_items WHERE owner_user_id = p_owner AND id = p_work FOR UPDATE;
  IF NOT found OR v_work.state <> 'HUMAN_REVIEW' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_REVIEW_STATE_INVALID';
  END IF;
  v_next := CASE p_decision WHEN 'RESUME' THEN 'WAITING' WHEN 'FAIL' THEN 'FAILED' ELSE 'CANCELLED' END;
  PERFORM public.automation_release_work_reservations(v_work.id, false);
  UPDATE public.automation_work_items SET state = v_next, due_at = CASE WHEN v_next = 'WAITING' THEN now() ELSE due_at END,
    lease_owner = NULL, lease_token = NULL, lease_until = NULL, last_reason_code = p_reason,
    completed_at = CASE WHEN v_next IN ('FAILED','CANCELLED') THEN now() ELSE NULL END, updated_at = now()
   WHERE id = v_work.id;
  INSERT INTO public.automation_control_operations(owner_user_id, work_item_id, idempotency_key, operation_code, reason_code, actor_user_id)
    VALUES (p_owner, p_work, p_idempotency, 'REVIEW_' || p_decision, p_reason, p_actor);
  PERFORM public.automation_recompute_run(p_owner, v_work.run_id);
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = p_owner AND id = v_work.run_id;
  PERFORM public.automation_append_event(p_owner, v_work.run_id, v_work.id, v_run.correlation_id,
    'HUMAN_REVIEW_RESOLVED', v_work.action_code, p_actor, 'control', 'HUMAN_REVIEW', v_next, p_reason,
    jsonb_build_object('decision', p_decision));
  RETURN jsonb_build_object('work_item_id', p_work, 'state', v_next, 'replayed', false);
END;
$$;

CREATE FUNCTION public.automation_resume_retry(
  p_owner uuid, p_work uuid, p_actor uuid, p_idempotency text, p_reason text DEFAULT 'RETRY_RESUMED'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_employee_ok boolean; v_operation public.automation_control_operations%ROWTYPE;
BEGIN
  IF p_idempotency !~ '^[A-Za-z0-9._:-]{16,200}$' OR p_reason !~ '^[A-Z0-9_]{3,100}$' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  SELECT * INTO v_operation FROM public.automation_control_operations WHERE owner_user_id = p_owner AND idempotency_key = p_idempotency FOR UPDATE;
  IF found THEN
    IF v_operation.work_item_id <> p_work OR v_operation.operation_code <> 'RETRY_RESUME' THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_IDEMPOTENCY_CONFLICT';
    END IF;
    SELECT * INTO v_work FROM public.automation_work_items WHERE owner_user_id = p_owner AND id = p_work;
    RETURN jsonb_build_object('work_item_id', p_work, 'state', v_work.state, 'replayed', true);
  END IF;
  SELECT * INTO v_work FROM public.automation_work_items WHERE owner_user_id = p_owner AND id = p_work FOR UPDATE;
  IF NOT found OR v_work.state <> 'RETRYABLE' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RETRY_STATE_INVALID'; END IF;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = p_owner AND id = v_work.run_id FOR SHARE;
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = p_actor AND id = p_owner AND role = 'client' AND status = 'active') INTO v_employee_ok;
  IF NOT v_employee_ok THEN
    SELECT EXISTS(
      SELECT 1 FROM public.users u JOIN public.automation_recipe_assignments a ON a.employee_user_id = u.id
       WHERE u.id = p_actor AND u.role = 'employee' AND u.status = 'active' AND u.portal_owner_user_id = p_owner
         AND a.id = v_run.recipe_assignment_id AND a.status = 'ACTIVE' AND v_run.requested_by_user_id = p_actor
    ) INTO v_employee_ok;
  END IF;
  IF NOT v_employee_ok THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RETRY_DENIED'; END IF;
  UPDATE public.automation_work_items SET state = 'WAITING', due_at = now(), last_reason_code = p_reason, updated_at = now() WHERE id = p_work;
  INSERT INTO public.automation_control_operations(owner_user_id, work_item_id, idempotency_key, operation_code, reason_code, actor_user_id)
    VALUES (p_owner, p_work, p_idempotency, 'RETRY_RESUME', p_reason, p_actor);
  PERFORM public.automation_recompute_run(p_owner, v_work.run_id);
  PERFORM public.automation_append_event(p_owner, v_work.run_id, v_work.id, v_run.correlation_id,
    'RETRY_RESUMED', v_work.action_code, p_actor, 'control', 'RETRYABLE', 'WAITING', p_reason, '{}'::jsonb);
  RETURN jsonb_build_object('work_item_id', p_work, 'state', 'WAITING', 'replayed', false);
END;
$$;

CREATE FUNCTION public.automation_check_compatibility(p_registry text, p_worker text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_contract public.automation_execution_contract%ROWTYPE;
BEGIN
  SELECT * INTO v_contract FROM public.automation_execution_contract WHERE singleton = true;
  IF NOT found OR p_registry <> v_contract.registry_version OR p_worker <> v_contract.worker_version THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_COMPATIBILITY_MISMATCH';
  END IF;
  RETURN jsonb_build_object('ready', true, 'schema_version', v_contract.schema_version,
    'registry_version', v_contract.registry_version, 'worker_version', v_contract.worker_version);
END;
$$;

ALTER TABLE public.automation_execution_contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_schedule_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_control_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_execution_contract, public.automation_schedules,
  public.automation_schedule_occurrences, public.automation_control_operations
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.automation_execution_contract, public.automation_schedules,
  public.automation_schedule_occurrences, public.automation_control_operations TO service_role;
REVOKE ALL ON FUNCTION
  public.automation_create_daily_schedule(uuid,uuid,uuid,text,text,jsonb,text,time),
  public.automation_materialize_schedules(integer),
  public.automation_heartbeat_work(uuid,text,uuid,integer),
  public.automation_create_dependent_work(uuid,uuid,integer,jsonb,timestamptz),
  public.automation_resolve_human_review(uuid,uuid,uuid,text,text,text),
  public.automation_resume_retry(uuid,uuid,uuid,text,text),
  public.automation_check_compatibility(text,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.automation_create_daily_schedule(uuid,uuid,uuid,text,text,jsonb,text,time),
  public.automation_materialize_schedules(integer),
  public.automation_heartbeat_work(uuid,text,uuid,integer),
  public.automation_create_dependent_work(uuid,uuid,integer,jsonb,timestamptz),
  public.automation_resolve_human_review(uuid,uuid,uuid,text,text,text),
  public.automation_resume_retry(uuid,uuid,uuid,text,text),
  public.automation_check_compatibility(text,text)
TO service_role;
COMMIT;
