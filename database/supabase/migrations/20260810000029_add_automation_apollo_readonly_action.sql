-- Phase 11 Step 6C: one fixed, server-owned, read-only Apollo search action.
-- This extends the existing durable control plane; it creates no queue, worker, scheduler,
-- provider credential store, prospect/CRM ingestion, or outbound communication path.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.automation_work_items DROP CONSTRAINT IF EXISTS automation_work_items_action_code_check;
ALTER TABLE public.automation_work_items DROP CONSTRAINT IF EXISTS automation_work_items_provider_code_check;
ALTER TABLE public.automation_work_items
  ADD CONSTRAINT automation_work_items_action_provider_check CHECK (
    (action_code IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY') AND provider_code = 'INTERNAL')
    OR (action_code = 'ACT_APOLLO_SEARCH' AND provider_code = 'APOLLO')
  );

CREATE OR REPLACE FUNCTION public.automation_apollo_search_input_is_valid(p_input jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_key text; v_value jsonb; v_term jsonb; v_normalized text; v_seen text[];
BEGIN
  IF jsonb_typeof(p_input) <> 'object' OR octet_length(p_input::text) > 8192
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS key WHERE key NOT IN ('titles','locations','industries','limit'))
     OR NOT (p_input ? 'titles' AND p_input ? 'locations' AND p_input ? 'industries' AND p_input ? 'limit')
     OR jsonb_typeof(p_input -> 'titles') <> 'array' OR jsonb_typeof(p_input -> 'locations') <> 'array'
     OR jsonb_typeof(p_input -> 'industries') <> 'array' OR jsonb_typeof(p_input -> 'limit') <> 'number'
     OR (p_input ->> 'limit')::numeric <> trunc((p_input ->> 'limit')::numeric)
     OR (p_input ->> 'limit')::numeric NOT BETWEEN 1 AND 50 THEN
    RETURN false;
  END IF;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_input) WHERE key IN ('titles','locations','industries') LOOP
    IF jsonb_array_length(v_value) NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
    v_seen := ARRAY[]::text[];
    FOR v_term IN SELECT value FROM jsonb_array_elements(v_value) LOOP
      IF jsonb_typeof(v_term) <> 'string' THEN RETURN false; END IF;
      -- Mirrors assertApolloSearchInput(): trim before case-normalized duplicate detection.
      v_normalized := lower(btrim(v_term #>> '{}', E' \t\n\r\f\v'));
      IF char_length(v_normalized) NOT BETWEEN 1 AND 100 OR v_normalized = ANY(v_seen) THEN RETURN false; END IF;
      v_seen := array_append(v_seen, v_normalized);
    END LOOP;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_assert_recipe_definition(p_definition jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_step jsonb; v_property jsonb; v_count integer; v_position integer := 0; v_previous_code text := NULL;
  v_code text; v_sequence integer; v_action text; v_type text; v_required text;
BEGIN
  IF jsonb_typeof(p_definition) IS DISTINCT FROM 'object' OR octet_length(p_definition::text) > 65536
     OR NOT (p_definition ? 'recipeCode') OR NOT (p_definition ? 'inputSchema') OR NOT (p_definition ? 'steps')
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_definition) AS key WHERE key NOT IN ('recipeCode','inputSchema','steps'))
     OR p_definition ->> 'recipeCode' IS NULL OR p_definition ->> 'recipeCode' !~ '^RCP_[A-Z0-9_]{3,60}$'
     OR jsonb_typeof(p_definition -> 'inputSchema') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_definition -> 'steps') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_DEFINITION_INVALID';
  END IF;
  PERFORM public.automation_assert_recipe_safe_json(p_definition);
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_definition -> 'inputSchema') AS key WHERE key NOT IN ('properties','required'))
     OR jsonb_typeof(p_definition -> 'inputSchema' -> 'properties') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_definition -> 'inputSchema' -> 'required') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_SCHEMA_INVALID';
  END IF;
  FOR v_code, v_property IN SELECT key, value FROM jsonb_each(p_definition -> 'inputSchema' -> 'properties') LOOP
    IF v_code IS NULL OR v_code !~ '^[A-Za-z][A-Za-z0-9_]{0,60}$' OR jsonb_typeof(v_property) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_property) AS key WHERE key <> 'type')
       OR (v_property ->> 'type') IS NULL OR (v_property ->> 'type') NOT IN ('string','number','boolean','object','array') THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_SCHEMA_INVALID';
    END IF;
  END LOOP;
  FOR v_required IN SELECT jsonb_array_elements_text(p_definition -> 'inputSchema' -> 'required') LOOP
    IF NOT ((p_definition -> 'inputSchema' -> 'properties') ? v_required) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_SCHEMA_INVALID';
    END IF;
  END LOOP;
  SELECT jsonb_array_length(p_definition -> 'steps') INTO v_count;
  IF v_count NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID'; END IF;
  FOR v_step IN SELECT value FROM jsonb_array_elements(p_definition -> 'steps') LOOP
    v_position := v_position + 1; v_code := v_step ->> 'stepCode'; v_action := v_step ->> 'actionCode';
    IF jsonb_typeof(v_step) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_step) AS key WHERE key NOT IN ('stepCode','sequence','actionCode','dependsOn','input','policies','requiresHumanReview'))
       OR NOT (v_step ? 'stepCode') OR NOT (v_step ? 'sequence') OR NOT (v_step ? 'actionCode') OR NOT (v_step ? 'policies') OR NOT (v_step ? 'requiresHumanReview')
       OR v_code IS NULL OR v_code !~ '^[A-Z][A-Z0-9_]{2,60}$' OR v_action IS NULL OR v_action NOT IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY','ACT_APOLLO_SEARCH')
       OR (v_step ->> 'sequence') IS NULL OR (v_step ->> 'sequence') !~ '^[1-9][0-9]{0,3}$' OR (v_step ->> 'sequence')::integer <> v_position
       OR jsonb_typeof(v_step -> 'policies') IS DISTINCT FROM 'array' OR jsonb_typeof(v_step -> 'requiresHumanReview') IS DISTINCT FROM 'boolean'
       OR (SELECT count(*) FROM jsonb_array_elements(p_definition -> 'steps') AS candidate WHERE candidate ->> 'stepCode' = v_code) <> 1 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID';
    END IF;
    IF v_position = 1 THEN
      IF (v_step ? 'dependsOn') OR (v_step ? 'input') THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID'; END IF;
    ELSIF v_step ->> 'dependsOn' IS DISTINCT FROM v_previous_code OR jsonb_typeof(v_step -> 'input') <> 'object' OR octet_length((v_step -> 'input')::text) > 65536 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_step -> 'policies') AS policy WHERE policy = 'POL_APPROVAL@V1')
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_step -> 'policies') AS policy WHERE policy NOT IN ('POL_APPROVAL@V1','POL_LIMIT@V1'))
       OR (SELECT count(*) FROM jsonb_array_elements_text(v_step -> 'policies')) <> (SELECT count(DISTINCT policy) FROM jsonb_array_elements_text(v_step -> 'policies') AS policy) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_POLICY_INVALID';
    END IF;
    v_previous_code := v_code;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_upsert_recipe_assignment(
  p_owner uuid, p_actor uuid, p_recipe_version uuid, p_employee uuid, p_allowed_inputs jsonb, p_allowed_inputs_hash text, p_status text DEFAULT 'ACTIVE'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_assignment public.automation_recipe_assignments%ROWTYPE; v_key text; v_hash text;
BEGIN
  IF p_status NOT IN ('ACTIVE','PAUSED','REVOKED') OR p_allowed_inputs_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_allowed_inputs) <> 'object' OR octet_length(p_allowed_inputs::text) > 8192 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner, p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.automation_recipe_versions WHERE owner_user_id = p_owner AND id = p_recipe_version AND status = 'APPROVED')
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_employee AND role = 'employee' AND status = 'active' AND portal_owner_user_id = p_owner) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_ASSIGNMENT_SCOPE_DENIED';
  END IF;
  FOR v_key, v_hash IN SELECT key, jsonb_array_elements_text(value) FROM jsonb_each(p_allowed_inputs) LOOP
    IF v_key NOT IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY','ACT_APOLLO_SEARCH') OR v_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_ASSIGNMENT_INVALID'; END IF;
  END LOOP;
  UPDATE public.automation_recipe_assignments SET status = p_status, allowed_inputs = p_allowed_inputs, allowed_inputs_sha256 = p_allowed_inputs_hash, updated_at = now(), revoked_at = CASE WHEN p_status = 'REVOKED' THEN now() ELSE NULL END
   WHERE owner_user_id = p_owner AND recipe_version_id = p_recipe_version AND employee_user_id = p_employee RETURNING * INTO v_assignment;
  IF NOT found THEN
    INSERT INTO public.automation_recipe_assignments(owner_user_id,recipe_version_id,employee_user_id,status,allowed_inputs,allowed_inputs_sha256,created_by_user_id,revoked_at)
      VALUES (p_owner,p_recipe_version,p_employee,p_status,p_allowed_inputs,p_allowed_inputs_hash,p_actor,CASE WHEN p_status = 'REVOKED' THEN now() ELSE NULL END) RETURNING * INTO v_assignment;
  END IF;
  RETURN jsonb_build_object('assignment_id',v_assignment.id,'status',v_assignment.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_admit_recipe_run(
  p_owner uuid, p_actor uuid, p_actor_kind text, p_recipe_code text, p_input jsonb, p_due_at timestamptz, p_idempotency text, p_request_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_recipe public.automation_recipes%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE; v_activation public.automation_recipe_activations%ROWTYPE; v_assignment public.automation_recipe_assignments%ROWTYPE;
  v_trigger public.automation_trigger_inbox%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_root jsonb; v_action text; v_step_code text; v_input_hash text; v_work uuid; v_review boolean; v_policy_decision text; v_provider text;
BEGIN
  IF p_actor_kind NOT IN ('owner','employee') OR p_recipe_code !~ '^RCP_[A-Z0-9_]{3,60}$' OR p_idempotency !~ '^[A-Za-z0-9._:-]{16,200}$' OR p_request_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_input) <> 'object' OR p_due_at IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  SELECT * INTO v_recipe FROM public.automation_recipes WHERE owner_user_id = p_owner AND code = p_recipe_code AND status = 'ACTIVE' FOR SHARE;
  SELECT * INTO v_activation FROM public.automation_recipe_activations WHERE owner_user_id = p_owner AND recipe_id = v_recipe.id AND status = 'ACTIVE' FOR SHARE;
  SELECT * INTO v_version FROM public.automation_recipe_versions WHERE owner_user_id = p_owner AND id = v_activation.recipe_version_id AND status = 'APPROVED' FOR SHARE;
  IF NOT found OR v_recipe.id IS NULL OR v_version.id IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_NOT_ACTIVE'; END IF;
  IF NOT public.automation_recipe_input_is_valid(v_version.definition,p_input) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_INPUT_INVALID'; END IF;
  v_root := v_version.definition -> 'steps' -> 0; v_action := v_root ->> 'actionCode'; v_step_code := v_root ->> 'stepCode';
  v_provider := CASE WHEN v_action = 'ACT_APOLLO_SEARCH' THEN 'APOLLO' ELSE 'INTERNAL' END;
  IF v_action = 'ACT_APOLLO_SEARCH' AND NOT public.automation_apollo_search_input_is_valid(p_input) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_APOLLO_INPUT_INVALID'; END IF;
  v_input_hash := encode(extensions.digest(p_input::text,'sha256'),'hex');
  IF p_actor_kind = 'owner' THEN PERFORM public.automation_assert_recipe_owner(p_owner,p_actor);
  ELSE
    SELECT * INTO v_assignment FROM public.automation_recipe_assignments a JOIN public.users u ON u.id=a.employee_user_id
      WHERE a.owner_user_id=p_owner AND a.recipe_version_id=v_version.id AND a.employee_user_id=p_actor AND a.status='ACTIVE' AND u.role='employee' AND u.status='active' AND u.portal_owner_user_id=p_owner FOR SHARE OF a,u;
    IF NOT found OR NOT ((v_assignment.allowed_inputs -> v_action) ? v_input_hash) THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_EMPLOYEE_SCOPE_DENIED'; END IF;
  END IF;
  SELECT * INTO v_trigger FROM public.automation_trigger_inbox WHERE owner_user_id=p_owner AND source_code='MANUAL' AND source_event_id=p_idempotency FOR UPDATE;
  IF found THEN
    IF v_trigger.payload_sha256 <> p_request_hash THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN jsonb_build_object('trigger_id',v_trigger.id,'run_id',v_trigger.run_id,'replayed',true);
  END IF;
  INSERT INTO public.automation_trigger_inbox(owner_user_id,source_code,source_event_id,payload_sha256,safe_metadata) VALUES (p_owner,'MANUAL',p_idempotency,p_request_hash,jsonb_build_object('recipe_code',p_recipe_code)) RETURNING * INTO v_trigger;
  INSERT INTO public.automation_runs(owner_user_id,trigger_inbox_id,recipe_version_id,configuration_sha256,recipe_assignment_id,assignment_allowed_inputs_sha256,correlation_id,idempotency_key,request_sha256,requested_by_user_id,requested_by_kind)
    VALUES (p_owner,v_trigger.id,v_version.id,v_version.configuration_sha256,CASE WHEN p_actor_kind='employee' THEN v_assignment.id END,CASE WHEN p_actor_kind='employee' THEN v_assignment.allowed_inputs_sha256 END,v_trigger.correlation_id,p_idempotency,p_request_hash,p_actor,p_actor_kind) RETURNING * INTO v_run;
  v_review := coalesce((v_root ->> 'requiresHumanReview')::boolean,false);
  INSERT INTO public.automation_work_items(owner_user_id,run_id,sequence,recipe_action_key,action_code,input,input_sha256,state,provider_code,due_at)
    VALUES (p_owner,v_run.id,1,v_step_code,v_action,p_input,v_input_hash,CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,v_provider,p_due_at) RETURNING id INTO v_work;
  v_policy_decision := CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'ALLOW' END;
  INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,recipe_version_id,configuration_sha256,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,actor_user_id,source_code)
    VALUES (p_owner,v_trigger.correlation_id,v_run.id,v_work,v_version.id,v_version.configuration_sha256,'POL_APPROVAL','V1',v_policy_decision,CASE WHEN v_review THEN 'RECIPE_HUMAN_REVIEW' ELSE 'RECIPE_APPROVED' END,v_input_hash,p_actor,'recipe_admission');
  INSERT INTO public.automation_claim_fairness(owner_user_id) VALUES (p_owner) ON CONFLICT DO NOTHING;
  UPDATE public.automation_trigger_inbox SET run_id=v_run.id,status='PROCESSED',processed_at=now() WHERE id=v_trigger.id;
  PERFORM public.automation_recompute_run(p_owner,v_run.id);
  PERFORM public.automation_append_event(p_owner,v_run.id,v_work,v_trigger.correlation_id,'RECIPE_ADMITTED',v_action,p_actor,'recipe_admission',NULL,CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,CASE WHEN v_review THEN 'RECIPE_HUMAN_REVIEW' ELSE 'RECIPE_APPROVED' END,jsonb_build_object('recipe_code',p_recipe_code,'recipe_version_id',v_version.id,'provider_code',v_provider));
  RETURN jsonb_build_object('trigger_id',v_trigger.id,'run_id',v_run.id,'work_item_id',v_work,'state',CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,'replayed',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_compile_recipe_successor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_run public.automation_runs%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE; v_step jsonb; v_next jsonb; v_next_input jsonb; v_next_work uuid; v_review boolean; v_provider text;
BEGIN
  IF NEW.state <> 'COMPLETED' OR OLD.state = 'COMPLETED' THEN RETURN NEW; END IF;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=NEW.owner_user_id AND id=NEW.run_id FOR SHARE;
  SELECT * INTO v_version FROM public.automation_recipe_versions WHERE owner_user_id=NEW.owner_user_id AND id=v_run.recipe_version_id FOR SHARE;
  IF jsonb_typeof(v_version.definition -> 'steps') IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
  SELECT value INTO v_step FROM jsonb_array_elements(v_version.definition -> 'steps') WHERE value ->> 'stepCode'=NEW.recipe_action_key;
  IF v_step IS NULL THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RECIPE_COMPILATION_INVALID'; END IF;
  SELECT value INTO v_next FROM jsonb_array_elements(v_version.definition -> 'steps') WHERE (value ->> 'sequence')::integer=NEW.sequence+1;
  IF v_next IS NULL THEN RETURN NEW; END IF;
  IF v_next ->> 'dependsOn' <> NEW.recipe_action_key THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RECIPE_COMPILATION_INVALID'; END IF;
  v_next_input := v_next -> 'input'; v_review := coalesce((v_next ->> 'requiresHumanReview')::boolean,false);
  v_provider := CASE WHEN v_next ->> 'actionCode'='ACT_APOLLO_SEARCH' THEN 'APOLLO' ELSE 'INTERNAL' END;
  IF v_next ->> 'actionCode'='ACT_APOLLO_SEARCH' AND NOT public.automation_apollo_search_input_is_valid(v_next_input) THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_APOLLO_INPUT_INVALID'; END IF;
  INSERT INTO public.automation_work_items(owner_user_id,run_id,sequence,dependency_work_item_id,recipe_action_key,action_code,input,input_sha256,state,provider_code,due_at)
    VALUES (NEW.owner_user_id,NEW.run_id,NEW.sequence+1,OLD.id,v_next ->> 'stepCode',v_next ->> 'actionCode',v_next_input,encode(extensions.digest(v_next_input::text,'sha256'),'hex'),CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,v_provider,now()) ON CONFLICT (owner_user_id,run_id,sequence) DO NOTHING RETURNING id INTO v_next_work;
  IF found THEN
    INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,recipe_version_id,configuration_sha256,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code)
      VALUES (NEW.owner_user_id,v_run.correlation_id,NEW.run_id,v_next_work,v_version.id,v_version.configuration_sha256,'POL_APPROVAL','V1',CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'ALLOW' END,CASE WHEN v_review THEN 'RECIPE_HUMAN_REVIEW' ELSE 'RECIPE_APPROVED' END,encode(extensions.digest(v_next_input::text,'sha256'),'hex'),'recipe_compiler');
    PERFORM public.automation_append_event(NEW.owner_user_id,NEW.run_id,v_next_work,v_run.correlation_id,'RECIPE_SUCCESSOR_COMPILED',v_next ->> 'actionCode',NULL,'recipe_compiler',NULL,CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,'DEPENDENCY_COMPLETED',jsonb_build_object('parent_work_item_id',OLD.id,'recipe_action_key',v_next ->> 'stepCode','provider_code',v_provider));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_claim_work(p_worker text,p_limit integer DEFAULT 10,p_lease_seconds integer DEFAULT 60)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_owners uuid[]:=ARRAY[]::uuid[]; v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_recipe_id uuid; v_reason text; v_cycle bigint:=floor(extract(epoch FROM clock_timestamp())*1000000)::bigint; v_count integer:=0; v_pass integer;
BEGIN
  IF p_worker IS NULL OR char_length(btrim(p_worker)) NOT BETWEEN 1 AND 120 OR p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds NOT BETWEEN 10 AND 3600 THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_VALIDATION_ERROR'; END IF;
  FOR v_owner IN SELECT f.owner_user_id FROM public.automation_claim_fairness f WHERE exists (SELECT 1 FROM public.automation_work_items w JOIN public.automation_runs r ON r.owner_user_id=w.owner_user_id AND r.id=w.run_id WHERE w.owner_user_id=f.owner_user_id AND w.state IN ('WAITING','RETRYABLE') AND w.due_at<=now() AND w.attempt_count<w.max_attempts AND r.cancelled_at IS NULL AND (w.dependency_work_item_id IS NULL OR exists (SELECT 1 FROM public.automation_work_items d WHERE d.id=w.dependency_work_item_id AND d.state='COMPLETED'))) ORDER BY f.last_served_cycle,f.owner_user_id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP v_owners:=array_append(v_owners,v_owner); END LOOP;
  FOR v_pass IN 1..2 LOOP FOREACH v_owner IN ARRAY v_owners LOOP
    EXIT WHEN v_count>=p_limit;
    SELECT w.* INTO v_work FROM public.automation_work_items w JOIN public.automation_runs r ON r.owner_user_id=w.owner_user_id AND r.id=w.run_id WHERE w.owner_user_id=v_owner AND w.state IN ('WAITING','RETRYABLE') AND w.due_at<=now() AND w.attempt_count<w.max_attempts AND r.cancelled_at IS NULL AND (w.dependency_work_item_id IS NULL OR exists (SELECT 1 FROM public.automation_work_items d WHERE d.id=w.dependency_work_item_id AND d.state='COMPLETED')) ORDER BY w.due_at,w.priority DESC,w.id LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF NOT found THEN CONTINUE; END IF;
    SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_work.owner_user_id AND id=v_work.run_id FOR UPDATE;
    SELECT recipe_id INTO v_recipe_id FROM public.automation_recipe_versions WHERE owner_user_id=v_work.owner_user_id AND id=v_run.recipe_version_id FOR SHARE;
    PERFORM public.automation_lock_controls(v_work.owner_user_id,v_recipe_id,v_work.run_id,v_work.provider_code); v_reason:=public.automation_control_reason(v_work.owner_user_id,v_recipe_id,v_work.run_id,v_work.provider_code);
    IF v_reason IS NOT NULL OR NOT exists (SELECT 1 FROM public.automation_recipe_versions rv WHERE rv.owner_user_id=v_work.owner_user_id AND rv.id=v_run.recipe_version_id AND rv.status='APPROVED' AND rv.configuration_sha256=v_run.configuration_sha256) THEN
      v_reason:=coalesce(v_reason,'VERSION_NOT_APPROVED'); UPDATE public.automation_work_items SET state='BLOCKED',last_reason_code=v_reason,updated_at=now() WHERE id=v_work.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code) VALUES (v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_LIMIT','V1','BLOCK',v_reason,v_work.input_sha256,'claim'); PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id); PERFORM public.automation_append_event(v_work.owner_user_id,v_work.run_id,v_work.id,v_run.correlation_id,'WORK_BLOCKED',v_work.action_code,NULL,'claim',v_work.state,'BLOCKED',v_reason,'{}'::jsonb); CONTINUE;
    END IF;
    IF NOT public.automation_reserve_work(v_work.owner_user_id,v_recipe_id,v_work.action_code,v_work.id) THEN
      UPDATE public.automation_work_items SET state='BLOCKED',last_reason_code='QUOTA_DENIED',updated_at=now() WHERE id=v_work.id; INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code) VALUES (v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_LIMIT','V1','BLOCK','QUOTA_DENIED',v_work.input_sha256,'claim'); PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id); PERFORM public.automation_append_event(v_work.owner_user_id,v_work.run_id,v_work.id,v_run.correlation_id,'WORK_BLOCKED',v_work.action_code,NULL,'claim',v_work.state,'BLOCKED','QUOTA_DENIED','{}'::jsonb); CONTINUE;
    END IF;
    UPDATE public.automation_work_items SET state='RUNNING',attempt_count=attempt_count+1,attempt_id=gen_random_uuid(),attempt_phase='CLAIMED',lease_owner=p_worker,lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>p_lease_seconds),started_at=coalesce(started_at,now()),updated_at=now() WHERE id=v_work.id RETURNING * INTO v_work;
    PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id); PERFORM public.automation_append_event(v_work.owner_user_id,v_work.run_id,v_work.id,v_run.correlation_id,'WORK_CLAIMED',v_work.action_code,NULL,'worker','WAITING','RUNNING',NULL,jsonb_build_object('worker',p_worker)); UPDATE public.automation_claim_fairness SET last_served_cycle=greatest(last_served_cycle+1,v_cycle),updated_at=now() WHERE owner_user_id=v_work.owner_user_id; v_count:=v_count+1;
    RETURN NEXT jsonb_build_object('id',v_work.id,'owner_user_id',v_work.owner_user_id,'run_id',v_work.run_id,'action_code',v_work.action_code,'provider_code',v_work.provider_code,'input',v_work.input,'lease_token',v_work.lease_token,'lease_until',v_work.lease_until,'attempt_count',v_work.attempt_count,'attempt_phase',v_work.attempt_phase,'requested_by_user_id',v_run.requested_by_user_id,'requested_by_kind',v_run.requested_by_kind,'correlation_id',v_run.correlation_id);
  END LOOP; END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_mark_dispatching(p_work uuid,p_worker text,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_recipe_id uuid; v_assignment public.automation_recipe_assignments%ROWTYPE; v_reason text; v_provider_idempotency text; v_provider_correlation text;
BEGIN
  SELECT * INTO v_work FROM public.automation_work_items WHERE id=p_work FOR UPDATE;
  IF NOT found OR v_work.state<>'RUNNING' OR v_work.lease_owner<>p_worker OR v_work.lease_token<>p_token OR v_work.lease_until<=now() OR v_work.attempt_phase<>'CLAIMED' THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LEASE_LOST'; END IF;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_work.owner_user_id AND id=v_work.run_id FOR UPDATE;
  SELECT recipe_id INTO v_recipe_id FROM public.automation_recipe_versions WHERE owner_user_id=v_work.owner_user_id AND id=v_run.recipe_version_id FOR SHARE;
  PERFORM public.automation_lock_controls(v_work.owner_user_id,v_recipe_id,v_work.run_id,v_work.provider_code); v_reason:=public.automation_control_reason(v_work.owner_user_id,v_recipe_id,v_work.run_id,v_work.provider_code);
  IF v_reason IS NULL AND NOT exists (SELECT 1 FROM public.automation_recipe_versions rv WHERE rv.owner_user_id=v_work.owner_user_id AND rv.id=v_run.recipe_version_id AND rv.status='APPROVED' AND rv.configuration_sha256=v_run.configuration_sha256) THEN v_reason:='VERSION_NOT_APPROVED'; END IF;
  IF v_reason IS NULL AND v_run.requested_by_kind='employee' THEN
    SELECT a.* INTO v_assignment FROM public.automation_recipe_assignments a JOIN public.users u ON u.id=a.employee_user_id WHERE a.owner_user_id=v_work.owner_user_id AND a.id=v_run.recipe_assignment_id AND a.recipe_version_id=v_run.recipe_version_id AND a.employee_user_id=v_run.requested_by_user_id AND a.status='ACTIVE' AND u.role='employee' AND u.status='active' AND u.portal_owner_user_id=v_work.owner_user_id FOR SHARE OF a,u;
    IF NOT found OR v_assignment.allowed_inputs_sha256<>v_run.assignment_allowed_inputs_sha256 OR NOT ((v_assignment.allowed_inputs -> v_work.action_code) ? v_work.input_sha256) THEN v_reason:='EMPLOYEE_SCOPE_REVOKED'; END IF;
  END IF;
  IF v_reason IS NULL AND (SELECT count(*) FROM public.automation_work_reservations WHERE work_item_id=v_work.id AND active)<>6 THEN v_reason:='RESERVATION_INVALID'; END IF;
  IF v_reason IS NOT NULL THEN
    PERFORM public.automation_release_work_reservations(v_work.id,false); UPDATE public.automation_work_items SET state=CASE WHEN v_reason LIKE '%STOP%' THEN 'CANCELLED' ELSE 'BLOCKED' END,lease_owner=NULL,lease_token=NULL,lease_until=NULL,last_reason_code=v_reason,completed_at=CASE WHEN v_reason LIKE '%STOP%' THEN now() ELSE NULL END,updated_at=now() WHERE id=v_work.id;
    INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code) VALUES (v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_ADMISSION','V1','BLOCK',v_reason,v_work.input_sha256,'dispatch'); PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id); PERFORM public.automation_append_event(v_work.owner_user_id,v_work.run_id,v_work.id,v_run.correlation_id,'DISPATCH_DENIED',v_work.action_code,NULL,'worker','RUNNING','BLOCKED',v_reason,'{}'::jsonb); RETURN jsonb_build_object('allowed',false,'state','BLOCKED','reason',v_reason);
  END IF;
  v_provider_idempotency := CASE WHEN v_work.provider_code='APOLLO' THEN 'phase11:APOLLO:'||v_work.action_code||':'||v_work.id::text ELSE NULL END;
  v_provider_correlation := CASE WHEN v_work.provider_code='APOLLO' THEN 'phase11:APOLLO:'||v_run.correlation_id::text ELSE NULL END;
  UPDATE public.automation_work_items SET attempt_phase='DISPATCHING',dispatch_started_at=now(),provider_idempotency_key=v_provider_idempotency,provider_correlation_id=v_provider_correlation,updated_at=now() WHERE id=v_work.id;
  PERFORM public.automation_append_event(v_work.owner_user_id,v_work.run_id,v_work.id,v_run.correlation_id,'WORK_DISPATCHING',v_work.action_code,NULL,'worker','RUNNING','RUNNING',NULL,jsonb_build_object('provider_code',v_work.provider_code));
  RETURN jsonb_build_object('allowed',true,'state','RUNNING');
END;
$$;

REVOKE ALL ON FUNCTION public.automation_apollo_search_input_is_valid(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.automation_admit_recipe_run(uuid,uuid,text,text,jsonb,timestamptz,text,text), public.automation_upsert_recipe_assignment(uuid,uuid,uuid,uuid,jsonb,text,text), public.automation_claim_work(text,integer,integer), public.automation_mark_dispatching(uuid,text,uuid) TO service_role;
COMMIT;
