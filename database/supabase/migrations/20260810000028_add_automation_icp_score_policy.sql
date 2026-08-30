BEGIN;

-- Standalone score evaluations need their own replay identity. Existing admission
-- decisions leave these nullable and continue to use their current durable keys.
ALTER TABLE public.automation_policy_decisions
  ADD COLUMN idempotency_key text CHECK (idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9._:-]{16,200}$'),
  ADD COLUMN request_sha256 text CHECK (request_sha256 IS NULL OR request_sha256 ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX automation_policy_decisions_idempotency_uniq
  ON public.automation_policy_decisions(owner_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Persists an already server-evaluated deterministic score. This function deliberately
-- does not create a trigger, run, or work item; Step 2 admission remains authoritative.
CREATE FUNCTION public.automation_evaluate_recipe_score_policy(
  p_owner uuid, p_actor uuid, p_recipe_code text, p_input jsonb,
  p_idempotency text, p_request_hash text, p_score integer, p_qualified boolean,
  p_hot boolean, p_decision text, p_reason text, p_metadata jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing public.automation_policy_decisions%ROWTYPE;
  v_recipe public.automation_recipes%ROWTYPE;
  v_activation public.automation_recipe_activations%ROWTYPE;
  v_version public.automation_recipe_versions%ROWTYPE;
  v_input_hash text;
BEGIN
  IF p_recipe_code !~ '^RCP_[A-Z0-9_]{3,60}$'
     OR p_idempotency !~ '^[A-Za-z0-9._:-]{16,200}$'
     OR p_request_hash !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(p_input) <> 'object' OR octet_length(p_input::text) > 65536
     OR jsonb_typeof(p_input -> 'prospect') <> 'object'
     OR jsonb_typeof(p_input -> 'clientIcp') <> 'object'
     OR p_score IS NULL OR p_score NOT BETWEEN 0 AND 30
     OR p_qualified IS NULL OR p_hot IS NULL OR (p_hot AND NOT p_qualified)
     OR p_decision IS NULL OR p_decision NOT IN ('ALLOW','BLOCK')
     OR p_reason IS NULL OR p_reason NOT IN ('ICP_QUALIFIED','ICP_NOT_QUALIFIED')
     OR jsonb_typeof(p_metadata) <> 'object' OR octet_length(p_metadata::text) > 8192
     OR (p_metadata ->> 'scorer') <> 'ICP_SCORER_V1'
     OR (p_metadata ->> 'score') IS DISTINCT FROM p_score::text
     OR (p_metadata -> 'qualified') IS DISTINCT FROM to_jsonb(p_qualified)
     OR (p_metadata -> 'hot') IS DISTINCT FROM to_jsonb(p_hot)
     OR jsonb_typeof(p_metadata -> 'reasons') <> 'array'
     OR (p_qualified AND (p_decision <> 'ALLOW' OR p_reason <> 'ICP_QUALIFIED'))
     OR (NOT p_qualified AND (p_decision <> 'BLOCK' OR p_reason <> 'ICP_NOT_QUALIFIED')) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_SCORE_POLICY_INVALID';
  END IF;

  PERFORM public.automation_assert_recipe_owner(p_owner, p_actor);

  SELECT * INTO v_existing FROM public.automation_policy_decisions
    WHERE owner_user_id = p_owner AND idempotency_key = p_idempotency FOR UPDATE;
  IF found THEN
    IF v_existing.request_sha256 <> p_request_hash THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'recipe_version_id', v_existing.recipe_version_id,
      'configuration_sha256', v_existing.configuration_sha256,
      'correlation_id', v_existing.correlation_id,
      'decision', v_existing.decision,
      'reason_code', v_existing.reason_code,
      'score', v_existing.safe_metadata -> 'score',
      'qualified', v_existing.safe_metadata -> 'qualified',
      'hot', v_existing.safe_metadata -> 'hot',
      'reasons', v_existing.safe_metadata -> 'reasons',
      'replayed', true
    );
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

  v_input_hash := encode(extensions.digest(p_input::text, 'sha256'), 'hex');
  INSERT INTO public.automation_policy_decisions(
    owner_user_id, correlation_id, recipe_version_id, configuration_sha256,
    policy_code, policy_version, decision, reason_code, evaluated_input_sha256,
    safe_metadata, actor_user_id, source_code, idempotency_key, request_sha256
  ) VALUES (
    p_owner, gen_random_uuid(), v_version.id, v_version.configuration_sha256,
    'POL_SCORE', 'V1', p_decision, p_reason, v_input_hash,
    p_metadata, p_actor, 'recipe_score', p_idempotency, p_request_hash
  ) RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'recipe_version_id', v_existing.recipe_version_id,
    'configuration_sha256', v_existing.configuration_sha256,
    'correlation_id', v_existing.correlation_id,
    'decision', v_existing.decision,
    'reason_code', v_existing.reason_code,
    'score', v_existing.safe_metadata -> 'score',
    'qualified', v_existing.safe_metadata -> 'qualified',
    'hot', v_existing.safe_metadata -> 'hot',
    'reasons', v_existing.safe_metadata -> 'reasons',
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.automation_evaluate_recipe_score_policy(
  uuid,uuid,text,jsonb,text,text,integer,boolean,boolean,text,text,jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.automation_evaluate_recipe_score_policy(
  uuid,uuid,text,jsonb,text,text,integer,boolean,boolean,text,text,jsonb
) TO service_role;

COMMIT;
