-- Core Automation Engine completion over the existing durable control plane.
-- Adds no queue, worker, scheduler, execution store, or parallel state machine.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Workflow lifecycle is four-state. Review and approval remain version-governance states.
UPDATE public.automation_recipes SET status = 'DRAFT' WHERE status IN ('REVIEW', 'APPROVED');
ALTER TABLE public.automation_recipes DROP CONSTRAINT IF EXISTS automation_recipes_status_check;
ALTER TABLE public.automation_recipes ADD CONSTRAINT automation_recipes_status_check
  CHECK (status IN ('DRAFT','ACTIVE','PAUSED','ARCHIVED'));

ALTER TABLE public.automation_schedules ADD COLUMN recipe_code text;
ALTER TABLE public.automation_schedules ADD COLUMN disabled_reason_code text
  CHECK (disabled_reason_code IS NULL OR disabled_reason_code ~ '^[A-Z0-9_]{3,100}$');
ALTER TABLE public.automation_schedules ADD COLUMN disabled_at timestamptz;
UPDATE public.automation_schedules s SET recipe_code = r.code
  FROM public.automation_recipe_versions rv
  JOIN public.automation_recipes r ON r.owner_user_id = rv.owner_user_id AND r.id = rv.recipe_id
 WHERE rv.owner_user_id = s.owner_user_id AND rv.id = s.recipe_version_id;
ALTER TABLE public.automation_schedules ALTER COLUMN recipe_code SET NOT NULL;
ALTER TABLE public.automation_schedules ADD CONSTRAINT automation_schedules_recipe_code_check
  CHECK (recipe_code ~ '^RCP_[A-Z0-9_]{3,60}$');
ALTER TABLE public.automation_schedules DROP CONSTRAINT IF EXISTS automation_schedules_action_code_check;
ALTER TABLE public.automation_schedules ADD CONSTRAINT automation_schedules_action_code_check
  CHECK (action_code IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY','ACT_APOLLO_SEARCH'));

-- A deferred successor is durable continuation state, not another queue. It points to the
-- completed parent and can produce only the next version-pinned automation_work_item.
CREATE TABLE public.automation_deferred_successors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  parent_work_item_id uuid NOT NULL,
  next_sequence integer NOT NULL CHECK (next_sequence BETWEEN 2 AND 100),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','MATERIALIZED','CANCELLED','TERMINATED')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{3,100}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (owner_user_id, run_id, parent_work_item_id),
  FOREIGN KEY (owner_user_id, run_id) REFERENCES public.automation_runs(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, parent_work_item_id) REFERENCES public.automation_work_items(owner_user_id, id) ON DELETE RESTRICT
);
CREATE INDEX automation_deferred_successors_pending_idx
  ON public.automation_deferred_successors(owner_user_id, run_id, next_sequence) WHERE status = 'PENDING';
ALTER TABLE public.automation_deferred_successors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_deferred_successors FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.automation_deferred_successors TO service_role;

-- Running work is permanently bound to the admission-time workflow version, trigger,
-- request identity, correlation, tenant, and authorization snapshot.
CREATE FUNCTION public.automation_run_binding_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RUN_BINDING_IMMUTABLE'; END IF;
  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.trigger_inbox_id IS DISTINCT FROM NEW.trigger_inbox_id
     OR OLD.recipe_version_id IS DISTINCT FROM NEW.recipe_version_id
     OR OLD.configuration_sha256 IS DISTINCT FROM NEW.configuration_sha256
     OR OLD.recipe_assignment_id IS DISTINCT FROM NEW.recipe_assignment_id
     OR OLD.assignment_allowed_inputs_sha256 IS DISTINCT FROM NEW.assignment_allowed_inputs_sha256
     OR OLD.correlation_id IS DISTINCT FROM NEW.correlation_id
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR OLD.request_sha256 IS DISTINCT FROM NEW.request_sha256
     OR OLD.requested_by_user_id IS DISTINCT FROM NEW.requested_by_user_id
     OR OLD.requested_by_kind IS DISTINCT FROM NEW.requested_by_kind
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RUN_BINDING_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER automation_runs_binding_immutable
  BEFORE UPDATE OR DELETE ON public.automation_runs
  FOR EACH ROW EXECUTE FUNCTION public.automation_run_binding_guard();

-- Terminal recomputation includes an individually cancelled reviewed step, while whole-run
-- cancellation continues to take precedence through cancelled_at.
CREATE OR REPLACE FUNCTION public.automation_recompute_run(p_owner uuid, p_run uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_state text; v_total integer; v_completed integer; v_failed integer; v_cancelled integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE state='COMPLETED'), count(*) FILTER (WHERE state='FAILED'), count(*) FILTER (WHERE state='CANCELLED')
    INTO v_total,v_completed,v_failed,v_cancelled FROM public.automation_work_items WHERE owner_user_id=p_owner AND run_id=p_run;
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.automation_runs WHERE owner_user_id=p_owner AND id=p_run AND cancelled_at IS NOT NULL) THEN 'CANCELLED'
    WHEN EXISTS (SELECT 1 FROM public.automation_deferred_successors WHERE owner_user_id=p_owner AND run_id=p_run AND status='PENDING') THEN 'WAITING'
    WHEN v_total>0 AND v_completed=v_total THEN 'COMPLETED'
    WHEN v_cancelled>0 AND v_completed+v_failed+v_cancelled=v_total THEN 'CANCELLED'
    WHEN v_failed>0 AND v_failed+v_completed=v_total THEN 'FAILED'
    WHEN EXISTS (SELECT 1 FROM public.automation_work_items WHERE owner_user_id=p_owner AND run_id=p_run AND state='HUMAN_REVIEW') THEN 'HUMAN_REVIEW'
    WHEN EXISTS (SELECT 1 FROM public.automation_work_items WHERE owner_user_id=p_owner AND run_id=p_run AND state='RUNNING') THEN 'RUNNING'
    WHEN EXISTS (SELECT 1 FROM public.automation_work_items WHERE owner_user_id=p_owner AND run_id=p_run AND state='RETRYABLE') THEN 'RETRYABLE'
    WHEN EXISTS (SELECT 1 FROM public.automation_work_items WHERE owner_user_id=p_owner AND run_id=p_run AND state='BLOCKED') THEN 'BLOCKED'
    ELSE 'WAITING' END INTO v_state;
  UPDATE public.automation_runs SET state=v_state,
    started_at=CASE WHEN v_state='RUNNING' THEN coalesce(started_at,now()) ELSE started_at END,
    completed_at=CASE WHEN v_state IN ('COMPLETED','FAILED','CANCELLED') THEN coalesce(completed_at,now()) ELSE NULL END,
    updated_at=now()
   WHERE owner_user_id=p_owner AND id=p_run AND state NOT IN ('COMPLETED','FAILED','CANCELLED');
  RETURN v_state;
END;
$$;

-- This is the only recipe successor compiler. It reads the run-pinned immutable version,
-- evaluates the bounded condition, and inserts at most one existing queue item.
CREATE FUNCTION public.automation_materialize_recipe_successor(p_owner uuid,p_run uuid,p_parent uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.automation_runs%ROWTYPE; v_parent public.automation_work_items%ROWTYPE;
  v_version public.automation_recipe_versions%ROWTYPE; v_recipe public.automation_recipes%ROWTYPE;
  v_next jsonb; v_next_input jsonb; v_condition jsonb; v_work uuid; v_review boolean; v_provider text;
  v_decision jsonb; v_deferred uuid; v_reason text; v_recipe_id uuid;
BEGIN
  SELECT rv.recipe_id INTO v_recipe_id
    FROM public.automation_runs r
    JOIN public.automation_recipe_versions rv ON rv.owner_user_id=r.owner_user_id AND rv.id=r.recipe_version_id
   WHERE r.owner_user_id=p_owner AND r.id=p_run;
  IF NOT found THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RUN_NOT_FOUND'; END IF;
  SELECT * INTO v_recipe FROM public.automation_recipes WHERE owner_user_id=p_owner AND id=v_recipe_id FOR SHARE;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=p_owner AND id=p_run FOR UPDATE;
  IF NOT found THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RUN_NOT_FOUND'; END IF;
  SELECT * INTO v_parent FROM public.automation_work_items WHERE owner_user_id=p_owner AND id=p_parent AND run_id=p_run FOR UPDATE;
  IF NOT found OR v_parent.state<>'COMPLETED' THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_DEPENDENCY_NOT_COMPLETED'; END IF;
  SELECT * INTO v_version FROM public.automation_recipe_versions WHERE owner_user_id=p_owner AND id=v_run.recipe_version_id FOR SHARE;
  IF jsonb_typeof(v_version.definition->'steps') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('outcome','FINAL'); END IF;
  SELECT value INTO v_next FROM jsonb_array_elements(v_version.definition->'steps') WHERE (value->>'sequence')::integer=v_parent.sequence+1;
  IF v_next IS NULL THEN RETURN jsonb_build_object('outcome','FINAL'); END IF;
  IF v_next->>'dependsOn' IS DISTINCT FROM v_parent.recipe_action_key THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RECIPE_COMPILATION_INVALID'; END IF;
  IF v_next ? 'condition' THEN
    v_condition:=v_next->'condition';
    IF NOT (v_parent.result_metadata ? (v_condition->>'field') AND v_parent.result_metadata->(v_condition->>'field')=v_condition->'equals') THEN
      IF NOT EXISTS (SELECT 1 FROM public.automation_run_events WHERE owner_user_id=p_owner AND run_id=p_run AND work_item_id=p_parent AND event_code='RECIPE_CONDITION_NOT_MET') THEN
        PERFORM public.automation_append_event(p_owner,p_run,p_parent,v_run.correlation_id,'RECIPE_CONDITION_NOT_MET',v_parent.action_code,NULL,'recipe_compiler','COMPLETED','COMPLETED','RESULT_BOOLEAN_EQUALS',jsonb_build_object('next_step_code',v_next->>'stepCode','field',v_condition->>'field'));
      END IF;
      RETURN jsonb_build_object('outcome','CONDITION_FALSE');
    END IF;
  END IF;
  IF v_run.cancelled_at IS NOT NULL OR v_run.state='CANCELLED' THEN
    UPDATE public.automation_deferred_successors SET status='CANCELLED',resolved_at=now(),reason_code='RUN_CANCELLED' WHERE owner_user_id=p_owner AND run_id=p_run AND parent_work_item_id=p_parent AND status='PENDING';
    RETURN jsonb_build_object('outcome','CANCELLED');
  END IF;
  IF v_recipe.status='ARCHIVED' THEN
    UPDATE public.automation_deferred_successors SET status='TERMINATED',resolved_at=now(),reason_code='WORKFLOW_ARCHIVED' WHERE owner_user_id=p_owner AND run_id=p_run AND parent_work_item_id=p_parent AND status='PENDING';
    PERFORM public.automation_append_event(p_owner,p_run,p_parent,v_run.correlation_id,'RECIPE_SUCCESSOR_TERMINATED',v_parent.action_code,NULL,'recipe_compiler','COMPLETED','COMPLETED','WORKFLOW_ARCHIVED',jsonb_build_object('next_step_code',v_next->>'stepCode'));
    RETURN jsonb_build_object('outcome','TERMINATED');
  END IF;
  v_provider:=CASE WHEN v_next->>'actionCode'='ACT_APOLLO_SEARCH' THEN 'APOLLO' ELSE 'INTERNAL' END;
  PERFORM public.automation_lock_controls(p_owner,v_recipe.id,p_run,v_provider);
  v_decision:=public.automation_control_admission(p_owner,v_recipe.id,p_run,v_provider);
  IF v_recipe.status='PAUSED' OR v_decision->>'decision'<>'ALLOW' THEN
    v_reason:=CASE WHEN v_recipe.status='PAUSED' THEN 'WORKFLOW_PAUSED' ELSE coalesce(v_decision->>'reason_code','CONTROL_PAUSED') END;
    INSERT INTO public.automation_deferred_successors(owner_user_id,run_id,parent_work_item_id,next_sequence,reason_code)
      VALUES(p_owner,p_run,p_parent,v_parent.sequence+1,v_reason)
      ON CONFLICT(owner_user_id,run_id,parent_work_item_id) DO NOTHING RETURNING id INTO v_deferred;
    IF found THEN
      PERFORM public.automation_append_event(p_owner,p_run,p_parent,v_run.correlation_id,'RECIPE_SUCCESSOR_DEFERRED',v_parent.action_code,NULL,'recipe_compiler','COMPLETED','COMPLETED',v_reason,jsonb_build_object('next_step_code',v_next->>'stepCode'));
    END IF;
    RETURN jsonb_build_object('outcome','DEFERRED','reason',v_reason);
  END IF;
  IF v_recipe.status<>'ACTIVE' THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RECIPE_NOT_ACTIVE'; END IF;
  v_next_input:=v_next->'input'; v_review:=coalesce((v_next->>'requiresHumanReview')::boolean,false);
  IF v_next->>'actionCode'='ACT_APOLLO_SEARCH' AND NOT public.automation_apollo_search_input_is_valid(v_next_input) THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_APOLLO_INPUT_INVALID'; END IF;
  INSERT INTO public.automation_work_items(owner_user_id,run_id,sequence,dependency_work_item_id,recipe_action_key,action_code,input,input_sha256,state,provider_code,due_at)
    VALUES(p_owner,p_run,v_parent.sequence+1,p_parent,v_next->>'stepCode',v_next->>'actionCode',v_next_input,encode(extensions.digest(v_next_input::text,'sha256'),'hex'),CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,v_provider,now())
    ON CONFLICT(owner_user_id,run_id,sequence) DO NOTHING RETURNING id INTO v_work;
  IF found THEN
    INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,recipe_version_id,configuration_sha256,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code)
      VALUES(p_owner,v_run.correlation_id,p_run,v_work,v_version.id,v_version.configuration_sha256,'POL_APPROVAL','V1',CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'ALLOW' END,CASE WHEN v_review THEN 'RECIPE_HUMAN_REVIEW' ELSE 'RECIPE_APPROVED' END,encode(extensions.digest(v_next_input::text,'sha256'),'hex'),'recipe_compiler');
    UPDATE public.automation_deferred_successors SET status='MATERIALIZED',resolved_at=now(),reason_code='SUCCESSOR_MATERIALIZED' WHERE owner_user_id=p_owner AND run_id=p_run AND parent_work_item_id=p_parent AND status='PENDING';
    PERFORM public.automation_append_event(p_owner,p_run,v_work,v_run.correlation_id,'RECIPE_SUCCESSOR_COMPILED',v_next->>'actionCode',NULL,'recipe_compiler',NULL,CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,CASE WHEN v_next ? 'condition' THEN 'CONDITION_MET' ELSE 'DEPENDENCY_COMPLETED' END,jsonb_build_object('parent_work_item_id',p_parent,'recipe_action_key',v_next->>'stepCode','provider_code',v_provider));
    RETURN jsonb_build_object('outcome','CREATED','work_item_id',v_work);
  END IF;
  UPDATE public.automation_deferred_successors SET status='MATERIALIZED',resolved_at=coalesce(resolved_at,now()),reason_code='SUCCESSOR_MATERIALIZED' WHERE owner_user_id=p_owner AND run_id=p_run AND parent_work_item_id=p_parent AND status='PENDING';
  SELECT id INTO v_work FROM public.automation_work_items WHERE owner_user_id=p_owner AND run_id=p_run AND sequence=v_parent.sequence+1;
  RETURN jsonb_build_object('outcome','REPLAYED','work_item_id',v_work);
END;
$$;

CREATE FUNCTION public.automation_resume_deferred_successors(p_owner uuid DEFAULT NULL,p_recipe uuid DEFAULT NULL,p_run uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pending record; v_count integer:=0; v_result jsonb; v_batch integer;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_VALIDATION_ERROR'; END IF;
  LOOP
    v_batch:=0;
    FOR v_pending IN
      SELECT d.owner_user_id,d.run_id,d.parent_work_item_id
        FROM public.automation_deferred_successors d
        JOIN public.automation_runs r ON r.owner_user_id=d.owner_user_id AND r.id=d.run_id
        JOIN public.automation_recipe_versions rv ON rv.owner_user_id=r.owner_user_id AND rv.id=r.recipe_version_id
        JOIN public.automation_recipes rc ON rc.owner_user_id=rv.owner_user_id AND rc.id=rv.recipe_id
       WHERE d.status='PENDING' AND (p_owner IS NULL OR d.owner_user_id=p_owner)
         AND (p_recipe IS NULL OR rv.recipe_id=p_recipe) AND (p_run IS NULL OR d.run_id=p_run)
         AND (r.cancelled_at IS NOT NULL OR rc.status='ARCHIVED' OR
              (rc.status='ACTIVE' AND (public.automation_control_admission(d.owner_user_id,rv.recipe_id,d.run_id,
                (SELECT parent.provider_code FROM public.automation_work_items parent WHERE parent.owner_user_id=d.owner_user_id AND parent.id=d.parent_work_item_id))->>'decision')='ALLOW'))
       ORDER BY d.created_at,d.id LIMIT p_limit FOR UPDATE OF d SKIP LOCKED
    LOOP
      v_batch:=v_batch+1;
      v_result:=public.automation_materialize_recipe_successor(v_pending.owner_user_id,v_pending.run_id,v_pending.parent_work_item_id);
      IF v_result->>'outcome' IN ('CREATED','REPLAYED') THEN v_count:=v_count+1; END IF;
      PERFORM public.automation_recompute_run(v_pending.owner_user_id,v_pending.run_id);
    END LOOP;
    EXIT WHEN v_batch<p_limit;
  END LOOP;
  UPDATE public.automation_work_items w SET due_at=least(w.due_at,now()),updated_at=now()
    FROM public.automation_runs r JOIN public.automation_recipe_versions rv ON rv.owner_user_id=r.owner_user_id AND rv.id=r.recipe_version_id
   WHERE w.owner_user_id=r.owner_user_id AND w.run_id=r.id AND w.state IN ('WAITING','RETRYABLE')
     AND (p_owner IS NULL OR w.owner_user_id=p_owner) AND (p_recipe IS NULL OR rv.recipe_id=p_recipe) AND (p_run IS NULL OR r.id=p_run)
     AND (public.automation_control_admission(w.owner_user_id,rv.recipe_id,r.id,w.provider_code)->>'decision')='ALLOW'
     AND EXISTS (
       SELECT 1 FROM public.automation_run_events e
        WHERE e.owner_user_id=w.owner_user_id AND e.run_id=w.run_id AND e.work_item_id=w.id
          AND e.event_code='CONTROL_WAIT'
          AND e.event_sequence=(SELECT max(latest.event_sequence) FROM public.automation_run_events latest
                                 WHERE latest.owner_user_id=w.owner_user_id AND latest.run_id=w.run_id AND latest.work_item_id=w.id)
     );
  RETURN v_count;
END;
$$;

-- Deferred continuations are drained after lifecycle activation and by the existing
-- scheduler tick. Control mutations never synchronously acquire recipe/run/work locks,
-- avoiding control-to-execution lock inversion; existing delayed work remains retryable.

-- Successor compilation is explicit after the parent transition event. Completion and
-- lifecycle both acquire recipe before run, then work, so resume cannot invert locks.
DROP TRIGGER IF EXISTS automation_recipe_compile_successor_before_complete ON public.automation_work_items;
CREATE OR REPLACE FUNCTION public.automation_transition_work(p_work uuid,p_worker text,p_token uuid,p_expected text,p_next text,p_reason text,p_result jsonb DEFAULT '{}'::jsonb,p_due timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_run_id uuid; v_owner uuid; v_previous text; v_recipe_id uuid;
BEGIN
  IF p_expected<>'RUNNING' OR p_next NOT IN ('WAITING','COMPLETED','RETRYABLE','FAILED','BLOCKED','CANCELLED','HUMAN_REVIEW') OR jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>16384 THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_TRANSITION_INVALID'; END IF;
  SELECT w.owner_user_id,w.run_id,rv.recipe_id INTO v_owner,v_run_id,v_recipe_id
    FROM public.automation_work_items w
    JOIN public.automation_runs r ON r.owner_user_id=w.owner_user_id AND r.id=w.run_id
    JOIN public.automation_recipe_versions rv ON rv.owner_user_id=r.owner_user_id AND rv.id=r.recipe_version_id
   WHERE w.id=p_work;
  IF NOT found THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LEASE_LOST'; END IF;
  PERFORM 1 FROM public.automation_recipes WHERE owner_user_id=v_owner AND id=v_recipe_id FOR SHARE;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_owner AND id=v_run_id FOR UPDATE;
  SELECT * INTO v_work FROM public.automation_work_items WHERE owner_user_id=v_owner AND id=p_work FOR UPDATE;
  v_previous:=v_work.state;
  IF v_run.cancelled_at IS NOT NULL OR v_work.state<>p_expected OR v_work.lease_owner<>p_worker OR v_work.lease_token<>p_token OR v_work.lease_until<=now() THEN
    PERFORM public.automation_append_event(v_owner,v_run_id,p_work,v_run.correlation_id,'LATE_RESULT',v_work.action_code,NULL,'worker',v_work.state,v_work.state,'LATE_RESULT',jsonb_build_object('result_sha256',encode(extensions.digest(p_result::text,'sha256'),'hex')));
    RETURN jsonb_build_object('work_item_id',p_work,'state',v_work.state,'late',true);
  END IF;
  IF p_next='RETRYABLE' AND v_work.attempt_count>=v_work.max_attempts THEN p_next:='FAILED'; p_reason:='ATTEMPTS_EXHAUSTED'; IF v_work.provider_code='APOLLO' THEN p_result:=jsonb_build_object('provider','APOLLO','outcome','TERMINAL_FAILURE','completeness','UNKNOWN','providerCorrelationId',v_work.provider_correlation_id,'code',p_reason); END IF; END IF;
  IF v_work.provider_code='APOLLO' AND p_next IN ('COMPLETED','RETRYABLE','FAILED','HUMAN_REVIEW') THEN PERFORM public.automation_assert_apollo_result(p_next,p_result); END IF;
  PERFORM public.automation_release_work_reservations(v_work.id,p_next='COMPLETED');
  UPDATE public.automation_work_items SET state=p_next,attempt_phase='RESULT_RECORDED',lease_owner=NULL,lease_token=NULL,lease_until=NULL,due_at=coalesce(p_due,due_at),last_reason_code=p_reason,result_metadata=p_result,completed_at=CASE WHEN p_next IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE NULL END,updated_at=now() WHERE id=p_work RETURNING * INTO v_work;
  PERFORM public.automation_append_event(v_owner,v_run_id,p_work,v_run.correlation_id,'WORK_TRANSITION',v_work.action_code,NULL,'worker',v_previous,p_next,p_reason,'{}'::jsonb);
  IF p_next='COMPLETED' THEN PERFORM public.automation_materialize_recipe_successor(v_owner,v_run_id,p_work); END IF;
  PERFORM public.automation_recompute_run(v_owner,v_run_id);
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_owner AND id=v_run_id;
  RETURN jsonb_build_object('work_item_id',p_work,'state',v_work.state,'run_state',v_run.state);
END;
$$;

-- Version review/approval never changes workflow state. Activation, pause, resume, and
-- archive are explicit four-state transitions with durable lifecycle/control evidence.
CREATE OR REPLACE FUNCTION public.automation_transition_recipe_lifecycle(p_owner uuid,p_actor uuid,p_recipe uuid,p_recipe_version uuid,p_transition text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_recipe public.automation_recipes%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE; v_previous text; v_next text; v_active public.automation_recipe_activations%ROWTYPE;
BEGIN
  IF p_transition NOT IN ('SUBMIT_REVIEW','APPROVE','ACTIVATE','PAUSE','ARCHIVE') THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_VALIDATION_ERROR'; END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner,p_actor);
  SELECT * INTO v_recipe FROM public.automation_recipes WHERE owner_user_id=p_owner AND id=p_recipe FOR UPDATE;
  SELECT * INTO v_version FROM public.automation_recipe_versions WHERE owner_user_id=p_owner AND id=p_recipe_version AND recipe_id=p_recipe FOR UPDATE;
  IF NOT found THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RECIPE_VERSION_NOT_FOUND'; END IF;
  v_previous:=v_recipe.status; v_next:=v_previous;
  IF p_transition='SUBMIT_REVIEW' THEN
    IF v_recipe.status NOT IN ('DRAFT','ACTIVE','PAUSED') OR v_version.status<>'DRAFT' THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LIFECYCLE_INVALID'; END IF;
    UPDATE public.automation_recipe_versions SET status='REVIEW' WHERE id=v_version.id;
  ELSIF p_transition='APPROVE' THEN
    IF v_recipe.status NOT IN ('DRAFT','ACTIVE','PAUSED') OR v_version.status<>'REVIEW' THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LIFECYCLE_INVALID'; END IF;
    UPDATE public.automation_recipe_versions SET status='APPROVED',approved_at=now(),approved_by_user_id=p_actor WHERE id=v_version.id;
  ELSIF p_transition='ACTIVATE' THEN
    IF v_version.status<>'APPROVED' OR v_recipe.status NOT IN ('DRAFT','PAUSED','ACTIVE') THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LIFECYCLE_INVALID'; END IF;
    SELECT * INTO v_active FROM public.automation_recipe_activations WHERE owner_user_id=p_owner AND recipe_id=p_recipe AND status='ACTIVE' FOR UPDATE;
    IF v_recipe.status='ACTIVE' AND found AND v_active.recipe_version_id=p_recipe_version THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LIFECYCLE_INVALID'; END IF;
    UPDATE public.automation_recipe_activations SET status='SUPERSEDED',deactivated_at=now() WHERE owner_user_id=p_owner AND recipe_id=p_recipe AND status='ACTIVE';
    IF v_recipe.status='PAUSED' AND EXISTS (SELECT 1 FROM public.automation_recipe_activations WHERE owner_user_id=p_owner AND recipe_id=p_recipe AND recipe_version_id=p_recipe_version AND status='PAUSED') THEN
      UPDATE public.automation_recipe_activations SET status='ACTIVE',deactivated_at=NULL WHERE owner_user_id=p_owner AND recipe_id=p_recipe AND recipe_version_id=p_recipe_version AND status='PAUSED';
    ELSE
      UPDATE public.automation_recipe_activations SET status='SUPERSEDED' WHERE owner_user_id=p_owner AND recipe_id=p_recipe AND status='PAUSED';
      INSERT INTO public.automation_recipe_activations(owner_user_id,recipe_id,recipe_version_id,status,activated_by_user_id) VALUES(p_owner,p_recipe,p_recipe_version,'ACTIVE',p_actor);
    END IF;
    UPDATE public.automation_recipes SET status='ACTIVE',updated_at=now() WHERE id=p_recipe; v_next:='ACTIVE';
    UPDATE public.automation_controls SET paused=false,emergency_stop=false,reason_code='WORKFLOW_RESUMED',actor_user_id=p_actor,updated_at=now() WHERE owner_user_id=p_owner AND scope_type='RECIPE' AND scope_id=p_recipe::text AND paused AND NOT emergency_stop;
    PERFORM public.automation_resume_deferred_successors(p_owner,p_recipe,NULL,1000);
  ELSIF p_transition='PAUSE' THEN
    IF v_recipe.status<>'ACTIVE' OR NOT EXISTS (SELECT 1 FROM public.automation_recipe_activations WHERE owner_user_id=p_owner AND recipe_id=p_recipe AND recipe_version_id=p_recipe_version AND status='ACTIVE') THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LIFECYCLE_INVALID'; END IF;
    UPDATE public.automation_recipe_activations SET status='PAUSED',deactivated_at=now() WHERE owner_user_id=p_owner AND recipe_id=p_recipe AND status='ACTIVE';
    UPDATE public.automation_recipes SET status='PAUSED',updated_at=now() WHERE id=p_recipe; v_next:='PAUSED';
    INSERT INTO public.automation_controls(owner_user_id,scope_type,scope_id,paused,emergency_stop,reason_code,actor_user_id) VALUES(p_owner,'RECIPE',p_recipe::text,true,false,'WORKFLOW_PAUSED',p_actor)
      ON CONFLICT(owner_user_id,scope_type,scope_id) DO UPDATE SET paused=true,reason_code='WORKFLOW_PAUSED',actor_user_id=p_actor,updated_at=now();
  ELSE
    IF v_recipe.status NOT IN ('DRAFT','PAUSED') THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LIFECYCLE_INVALID'; END IF;
    UPDATE public.automation_recipe_activations SET status='ARCHIVED',deactivated_at=coalesce(deactivated_at,now()) WHERE owner_user_id=p_owner AND recipe_id=p_recipe AND status='PAUSED';
    UPDATE public.automation_recipes SET status='ARCHIVED',updated_at=now() WHERE id=p_recipe; v_next:='ARCHIVED';
    PERFORM public.automation_resume_deferred_successors(p_owner,p_recipe,NULL,1000);
  END IF;
  INSERT INTO public.automation_recipe_lifecycle_events(owner_user_id,recipe_id,recipe_version_id,previous_status,next_status,transition_code,actor_user_id)
    VALUES(p_owner,p_recipe,p_recipe_version,v_previous,v_next,p_transition,p_actor);
  RETURN jsonb_build_object('recipe_id',p_recipe,'recipe_version_id',p_recipe_version,'status',v_next,'version_status',CASE p_transition WHEN 'SUBMIT_REVIEW' THEN 'REVIEW' WHEN 'APPROVE' THEN 'APPROVED' ELSE v_version.status END);
END;
$$;

-- Schedule creation resolves the current active governed workflow. Callers no longer
-- supply a version, configuration hash, action, provider, or policy decision.
CREATE FUNCTION public.automation_create_daily_schedule(p_owner uuid,p_actor uuid,p_recipe_code text,p_input jsonb,p_timezone text,p_local_time time)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_recipe public.automation_recipes%ROWTYPE; v_activation public.automation_recipe_activations%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE; v_root jsonb; v_now_local timestamp; v_next timestamptz; v_schedule public.automation_schedules%ROWTYPE;
BEGIN
  IF p_recipe_code !~ '^RCP_[A-Z0-9_]{3,60}$' OR jsonb_typeof(p_input)<>'object' OR octet_length(p_input::text)>65536 OR p_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone) THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_VALIDATION_ERROR'; END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner,p_actor);
  SELECT * INTO v_recipe FROM public.automation_recipes WHERE owner_user_id=p_owner AND code=p_recipe_code AND status='ACTIVE' FOR SHARE;
  SELECT * INTO v_activation FROM public.automation_recipe_activations WHERE owner_user_id=p_owner AND recipe_id=v_recipe.id AND status='ACTIVE' FOR SHARE;
  SELECT * INTO v_version FROM public.automation_recipe_versions WHERE owner_user_id=p_owner AND id=v_activation.recipe_version_id AND status='APPROVED' FOR SHARE;
  IF NOT found OR v_recipe.id IS NULL OR v_version.id IS NULL THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RECIPE_NOT_ACTIVE'; END IF;
  IF NOT public.automation_recipe_input_is_valid(v_version.definition,p_input) THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RECIPE_INPUT_INVALID'; END IF;
  PERFORM public.automation_assert_recipe_input_resource_ownership(p_owner,v_version.definition,p_input);
  v_root:=v_version.definition->'steps'->0;
  IF v_root->>'actionCode'='ACT_APOLLO_SEARCH' AND NOT public.automation_apollo_search_input_is_valid(p_input) THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_APOLLO_INPUT_INVALID'; END IF;
  v_now_local:=now() AT TIME ZONE p_timezone; v_next:=((v_now_local::date+p_local_time) AT TIME ZONE p_timezone);
  IF v_next<=now() THEN v_next:=(((v_now_local::date+1)+p_local_time) AT TIME ZONE p_timezone); END IF;
  INSERT INTO public.automation_schedules(owner_user_id,recipe_version_id,configuration_sha256,recipe_code,recipe_action_key,action_code,input,input_sha256,timezone,local_time,next_occurrence_at,created_by_user_id)
    VALUES(p_owner,v_version.id,v_version.configuration_sha256,p_recipe_code,v_root->>'stepCode',v_root->>'actionCode',p_input,encode(extensions.digest(p_input::text,'sha256'),'hex'),p_timezone,p_local_time,v_next,p_actor) RETURNING * INTO v_schedule;
  RETURN jsonb_build_object('schedule_id',v_schedule.id,'recipe_code',p_recipe_code,'next_occurrence_at',v_schedule.next_occurrence_at);
END;
$$;

-- Thin source adapter around the same governed admission used by manual and resource
-- triggers. The source rewrite is in the same transaction as admission.
CREATE FUNCTION public.automation_admit_governed_source(p_owner uuid,p_actor uuid,p_source text,p_source_event text,p_recipe_code text,p_input jsonb,p_due_at timestamptz,p_request_hash text,p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_source NOT IN ('SCHEDULE','INTERNAL_RESOURCE_EVENT') OR char_length(btrim(p_source_event)) NOT BETWEEN 1 AND 120 OR jsonb_typeof(p_metadata)<>'object' OR octet_length(p_metadata::text)>8192 THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_TRIGGER_INVALID'; END IF;
  v_result:=public.automation_admit_recipe_run(p_owner,p_actor,'owner',p_recipe_code,p_input,p_due_at,p_source_event,p_request_hash);
  UPDATE public.automation_trigger_inbox SET source_code=p_source,source_event_id=btrim(p_source_event),safe_metadata=p_metadata WHERE owner_user_id=p_owner AND id=(v_result->>'trigger_id')::uuid;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_materialize_schedules(p_limit integer DEFAULT 25)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_schedule public.automation_schedules%ROWTYPE; v_recipe public.automation_recipes%ROWTYPE;
  v_activation public.automation_recipe_activations%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE;
  v_occurrence public.automation_schedule_occurrences%ROWTYPE; v_admission jsonb; v_work public.automation_work_items%ROWTYPE;
  v_root jsonb; v_key text; v_count integer:=0; v_local_date date; v_next timestamptz; v_event text; v_request_hash text; v_failure text;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_VALIDATION_ERROR'; END IF;
  PERFORM public.automation_resume_deferred_successors(NULL,NULL,NULL,1000);
  FOR v_schedule IN SELECT * FROM public.automation_schedules WHERE enabled AND NOT paused AND next_occurrence_at<=now() ORDER BY next_occurrence_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
    BEGIN
      SELECT * INTO v_recipe FROM public.automation_recipes
       WHERE owner_user_id=v_schedule.owner_user_id AND code=v_schedule.recipe_code FOR SHARE;
      IF NOT found OR v_recipe.status IN ('DRAFT','ARCHIVED') THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_SCHEDULE_RECIPE_INACTIVE'; END IF;
      IF v_recipe.status='PAUSED' THEN
        v_next:=(((now() AT TIME ZONE v_schedule.timezone)::date+v_schedule.local_time) AT TIME ZONE v_schedule.timezone);
        IF v_next<=now() THEN v_next:=((((now() AT TIME ZONE v_schedule.timezone)::date+1)+v_schedule.local_time) AT TIME ZONE v_schedule.timezone); END IF;
        UPDATE public.automation_schedules SET next_occurrence_at=v_next,disabled_reason_code='WORKFLOW_PAUSED',disabled_at=NULL,updated_at=now() WHERE id=v_schedule.id;
        CONTINUE;
      END IF;
      SELECT * INTO v_activation FROM public.automation_recipe_activations
       WHERE owner_user_id=v_schedule.owner_user_id AND recipe_id=v_recipe.id AND recipe_version_id=v_schedule.recipe_version_id AND status='ACTIVE' FOR SHARE;
      IF NOT found THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_SCHEDULE_VERSION_SUPERSEDED'; END IF;
      SELECT * INTO v_version FROM public.automation_recipe_versions
       WHERE owner_user_id=v_schedule.owner_user_id AND id=v_schedule.recipe_version_id AND status='APPROVED'
         AND configuration_sha256=v_schedule.configuration_sha256 FOR SHARE;
      IF NOT found THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_SCHEDULE_VERSION_INVALID'; END IF;
      v_root:=v_version.definition->'steps'->0;
      IF v_root IS NULL OR v_root->>'stepCode' IS DISTINCT FROM v_schedule.recipe_action_key
         OR v_root->>'actionCode' IS DISTINCT FROM v_schedule.action_code
         OR encode(extensions.digest(v_schedule.input::text,'sha256'),'hex')<>v_schedule.input_sha256
         OR NOT public.automation_recipe_input_is_valid(v_version.definition,v_schedule.input) THEN
        RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_SCHEDULE_BINDING_INVALID';
      END IF;
      PERFORM public.automation_assert_recipe_input_resource_ownership(v_schedule.owner_user_id,v_version.definition,v_schedule.input);
      IF v_schedule.action_code='ACT_APOLLO_SEARCH' AND NOT public.automation_apollo_search_input_is_valid(v_schedule.input) THEN
        RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_SCHEDULE_BINDING_INVALID';
      END IF;
      WHILE v_schedule.next_occurrence_at<=now() AND v_count<v_schedule.catch_up_limit LOOP
        v_key:=to_char(v_schedule.next_occurrence_at AT TIME ZONE v_schedule.timezone,'YYYY-MM-DD'); v_event:='schedule:'||v_schedule.id::text||':'||v_key;
        INSERT INTO public.automation_schedule_occurrences(owner_user_id,schedule_id,occurrence_key,scheduled_for) VALUES(v_schedule.owner_user_id,v_schedule.id,v_key,v_schedule.next_occurrence_at)
          ON CONFLICT(owner_user_id,schedule_id,occurrence_key) DO NOTHING RETURNING * INTO v_occurrence;
        IF found THEN
          v_request_hash:=encode(extensions.digest(jsonb_build_object('scheduleId',v_schedule.id,'occurrenceKey',v_key,'recipeCode',v_schedule.recipe_code,'recipeVersionId',v_schedule.recipe_version_id,'configurationSha256',v_schedule.configuration_sha256,'inputHash',v_schedule.input_sha256,'dueAt',v_schedule.next_occurrence_at)::text,'sha256'),'hex');
          v_admission:=public.automation_admit_governed_source(v_schedule.owner_user_id,v_schedule.created_by_user_id,'SCHEDULE',v_event,v_schedule.recipe_code,v_schedule.input,v_schedule.next_occurrence_at,v_request_hash,jsonb_build_object('schedule_id',v_schedule.id,'occurrence_key',v_key,'recipe_version_id',v_schedule.recipe_version_id));
          SELECT * INTO v_work FROM public.automation_work_items WHERE owner_user_id=v_schedule.owner_user_id AND run_id=(v_admission->>'run_id')::uuid AND sequence=1;
          IF NOT found OR v_work.action_code<>v_schedule.action_code OR NOT EXISTS (
            SELECT 1 FROM public.automation_runs r WHERE r.owner_user_id=v_schedule.owner_user_id AND r.id=(v_admission->>'run_id')::uuid
              AND r.recipe_version_id=v_schedule.recipe_version_id AND r.configuration_sha256=v_schedule.configuration_sha256
          ) THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_SCHEDULE_PROVENANCE_MISMATCH'; END IF;
          UPDATE public.automation_schedule_occurrences SET run_id=(v_admission->>'run_id')::uuid,work_item_id=v_work.id WHERE id=v_occurrence.id;
          PERFORM public.automation_append_event(v_schedule.owner_user_id,(v_admission->>'run_id')::uuid,v_work.id,(SELECT correlation_id FROM public.automation_runs WHERE owner_user_id=v_schedule.owner_user_id AND id=(v_admission->>'run_id')::uuid),'SCHEDULE_MATERIALIZED',v_work.action_code,v_schedule.created_by_user_id,'schedule',NULL,v_work.state,'SCHEDULE_MATERIALIZED',jsonb_build_object('schedule_id',v_schedule.id,'occurrence_key',v_key,'recipe_version_id',v_schedule.recipe_version_id));
          RETURN NEXT jsonb_build_object('schedule_id',v_schedule.id,'occurrence_key',v_key,'run_id',v_admission->>'run_id','work_item_id',v_work.id);
        END IF;
        v_local_date:=(v_schedule.next_occurrence_at AT TIME ZONE v_schedule.timezone)::date+1; v_next:=((v_local_date+v_schedule.local_time) AT TIME ZONE v_schedule.timezone);
        UPDATE public.automation_schedules SET last_materialized_occurrence_key=v_key,next_occurrence_at=v_next,disabled_reason_code=NULL,disabled_at=NULL,updated_at=now() WHERE id=v_schedule.id RETURNING * INTO v_schedule;
        v_count:=v_count+1;
      END LOOP;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS v_failure=MESSAGE_TEXT;
      UPDATE public.automation_schedules SET enabled=false,paused=false,
        disabled_reason_code=CASE v_failure
          WHEN 'AUTOMATION_SCHEDULE_RECIPE_INACTIVE' THEN 'SCHEDULE_RECIPE_INACTIVE'
          WHEN 'AUTOMATION_SCHEDULE_VERSION_SUPERSEDED' THEN 'SCHEDULE_VERSION_SUPERSEDED'
          WHEN 'AUTOMATION_SCHEDULE_VERSION_INVALID' THEN 'SCHEDULE_VERSION_INVALID'
          WHEN 'AUTOMATION_SCHEDULE_BINDING_INVALID' THEN 'SCHEDULE_BINDING_INVALID'
          WHEN 'AUTOMATION_SCHEDULE_PROVENANCE_MISMATCH' THEN 'SCHEDULE_PROVENANCE_MISMATCH'
          ELSE 'SCHEDULE_ADMISSION_FAILED' END,
        disabled_at=now(),updated_at=now() WHERE id=v_schedule.id;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.automation_run_binding_guard(),public.automation_materialize_recipe_successor(uuid,uuid,uuid),public.automation_resume_deferred_successors(uuid,uuid,uuid,integer),public.automation_admit_governed_source(uuid,uuid,text,text,text,jsonb,timestamptz,text,jsonb),public.automation_create_daily_schedule(uuid,uuid,text,jsonb,text,time) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.automation_create_daily_schedule(uuid,uuid,text,jsonb,text,time) TO service_role;
-- Retire the raw schedule admission surface while preserving its historical function for ledger compatibility.
REVOKE ALL ON FUNCTION public.automation_create_daily_schedule(uuid,uuid,uuid,text,text,jsonb,text,time) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
