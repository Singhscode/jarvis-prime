-- Phase 11 Step 4: Recipe and fixed-policy governance over the authoritative Step 2 runtime.
-- Additive only: automation_runs, automation_work_items, queue/leases, worker and action registry remain Step 2 owned.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Normalize the pre-governance recipe status names before enforcing the composite lifecycle.
UPDATE public.automation_recipes SET status = 'ACTIVE' WHERE status = 'ENABLED';
UPDATE public.automation_recipes SET status = 'PAUSED' WHERE status = 'DISABLED';
ALTER TABLE public.automation_recipes DROP CONSTRAINT IF EXISTS automation_recipes_status_check;
ALTER TABLE public.automation_recipes
  ADD CONSTRAINT automation_recipes_status_check
  CHECK (status IN ('DRAFT','REVIEW','APPROVED','ACTIVE','PAUSED','ARCHIVED'));
ALTER TABLE public.automation_recipe_versions DROP CONSTRAINT IF EXISTS automation_recipe_versions_status_check;
ALTER TABLE public.automation_recipe_versions
  ADD CONSTRAINT automation_recipe_versions_status_check
  CHECK (status IN ('DRAFT','REVIEW','APPROVED','RETIRED'));

-- Lifecycle and activation audit are separate from immutable Step 2 run history.
CREATE TABLE public.automation_recipe_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  recipe_id uuid NOT NULL,
  recipe_version_id uuid,
  previous_status text,
  next_status text NOT NULL CHECK (next_status IN ('DRAFT','REVIEW','APPROVED','ACTIVE','PAUSED','ARCHIVED')),
  transition_code text NOT NULL CHECK (transition_code IN ('CREATE','SUBMIT_REVIEW','APPROVE','ACTIVATE','PAUSE','ARCHIVE')),
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(safe_metadata) = 'object' AND octet_length(safe_metadata::text) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, recipe_id)
    REFERENCES public.automation_recipes(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, recipe_version_id)
    REFERENCES public.automation_recipe_versions(owner_user_id, id) ON DELETE RESTRICT
);
CREATE TABLE public.automation_recipe_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  recipe_id uuid NOT NULL,
  recipe_version_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUPERSEDED','PAUSED','ARCHIVED')),
  activated_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  activated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, recipe_id)
    REFERENCES public.automation_recipes(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, recipe_version_id)
    REFERENCES public.automation_recipe_versions(owner_user_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX automation_recipe_activations_one_active
  ON public.automation_recipe_activations(owner_user_id, recipe_id) WHERE status = 'ACTIVE';
CREATE INDEX automation_recipe_activations_active_route_idx
  ON public.automation_recipe_activations(owner_user_id, recipe_id, recipe_version_id) WHERE status = 'ACTIVE';

-- Preserve historical decision rows while pinning new Recipe-policy evidence to the immutable version/hash.
ALTER TABLE public.automation_policy_decisions
  ADD COLUMN recipe_version_id uuid,
  ADD COLUMN configuration_sha256 text CHECK (configuration_sha256 IS NULL OR configuration_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE public.automation_policy_decisions DROP CONSTRAINT IF EXISTS automation_policy_decisions_policy_code_check;
ALTER TABLE public.automation_policy_decisions
  ADD CONSTRAINT automation_policy_decisions_policy_code_check
  CHECK (policy_code IN ('POL_LIMIT','POL_SCORE','POL_REPLY','POL_ADMISSION','POL_APPROVAL'));
ALTER TABLE public.automation_policy_decisions
  ADD CONSTRAINT automation_policy_decisions_recipe_version_fk
  FOREIGN KEY (owner_user_id, recipe_version_id)
  REFERENCES public.automation_recipe_versions(owner_user_id, id) ON DELETE RESTRICT;

-- Recipe content is immutable from creation. Lifecycle changes are constrained to the controlled RPC below.
CREATE OR REPLACE FUNCTION public.automation_recipe_version_governance_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_IMMUTABLE';
  END IF;
  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.recipe_id IS DISTINCT FROM NEW.recipe_id
     OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.definition IS DISTINCT FROM NEW.definition
     OR OLD.configuration_sha256 IS DISTINCT FROM NEW.configuration_sha256
     OR OLD.created_by_user_id IS DISTINCT FROM NEW.created_by_user_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_IMMUTABLE';
  END IF;
  IF OLD.status = 'DRAFT' AND NEW.status = 'REVIEW'
     AND NEW.approved_at IS NULL AND NEW.approved_by_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'REVIEW' AND NEW.status = 'APPROVED'
     AND NEW.approved_at IS NOT NULL AND NEW.approved_by_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_VERSION_TRANSITION_INVALID';
END;
$$;
DROP TRIGGER IF EXISTS automation_recipe_versions_immutable ON public.automation_recipe_versions;
CREATE TRIGGER automation_recipe_versions_governance_guard
  BEFORE UPDATE OR DELETE ON public.automation_recipe_versions
  FOR EACH ROW EXECUTE FUNCTION public.automation_recipe_version_governance_guard();
CREATE TRIGGER automation_recipe_lifecycle_events_immutable
  BEFORE UPDATE OR DELETE ON public.automation_recipe_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public.automation_reject_immutable();
CREATE TRIGGER automation_recipe_activations_immutable
  BEFORE DELETE ON public.automation_recipe_activations
  FOR EACH ROW EXECUTE FUNCTION public.automation_reject_immutable();

-- No expressions, provider configuration, credentials, URLs, SQL, or modules are accepted in definitions.
CREATE OR REPLACE FUNCTION public.automation_assert_recipe_safe_json(p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_key text; v_item jsonb; v_text text;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      FOR v_key, v_item IN SELECT key, value FROM jsonb_each(p_value) LOOP
        IF lower(v_key) IN ('url','uri','sql','query','code','script','expression','module','import','require',
                            'credential','credentials','secret','token','password','provider','webhook') THEN
          RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_DYNAMIC_CONTENT';
        END IF;
        PERFORM public.automation_assert_recipe_safe_json(v_item);
      END LOOP;
    WHEN 'array' THEN
      FOR v_item IN SELECT value FROM jsonb_array_elements(p_value) LOOP
        PERFORM public.automation_assert_recipe_safe_json(v_item);
      END LOOP;
    WHEN 'string' THEN
      v_text := p_value #>> '{}';
      IF v_text ~* '^\s*(https?://|javascript:|data:)' THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_DYNAMIC_CONTENT';
      END IF;
    ELSE NULL;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_assert_recipe_definition(p_definition jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_step jsonb; v_property jsonb; v_policy jsonb;
  v_count integer; v_position integer := 0; v_previous_code text := NULL;
  v_code text; v_sequence integer; v_action text; v_type text; v_required text;
BEGIN
  IF jsonb_typeof(p_definition) IS DISTINCT FROM 'object' OR octet_length(p_definition::text) > 65536
     OR NOT (p_definition ? 'recipeCode') OR NOT (p_definition ? 'inputSchema') OR NOT (p_definition ? 'steps')
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_definition) AS key
                WHERE key NOT IN ('recipeCode','inputSchema','steps'))
     OR p_definition ->> 'recipeCode' IS NULL OR p_definition ->> 'recipeCode' !~ '^RCP_[A-Z0-9_]{3,60}$'
     OR jsonb_typeof(p_definition -> 'inputSchema') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_definition -> 'steps') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_DEFINITION_INVALID';
  END IF;
  PERFORM public.automation_assert_recipe_safe_json(p_definition);
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_definition -> 'inputSchema') AS key
             WHERE key NOT IN ('properties','required'))
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
  IF v_count NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID';
  END IF;
  FOR v_step IN SELECT value FROM jsonb_array_elements(p_definition -> 'steps') LOOP
    v_position := v_position + 1;
    IF jsonb_typeof(v_step) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_step) AS key
                  WHERE key NOT IN ('stepCode','sequence','actionCode','dependsOn','input','policies','requiresHumanReview'))
       OR NOT (v_step ? 'stepCode') OR NOT (v_step ? 'sequence') OR NOT (v_step ? 'actionCode')
       OR NOT (v_step ? 'policies') OR NOT (v_step ? 'requiresHumanReview') THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID';
    END IF;
    v_code := v_step ->> 'stepCode';
    v_action := v_step ->> 'actionCode';
    IF v_code IS NULL OR v_code !~ '^[A-Z][A-Z0-9_]{2,60}$' OR v_action IS NULL OR v_action NOT IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY')
       OR (v_step ->> 'sequence') IS NULL OR (v_step ->> 'sequence') !~ '^[1-9][0-9]{0,3}$' OR (v_step ->> 'sequence')::integer <> v_position
       OR jsonb_typeof(v_step -> 'policies') IS DISTINCT FROM 'array' OR jsonb_typeof(v_step -> 'requiresHumanReview') IS DISTINCT FROM 'boolean'
       OR (SELECT count(*) FROM jsonb_array_elements(p_definition -> 'steps') AS candidate WHERE candidate ->> 'stepCode' = v_code) <> 1 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID';
    END IF;
    IF v_position = 1 THEN
      IF (v_step ? 'dependsOn') OR (v_step ? 'input') THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID';
      END IF;
    ELSIF v_step ->> 'dependsOn' IS DISTINCT FROM v_previous_code
       OR jsonb_typeof(v_step -> 'input') <> 'object' OR octet_length((v_step -> 'input')::text) > 65536 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_step -> 'policies') AS policy
                   WHERE policy = 'POL_APPROVAL@V1')
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_step -> 'policies') AS policy
                  WHERE policy NOT IN ('POL_APPROVAL@V1','POL_LIMIT@V1'))
       OR (SELECT count(*) FROM jsonb_array_elements_text(v_step -> 'policies'))
          <> (SELECT count(DISTINCT policy) FROM jsonb_array_elements_text(v_step -> 'policies') AS policy) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_POLICY_INVALID';
    END IF;
    v_previous_code := v_code;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_recipe_input_is_valid(p_definition jsonb, p_input jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_key text; v_type text; v_value jsonb; v_required text;
BEGIN
  IF jsonb_typeof(p_input) <> 'object' OR octet_length(p_input::text) > 65536 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS key
             WHERE NOT ((p_definition -> 'inputSchema' -> 'properties') ? key)) THEN RETURN false; END IF;
  FOR v_required IN SELECT jsonb_array_elements_text(p_definition -> 'inputSchema' -> 'required') LOOP
    IF NOT (p_input ? v_required) THEN RETURN false; END IF;
  END LOOP;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_input) LOOP
    v_type := p_definition -> 'inputSchema' -> 'properties' -> v_key ->> 'type';
    IF (v_type = 'string' AND jsonb_typeof(v_value) <> 'string')
       OR (v_type = 'number' AND jsonb_typeof(v_value) <> 'number')
       OR (v_type = 'boolean' AND jsonb_typeof(v_value) <> 'boolean')
       OR (v_type = 'object' AND jsonb_typeof(v_value) <> 'object')
       OR (v_type = 'array' AND jsonb_typeof(v_value) <> 'array') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_assert_recipe_owner(p_owner uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.users u
   WHERE u.id = p_owner AND u.id = p_actor AND u.role = 'client' AND u.status = 'active';
  IF NOT found THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_OWNER_SCOPE_DENIED'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_create_recipe(
  p_owner uuid, p_actor uuid, p_code text, p_definition jsonb, p_configuration_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_recipe public.automation_recipes%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE;
BEGIN
  IF p_code !~ '^RCP_[A-Z0-9_]{3,60}$' OR p_configuration_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner, p_actor);
  PERFORM public.automation_assert_recipe_definition(p_definition);
  IF p_definition ->> 'recipeCode' <> p_code THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_CODE_MISMATCH';
  END IF;
  INSERT INTO public.automation_recipes(owner_user_id, code, status, created_by_user_id)
    VALUES (p_owner, p_code, 'DRAFT', p_actor) RETURNING * INTO v_recipe;
  INSERT INTO public.automation_recipe_versions(owner_user_id, recipe_id, version, status, definition, configuration_sha256, created_by_user_id)
    VALUES (p_owner, v_recipe.id, 1, 'DRAFT', p_definition, p_configuration_hash, p_actor) RETURNING * INTO v_version;
  INSERT INTO public.automation_recipe_lifecycle_events(owner_user_id, recipe_id, recipe_version_id, next_status, transition_code, actor_user_id)
    VALUES (p_owner, v_recipe.id, v_version.id, 'DRAFT', 'CREATE', p_actor);
  RETURN jsonb_build_object('recipe_id', v_recipe.id, 'recipe_version_id', v_version.id, 'status', 'DRAFT', 'version', 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_create_recipe_version(
  p_owner uuid, p_actor uuid, p_recipe uuid, p_definition jsonb, p_configuration_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_recipe public.automation_recipes%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE; v_next integer;
BEGIN
  IF p_configuration_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR'; END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner, p_actor);
  SELECT * INTO v_recipe FROM public.automation_recipes WHERE owner_user_id = p_owner AND id = p_recipe FOR UPDATE;
  IF NOT found OR v_recipe.status = 'ARCHIVED' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_NOT_EDITABLE'; END IF;
  PERFORM public.automation_assert_recipe_definition(p_definition);
  IF p_definition ->> 'recipeCode' <> v_recipe.code THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_CODE_MISMATCH'; END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_next FROM public.automation_recipe_versions
   WHERE owner_user_id = p_owner AND recipe_id = p_recipe;
  INSERT INTO public.automation_recipe_versions(owner_user_id, recipe_id, version, status, definition, configuration_sha256, created_by_user_id)
    VALUES (p_owner, p_recipe, v_next, 'DRAFT', p_definition, p_configuration_hash, p_actor) RETURNING * INTO v_version;
  RETURN jsonb_build_object('recipe_version_id', v_version.id, 'status', 'DRAFT', 'version', v_next);
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_transition_recipe_lifecycle(
  p_owner uuid, p_actor uuid, p_recipe uuid, p_recipe_version uuid, p_transition text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_recipe public.automation_recipes%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE;
  v_previous text; v_next text; v_activation public.automation_recipe_activations%ROWTYPE;
BEGIN
  IF p_transition NOT IN ('SUBMIT_REVIEW','APPROVE','ACTIVATE','PAUSE','ARCHIVE') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner, p_actor);
  SELECT * INTO v_recipe FROM public.automation_recipes WHERE owner_user_id = p_owner AND id = p_recipe FOR UPDATE;
  SELECT * INTO v_version FROM public.automation_recipe_versions
   WHERE owner_user_id = p_owner AND id = p_recipe_version AND recipe_id = p_recipe FOR UPDATE;
  IF NOT found THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_VERSION_NOT_FOUND'; END IF;
  v_previous := v_recipe.status;
  IF p_transition = 'SUBMIT_REVIEW' THEN
    IF v_recipe.status <> 'DRAFT' OR v_version.status <> 'DRAFT' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_LIFECYCLE_INVALID'; END IF;
    UPDATE public.automation_recipe_versions SET status = 'REVIEW' WHERE id = v_version.id;
    v_next := 'REVIEW';
  ELSIF p_transition = 'APPROVE' THEN
    IF v_recipe.status <> 'REVIEW' OR v_version.status <> 'REVIEW' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_LIFECYCLE_INVALID'; END IF;
    UPDATE public.automation_recipe_versions SET status = 'APPROVED', approved_at = now(), approved_by_user_id = p_actor WHERE id = v_version.id;
    v_next := 'APPROVED';
  ELSIF p_transition = 'ACTIVATE' THEN
    IF v_recipe.status NOT IN ('APPROVED','PAUSED','ACTIVE') OR v_version.status <> 'APPROVED' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_LIFECYCLE_INVALID'; END IF;
    UPDATE public.automation_recipe_activations
       SET status = 'SUPERSEDED', deactivated_at = now()
     WHERE owner_user_id = p_owner AND recipe_id = p_recipe AND status = 'ACTIVE';
    INSERT INTO public.automation_recipe_activations(owner_user_id, recipe_id, recipe_version_id, status, activated_by_user_id)
      VALUES (p_owner, p_recipe, p_recipe_version, 'ACTIVE', p_actor) RETURNING * INTO v_activation;
    v_next := 'ACTIVE';
  ELSIF p_transition = 'PAUSE' THEN
    IF v_recipe.status <> 'ACTIVE' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_LIFECYCLE_INVALID'; END IF;
    UPDATE public.automation_recipe_activations SET status = 'PAUSED', deactivated_at = now()
      WHERE owner_user_id = p_owner AND recipe_id = p_recipe AND status = 'ACTIVE';
    v_next := 'PAUSED';
  ELSE
    IF v_recipe.status NOT IN ('DRAFT','REVIEW','APPROVED','PAUSED') THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_LIFECYCLE_INVALID'; END IF;
    UPDATE public.automation_recipe_activations SET status = 'ARCHIVED', deactivated_at = now()
      WHERE owner_user_id = p_owner AND recipe_id = p_recipe AND status IN ('ACTIVE','PAUSED');
    v_next := 'ARCHIVED';
  END IF;
  UPDATE public.automation_recipes SET status = v_next, updated_at = now() WHERE id = v_recipe.id;
  INSERT INTO public.automation_recipe_lifecycle_events(owner_user_id, recipe_id, recipe_version_id, previous_status, next_status, transition_code, actor_user_id)
    VALUES (p_owner, p_recipe, p_recipe_version, v_previous, v_next, p_transition, p_actor);
  RETURN jsonb_build_object('recipe_id', p_recipe, 'recipe_version_id', p_recipe_version, 'status', v_next);
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_upsert_recipe_assignment(
  p_owner uuid, p_actor uuid, p_recipe_version uuid, p_employee uuid, p_allowed_inputs jsonb, p_allowed_inputs_hash text, p_status text DEFAULT 'ACTIVE'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_assignment public.automation_recipe_assignments%ROWTYPE; v_key text; v_hash text;
BEGIN
  IF p_status NOT IN ('ACTIVE','PAUSED','REVOKED') OR p_allowed_inputs_hash !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(p_allowed_inputs) <> 'object' OR octet_length(p_allowed_inputs::text) > 8192 THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner, p_actor);
  IF NOT EXISTS (SELECT 1 FROM public.automation_recipe_versions WHERE owner_user_id = p_owner AND id = p_recipe_version AND status = 'APPROVED')
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_employee AND role = 'employee' AND status = 'active' AND portal_owner_user_id = p_owner) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_ASSIGNMENT_SCOPE_DENIED';
  END IF;
  FOR v_key, v_hash IN SELECT key, jsonb_array_elements_text(value) FROM jsonb_each(p_allowed_inputs) LOOP
    IF v_key NOT IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY') OR v_hash !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_ASSIGNMENT_INVALID';
    END IF;
  END LOOP;
  UPDATE public.automation_recipe_assignments
     SET status = p_status, allowed_inputs = p_allowed_inputs, allowed_inputs_sha256 = p_allowed_inputs_hash,
         updated_at = now(), revoked_at = CASE WHEN p_status = 'REVOKED' THEN now() ELSE NULL END
   WHERE owner_user_id = p_owner AND recipe_version_id = p_recipe_version AND employee_user_id = p_employee
   RETURNING * INTO v_assignment;
  IF not found THEN
    INSERT INTO public.automation_recipe_assignments(owner_user_id, recipe_version_id, employee_user_id, status, allowed_inputs, allowed_inputs_sha256, created_by_user_id, revoked_at)
      VALUES (p_owner, p_recipe_version, p_employee, p_status, p_allowed_inputs, p_allowed_inputs_hash, p_actor,
              CASE WHEN p_status = 'REVOKED' THEN now() ELSE NULL END) RETURNING * INTO v_assignment;
  END IF;
  RETURN jsonb_build_object('assignment_id', v_assignment.id, 'status', v_assignment.status);
END;
$$;

-- The only public Recipe admission path derives active version, action, and successor graph server-side.
CREATE OR REPLACE FUNCTION public.automation_admit_recipe_run(
  p_owner uuid, p_actor uuid, p_actor_kind text, p_recipe_code text, p_input jsonb,
  p_due_at timestamptz, p_idempotency text, p_request_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_recipe public.automation_recipes%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE;
  v_activation public.automation_recipe_activations%ROWTYPE; v_assignment public.automation_recipe_assignments%ROWTYPE;
  v_trigger public.automation_trigger_inbox%ROWTYPE; v_run public.automation_runs%ROWTYPE;
  v_root jsonb; v_action text; v_step_code text; v_input_hash text; v_work uuid; v_review boolean; v_policy_decision text;
BEGIN
  IF p_actor_kind NOT IN ('owner','employee') OR p_recipe_code !~ '^RCP_[A-Z0-9_]{3,60}$'
     OR p_idempotency !~ '^[A-Za-z0-9._:-]{16,200}$' OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(p_input) <> 'object' OR p_due_at IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  SELECT * INTO v_recipe FROM public.automation_recipes
   WHERE owner_user_id = p_owner AND code = p_recipe_code AND status = 'ACTIVE' FOR SHARE;
  SELECT * INTO v_activation FROM public.automation_recipe_activations
   WHERE owner_user_id = p_owner AND recipe_id = v_recipe.id AND status = 'ACTIVE' FOR SHARE;
  SELECT * INTO v_version FROM public.automation_recipe_versions
   WHERE owner_user_id = p_owner AND id = v_activation.recipe_version_id AND status = 'APPROVED' FOR SHARE;
  IF NOT found OR v_recipe.id IS NULL OR v_version.id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_NOT_ACTIVE';
  END IF;
  IF NOT public.automation_recipe_input_is_valid(v_version.definition, p_input) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_INPUT_INVALID';
  END IF;
  v_root := v_version.definition -> 'steps' -> 0;
  v_action := v_root ->> 'actionCode'; v_step_code := v_root ->> 'stepCode';
  v_input_hash := encode(extensions.digest(p_input::text, 'sha256'), 'hex');
  IF p_actor_kind = 'owner' THEN
    PERFORM public.automation_assert_recipe_owner(p_owner, p_actor);
  ELSE
    SELECT * INTO v_assignment FROM public.automation_recipe_assignments a
      JOIN public.users u ON u.id = a.employee_user_id
     WHERE a.owner_user_id = p_owner AND a.recipe_version_id = v_version.id AND a.employee_user_id = p_actor
       AND a.status = 'ACTIVE' AND u.role = 'employee' AND u.status = 'active' AND u.portal_owner_user_id = p_owner
     FOR SHARE OF a, u;
    IF NOT found OR NOT ((v_assignment.allowed_inputs -> v_action) ? v_input_hash) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_EMPLOYEE_SCOPE_DENIED';
    END IF;
  END IF;
  SELECT * INTO v_trigger FROM public.automation_trigger_inbox
   WHERE owner_user_id = p_owner AND source_code = 'MANUAL' AND source_event_id = p_idempotency FOR UPDATE;
  IF found THEN
    IF v_trigger.payload_sha256 <> p_request_hash THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('trigger_id', v_trigger.id, 'run_id', v_trigger.run_id, 'replayed', true);
  END IF;
  INSERT INTO public.automation_trigger_inbox(owner_user_id, source_code, source_event_id, payload_sha256, safe_metadata)
    VALUES (p_owner, 'MANUAL', p_idempotency, p_request_hash, jsonb_build_object('recipe_code', p_recipe_code)) RETURNING * INTO v_trigger;
  INSERT INTO public.automation_runs(
    owner_user_id, trigger_inbox_id, recipe_version_id, configuration_sha256, recipe_assignment_id,
    assignment_allowed_inputs_sha256, correlation_id, idempotency_key, request_sha256, requested_by_user_id, requested_by_kind
  ) VALUES (
    p_owner, v_trigger.id, v_version.id, v_version.configuration_sha256,
    CASE WHEN p_actor_kind = 'employee' THEN v_assignment.id END,
    CASE WHEN p_actor_kind = 'employee' THEN v_assignment.allowed_inputs_sha256 END,
    v_trigger.correlation_id, p_idempotency, p_request_hash, p_actor, p_actor_kind
  ) RETURNING * INTO v_run;
  v_review := coalesce((v_root ->> 'requiresHumanReview')::boolean, false);
  INSERT INTO public.automation_work_items(
    owner_user_id, run_id, sequence, recipe_action_key, action_code, input, input_sha256, state, provider_code, due_at
  ) VALUES (
    p_owner, v_run.id, 1, v_step_code, v_action, p_input, v_input_hash,
    CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END, 'INTERNAL', p_due_at
  ) RETURNING id INTO v_work;
  v_policy_decision := CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'ALLOW' END;
  INSERT INTO public.automation_policy_decisions(
    owner_user_id, correlation_id, run_id, work_item_id, recipe_version_id, configuration_sha256,
    policy_code, policy_version, decision, reason_code, evaluated_input_sha256, actor_user_id, source_code
  ) VALUES (
    p_owner, v_trigger.correlation_id, v_run.id, v_work, v_version.id, v_version.configuration_sha256,
    'POL_APPROVAL', 'V1', v_policy_decision,
    CASE WHEN v_review THEN 'RECIPE_HUMAN_REVIEW' ELSE 'RECIPE_APPROVED' END, v_input_hash, p_actor, 'recipe_admission'
  );
  INSERT INTO public.automation_claim_fairness(owner_user_id) VALUES (p_owner) ON CONFLICT DO NOTHING;
  UPDATE public.automation_trigger_inbox SET run_id = v_run.id, status = 'PROCESSED', processed_at = now() WHERE id = v_trigger.id;
  PERFORM public.automation_recompute_run(p_owner, v_run.id);
  PERFORM public.automation_append_event(p_owner, v_run.id, v_work, v_trigger.correlation_id,
    'RECIPE_ADMITTED', v_action, p_actor, 'recipe_admission', NULL,
    CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,
    CASE WHEN v_review THEN 'RECIPE_HUMAN_REVIEW' ELSE 'RECIPE_APPROVED' END,
    jsonb_build_object('recipe_code', p_recipe_code, 'recipe_version_id', v_version.id));
  RETURN jsonb_build_object('trigger_id', v_trigger.id, 'run_id', v_run.id, 'work_item_id', v_work,
    'state', CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END, 'replayed', false);
END;
$$;

-- This is a compiler hook inside the existing Step 2 work transition transaction, not a second worker/queue.
CREATE OR REPLACE FUNCTION public.automation_compile_recipe_successor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.automation_runs%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE;
  v_step jsonb; v_next jsonb; v_next_input jsonb; v_next_work uuid; v_review boolean;
BEGIN
  IF NEW.state <> 'COMPLETED' OR OLD.state = 'COMPLETED' THEN RETURN NEW; END IF;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = NEW.owner_user_id AND id = NEW.run_id FOR SHARE;
  SELECT * INTO v_version FROM public.automation_recipe_versions
   WHERE owner_user_id = NEW.owner_user_id AND id = v_run.recipe_version_id FOR SHARE;
  IF jsonb_typeof(v_version.definition -> 'steps') IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
  SELECT value INTO v_step FROM jsonb_array_elements(v_version.definition -> 'steps')
   WHERE value ->> 'stepCode' = NEW.recipe_action_key;
  IF v_step IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_COMPILATION_INVALID'; END IF;
  SELECT value INTO v_next FROM jsonb_array_elements(v_version.definition -> 'steps')
   WHERE (value ->> 'sequence')::integer = NEW.sequence + 1;
  IF v_next IS NULL THEN RETURN NEW; END IF;
  IF v_next ->> 'dependsOn' <> NEW.recipe_action_key THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_COMPILATION_INVALID';
  END IF;
  v_next_input := v_next -> 'input';
  v_review := coalesce((v_next ->> 'requiresHumanReview')::boolean, false);
  INSERT INTO public.automation_work_items(
    owner_user_id, run_id, sequence, dependency_work_item_id, recipe_action_key, action_code,
    input, input_sha256, state, provider_code, due_at
  ) VALUES (
    NEW.owner_user_id, NEW.run_id, NEW.sequence + 1, OLD.id, v_next ->> 'stepCode', v_next ->> 'actionCode',
    v_next_input, encode(extensions.digest(v_next_input::text, 'sha256'), 'hex'),
    CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END, 'INTERNAL', now()
  ) ON CONFLICT (owner_user_id, run_id, sequence) DO NOTHING RETURNING id INTO v_next_work;
  IF found THEN
    INSERT INTO public.automation_policy_decisions(
      owner_user_id, correlation_id, run_id, work_item_id, recipe_version_id, configuration_sha256,
      policy_code, policy_version, decision, reason_code, evaluated_input_sha256, source_code
    ) VALUES (
      NEW.owner_user_id, v_run.correlation_id, NEW.run_id, v_next_work, v_version.id, v_version.configuration_sha256,
      'POL_APPROVAL', 'V1', CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'ALLOW' END,
      CASE WHEN v_review THEN 'RECIPE_HUMAN_REVIEW' ELSE 'RECIPE_APPROVED' END,
      encode(extensions.digest(v_next_input::text, 'sha256'), 'hex'), 'recipe_compiler'
    );
    PERFORM public.automation_append_event(NEW.owner_user_id, NEW.run_id, v_next_work, v_run.correlation_id,
      'RECIPE_SUCCESSOR_COMPILED', v_next ->> 'actionCode', NULL, 'recipe_compiler', NULL,
      CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END, 'DEPENDENCY_COMPLETED',
      jsonb_build_object('parent_work_item_id', OLD.id, 'recipe_action_key', v_next ->> 'stepCode'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER automation_recipe_compile_successor_before_complete
  BEFORE UPDATE OF state ON public.automation_work_items
  FOR EACH ROW EXECUTE FUNCTION public.automation_compile_recipe_successor();

ALTER TABLE public.automation_recipe_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_recipe_activations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_recipe_lifecycle_events, public.automation_recipe_activations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.automation_recipe_lifecycle_events, public.automation_recipe_activations TO service_role;
REVOKE ALL ON FUNCTION
  public.automation_recipe_version_governance_guard(),
  public.automation_assert_recipe_safe_json(jsonb),
  public.automation_assert_recipe_definition(jsonb),
  public.automation_recipe_input_is_valid(jsonb,jsonb),
  public.automation_assert_recipe_owner(uuid,uuid),
  public.automation_create_recipe(uuid,uuid,text,jsonb,text),
  public.automation_create_recipe_version(uuid,uuid,uuid,jsonb,text),
  public.automation_transition_recipe_lifecycle(uuid,uuid,uuid,uuid,text),
  public.automation_upsert_recipe_assignment(uuid,uuid,uuid,uuid,jsonb,text,text),
  public.automation_admit_recipe_run(uuid,uuid,text,text,jsonb,timestamptz,text,text),
  public.automation_compile_recipe_successor()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.automation_create_recipe(uuid,uuid,text,jsonb,text),
  public.automation_create_recipe_version(uuid,uuid,uuid,jsonb,text),
  public.automation_transition_recipe_lifecycle(uuid,uuid,uuid,uuid,text),
  public.automation_upsert_recipe_assignment(uuid,uuid,uuid,uuid,jsonb,text,text),
  public.automation_admit_recipe_run(uuid,uuid,text,text,jsonb,timestamptz,text,text)
TO service_role;
COMMIT;
