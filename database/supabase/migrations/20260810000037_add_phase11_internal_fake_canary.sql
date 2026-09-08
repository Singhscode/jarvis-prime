-- Phase 11 staging-only internal canary: fixed no-provider action and deterministic admission.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.automation_work_items DROP CONSTRAINT IF EXISTS automation_work_items_action_provider_check;
ALTER TABLE public.automation_work_items
  ADD CONSTRAINT automation_work_items_action_provider_check CHECK (
    (action_code IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY','ACT_INTERNAL_FAKE') AND provider_code = 'INTERNAL')
    OR (action_code = 'ACT_APOLLO_SEARCH' AND provider_code = 'APOLLO')
  );

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
       OR v_code IS NULL OR v_code !~ '^[A-Z][A-Z0-9_]{2,60}' OR v_action IS NULL OR v_action NOT IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY','ACT_APOLLO_SEARCH','ACT_INTERNAL_FAKE')
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

CREATE FUNCTION public.automation_run_staging_internal_canary(
  p_owner uuid, p_actor uuid, p_source_event text, p_due_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_definition jsonb := jsonb_build_object(
    'recipeCode','RCP_STAGING_CANARY',
    'inputSchema',jsonb_build_object('properties','{}'::jsonb,'required','[]'::jsonb),
    'steps',jsonb_build_array(jsonb_build_object(
      'stepCode','STEP_CANARY','sequence',1,'actionCode','ACT_INTERNAL_FAKE',
      'policies',jsonb_build_array('POL_APPROVAL@V1'),'requiresHumanReview',false
    ))
  );
  v_hash text; v_recipe public.automation_recipes%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE;
  v_created jsonb; v_payload_hash text;
BEGIN
  IF p_source_event IS NULL OR btrim(p_source_event) !~ '^CANARY_[A-Z0-9][A-Z0-9_-]{7,110}$'
     OR p_due_at IS NULL OR p_due_at < now() - interval '24 hours' OR p_due_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_CANARY_INVALID';
  END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner,p_actor);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text || E'\\x1fRCP_STAGING_CANARY',0));
  v_hash := encode(extensions.digest(v_definition::text,'sha256'),'hex');
  SELECT * INTO v_recipe FROM public.automation_recipes
   WHERE owner_user_id=p_owner AND code='RCP_STAGING_CANARY' FOR UPDATE;
  IF NOT found THEN
    v_created := public.automation_create_recipe(p_owner,p_actor,'RCP_STAGING_CANARY',v_definition,v_hash);
    PERFORM public.automation_transition_recipe_lifecycle(p_owner,p_actor,(v_created->>'recipe_id')::uuid,(v_created->>'recipe_version_id')::uuid,'SUBMIT_REVIEW');
    PERFORM public.automation_transition_recipe_lifecycle(p_owner,p_actor,(v_created->>'recipe_id')::uuid,(v_created->>'recipe_version_id')::uuid,'APPROVE');
    PERFORM public.automation_transition_recipe_lifecycle(p_owner,p_actor,(v_created->>'recipe_id')::uuid,(v_created->>'recipe_version_id')::uuid,'ACTIVATE');
    SELECT * INTO v_recipe FROM public.automation_recipes WHERE owner_user_id=p_owner AND id=(v_created->>'recipe_id')::uuid FOR UPDATE;
  END IF;
  SELECT rv.* INTO v_version FROM public.automation_recipe_versions rv
   JOIN public.automation_recipe_activations ra ON ra.owner_user_id=rv.owner_user_id AND ra.recipe_version_id=rv.id
   WHERE rv.owner_user_id=p_owner AND rv.recipe_id=v_recipe.id AND rv.status='APPROVED' AND ra.status='ACTIVE'
   FOR SHARE OF rv,ra;
  IF NOT found OR v_recipe.status<>'ACTIVE' OR v_version.definition IS DISTINCT FROM v_definition THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_CANARY_RECIPE_INVALID';
  END IF;
  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'canary','RCP_STAGING_CANARY_V1','sourceEvent',btrim(p_source_event),'dueAt',p_due_at
  )::text,'sha256'),'hex');
  RETURN public.automation_resolve_future_trigger(
    p_owner,p_actor,'INTERNAL_FAKE',btrim(p_source_event),'RCP_STAGING_CANARY','{}'::jsonb,
    p_due_at,'ALLOW','STAGING_CANARY_ALLOWED',v_payload_hash
  );
END;
$$;

REVOKE ALL ON FUNCTION public.automation_run_staging_internal_canary(uuid,uuid,text,timestamptz)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.automation_run_staging_internal_canary(uuid,uuid,text,timestamptz) TO service_role;
COMMIT;
