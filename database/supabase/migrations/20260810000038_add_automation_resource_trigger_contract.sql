-- Automation resource, internal-trigger, and bounded-condition contracts.
-- Forward-only: this extends the existing governed recipe admission and durable work queue.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.automation_trigger_inbox
  DROP CONSTRAINT IF EXISTS automation_trigger_inbox_source_code_check;
ALTER TABLE public.automation_trigger_inbox
  ADD CONSTRAINT automation_trigger_inbox_source_code_check
  CHECK (source_code IN ('MANUAL', 'SCHEDULE', 'INTERNAL_RESOURCE_EVENT'));

-- Immutable run-bound snapshot of the typed business resource resolved at admission.
-- "organization" is intentionally represented by the existing owner-scoped client record;
-- this does not introduce a competing tenancy or CRM ownership model.
CREATE TABLE public.automation_run_resource_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 8192),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, run_id),
  FOREIGN KEY (owner_user_id, run_id) REFERENCES public.automation_runs(owner_user_id, id) ON DELETE RESTRICT
);
CREATE INDEX automation_run_resource_references_owner_resource_idx
  ON public.automation_run_resource_references(owner_user_id, organization_id, campaign_id, prospect_id);
CREATE TRIGGER automation_run_resource_references_immutable
  BEFORE UPDATE OR DELETE ON public.automation_run_resource_references
  FOR EACH ROW EXECUTE FUNCTION public.automation_reject_immutable();
ALTER TABLE public.automation_run_resource_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_run_resource_references FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.automation_run_resource_references TO service_role;

-- Receipt records are separate from the queue and preserve replay/conflict evidence even
-- for rejected internal triggers. The source is deliberately a single fixed internal contract.
CREATE TABLE public.automation_internal_trigger_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  source_code text NOT NULL DEFAULT 'INTERNAL_RESOURCE_EVENT' CHECK (source_code = 'INTERNAL_RESOURCE_EVENT'),
  source_event_id text NOT NULL CHECK (char_length(btrim(source_event_id)) BETWEEN 1 AND 120),
  recipe_code text NOT NULL CHECK (recipe_code ~ '^RCP_[A-Z0-9_]{3,60}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  input_sha256 text NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  resource_snapshot_sha256 text NOT NULL CHECK (resource_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  due_at timestamptz NOT NULL,
  run_id uuid,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, source_code, source_event_id),
  FOREIGN KEY (owner_user_id, run_id) REFERENCES public.automation_runs(owner_user_id, id) ON DELETE RESTRICT
);
CREATE TRIGGER automation_internal_trigger_receipts_immutable
  BEFORE UPDATE OR DELETE ON public.automation_internal_trigger_receipts
  FOR EACH ROW EXECUTE FUNCTION public.automation_reject_immutable();
ALTER TABLE public.automation_internal_trigger_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_internal_trigger_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.automation_internal_trigger_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.automation_resolve_resource_reference(p_owner uuid, p_reference jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_client public.clients%ROWTYPE;
  v_campaign public.campaigns%ROWTYPE;
  v_prospect public.prospects%ROWTYPE;
  v_organization uuid;
  v_campaign_id uuid;
  v_prospect_id uuid;
  v_snapshot jsonb;
BEGIN
  IF jsonb_typeof(p_reference) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_reference) AS key WHERE key NOT IN ('organizationId','campaignId','prospectId'))
     OR NOT (p_reference ? 'organizationId')
     OR p_reference ->> 'organizationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR ((p_reference ? 'campaignId') AND (p_reference ->> 'campaignId' IS NULL OR p_reference ->> 'campaignId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
     OR ((p_reference ? 'prospectId') AND (p_reference ->> 'prospectId' IS NULL OR p_reference ->> 'prospectId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RESOURCE_REFERENCE_INVALID';
  END IF;
  v_organization := (p_reference ->> 'organizationId')::uuid;
  v_campaign_id := NULLIF(p_reference ->> 'campaignId', '')::uuid;
  v_prospect_id := NULLIF(p_reference ->> 'prospectId', '')::uuid;
  SELECT * INTO v_client FROM public.clients
   WHERE id = v_organization AND owner_user_id = p_owner AND status = 'active' FOR SHARE;
  IF NOT found THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RESOURCE_SCOPE_DENIED'; END IF;
  IF v_campaign_id IS NOT NULL THEN
    SELECT * INTO v_campaign FROM public.campaigns WHERE id = v_campaign_id AND client_id = v_client.id FOR SHARE;
    IF NOT found THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RESOURCE_SCOPE_DENIED'; END IF;
  END IF;
  IF v_prospect_id IS NOT NULL THEN
    SELECT * INTO v_prospect FROM public.prospects WHERE id = v_prospect_id AND client_id = v_client.id FOR SHARE;
    IF NOT found THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RESOURCE_SCOPE_DENIED'; END IF;
  END IF;
  v_snapshot := jsonb_build_object(
    'organizationId', v_client.id,
    'campaignId', v_campaign_id,
    'prospectId', v_prospect_id,
    'organizationName', v_client.name
  );
  RETURN v_snapshot;
END;
$$;

-- Recipe definitions remain static. A condition is a single exact equality check against
-- a boolean action result; it is not an interpreter, expression language, or graph engine.
CREATE OR REPLACE FUNCTION public.automation_assert_recipe_definition(p_definition jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_step jsonb; v_property jsonb; v_condition jsonb;
  v_count integer; v_position integer := 0; v_previous_code text := NULL;
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
       OR (v_property ->> 'type') IS NULL OR (v_property ->> 'type') NOT IN ('string','number','boolean','object','array','resourceRef') THEN
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
    v_position := v_position + 1;
    IF jsonb_typeof(v_step) IS DISTINCT FROM 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_step) AS key WHERE key NOT IN ('stepCode','sequence','actionCode','dependsOn','input','policies','requiresHumanReview','condition'))
       OR NOT (v_step ? 'stepCode') OR NOT (v_step ? 'sequence') OR NOT (v_step ? 'actionCode')
       OR NOT (v_step ? 'policies') OR NOT (v_step ? 'requiresHumanReview') THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID';
    END IF;
    v_code := v_step ->> 'stepCode'; v_action := v_step ->> 'actionCode';
    IF v_code IS NULL OR v_code !~ '^[A-Z][A-Z0-9_]{2,60}$' OR v_action IS NULL OR v_action NOT IN ('ACT_ASSIGN','ACT_TASK','ACT_NOTIFY','ACT_APOLLO_SEARCH')
       OR (v_step ->> 'sequence') IS NULL OR (v_step ->> 'sequence') !~ '^[1-9][0-9]{0,3}$' OR (v_step ->> 'sequence')::integer <> v_position
       OR jsonb_typeof(v_step -> 'policies') IS DISTINCT FROM 'array' OR jsonb_typeof(v_step -> 'requiresHumanReview') IS DISTINCT FROM 'boolean'
       OR (SELECT count(*) FROM jsonb_array_elements(p_definition -> 'steps') AS candidate WHERE candidate ->> 'stepCode' = v_code) <> 1 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID';
    END IF;
    IF v_position = 1 THEN
      IF (v_step ? 'dependsOn') OR (v_step ? 'input') OR (v_step ? 'condition') THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID'; END IF;
    ELSIF v_step ->> 'dependsOn' IS DISTINCT FROM v_previous_code OR jsonb_typeof(v_step -> 'input') <> 'object' OR octet_length((v_step -> 'input')::text) > 65536 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_GRAPH_INVALID';
    END IF;
    IF v_step ? 'condition' THEN
      v_condition := v_step -> 'condition';
      IF v_position = 1 OR jsonb_typeof(v_condition) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_condition) AS key WHERE key NOT IN ('type','field','equals'))
         OR v_condition ->> 'type' <> 'RESULT_BOOLEAN_EQUALS'
         OR v_condition ->> 'field' !~ '^[A-Za-z][A-Za-z0-9_]{0,60}$'
         OR jsonb_typeof(v_condition -> 'equals') <> 'boolean' THEN
        RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_CONDITION_INVALID';
      END IF;
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

CREATE OR REPLACE FUNCTION public.automation_recipe_input_is_valid(p_definition jsonb, p_input jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_key text; v_type text; v_value jsonb; v_required text;
BEGIN
  IF jsonb_typeof(p_input) <> 'object' OR octet_length(p_input::text) > 65536 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS key WHERE NOT ((p_definition -> 'inputSchema' -> 'properties') ? key)) THEN RETURN false; END IF;
  FOR v_required IN SELECT jsonb_array_elements_text(p_definition -> 'inputSchema' -> 'required') LOOP IF NOT (p_input ? v_required) THEN RETURN false; END IF; END LOOP;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_input) LOOP
    v_type := p_definition -> 'inputSchema' -> 'properties' -> v_key ->> 'type';
    IF (v_type = 'string' AND jsonb_typeof(v_value) <> 'string')
       OR (v_type = 'number' AND jsonb_typeof(v_value) <> 'number')
       OR (v_type = 'boolean' AND jsonb_typeof(v_value) <> 'boolean')
       OR (v_type = 'object' AND jsonb_typeof(v_value) <> 'object')
       OR (v_type = 'array' AND jsonb_typeof(v_value) <> 'array')
       OR (v_type = 'resourceRef' AND (
         jsonb_typeof(v_value) <> 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_value) AS key WHERE key NOT IN ('organizationId','campaignId','prospectId'))
         OR NOT (v_value ? 'organizationId')
         OR jsonb_typeof(v_value -> 'organizationId') <> 'string'
         OR v_value ->> 'organizationId' IS NULL
         OR v_value ->> 'organizationId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR ((v_value ? 'campaignId') AND NOT (jsonb_typeof(v_value -> 'campaignId') = 'string' AND v_value ->> 'campaignId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
         OR ((v_value ? 'prospectId') AND NOT (jsonb_typeof(v_value -> 'prospectId') = 'string' AND v_value ->> 'prospectId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
       )) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_compile_recipe_successor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.automation_runs%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE;
  v_step jsonb; v_next jsonb; v_next_input jsonb; v_next_work uuid; v_review boolean; v_provider text;
  v_condition jsonb; v_condition_met boolean := true;
BEGIN
  IF NEW.state <> 'COMPLETED' OR OLD.state = 'COMPLETED' THEN RETURN NEW; END IF;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id = NEW.owner_user_id AND id = NEW.run_id FOR SHARE;
  SELECT * INTO v_version FROM public.automation_recipe_versions WHERE owner_user_id = NEW.owner_user_id AND id = v_run.recipe_version_id FOR SHARE;
  IF jsonb_typeof(v_version.definition -> 'steps') IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
  SELECT value INTO v_step FROM jsonb_array_elements(v_version.definition -> 'steps') WHERE value ->> 'stepCode' = NEW.recipe_action_key;
  IF v_step IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_COMPILATION_INVALID'; END IF;
  SELECT value INTO v_next FROM jsonb_array_elements(v_version.definition -> 'steps') WHERE (value ->> 'sequence')::integer = NEW.sequence + 1;
  IF v_next IS NULL THEN RETURN NEW; END IF;
  IF v_next ->> 'dependsOn' <> NEW.recipe_action_key THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_COMPILATION_INVALID'; END IF;
  IF v_next ? 'condition' THEN
    v_condition := v_next -> 'condition';
    v_condition_met := NEW.result_metadata ? (v_condition ->> 'field')
      AND NEW.result_metadata -> (v_condition ->> 'field') = v_condition -> 'equals';
    IF NOT v_condition_met THEN
      PERFORM public.automation_append_event(NEW.owner_user_id, NEW.run_id, OLD.id, v_run.correlation_id,
        'RECIPE_CONDITION_NOT_MET', NEW.action_code, NULL, 'recipe_compiler', 'COMPLETED', 'COMPLETED', 'RESULT_BOOLEAN_EQUALS',
        jsonb_build_object('next_step_code', v_next ->> 'stepCode', 'field', v_condition ->> 'field'));
      RETURN NEW;
    END IF;
  END IF;
  v_next_input := v_next -> 'input'; v_review := coalesce((v_next ->> 'requiresHumanReview')::boolean, false);
  v_provider := CASE WHEN v_next ->> 'actionCode' = 'ACT_APOLLO_SEARCH' THEN 'APOLLO' ELSE 'INTERNAL' END;
  IF v_next ->> 'actionCode' = 'ACT_APOLLO_SEARCH' AND NOT public.automation_apollo_search_input_is_valid(v_next_input) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_APOLLO_INPUT_INVALID';
  END IF;
  INSERT INTO public.automation_work_items(owner_user_id, run_id, sequence, dependency_work_item_id, recipe_action_key, action_code, input, input_sha256, state, provider_code, due_at)
    VALUES (NEW.owner_user_id, NEW.run_id, NEW.sequence + 1, OLD.id, v_next ->> 'stepCode', v_next ->> 'actionCode', v_next_input,
      encode(extensions.digest(v_next_input::text, 'sha256'), 'hex'), CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END, v_provider, now())
    ON CONFLICT (owner_user_id, run_id, sequence) DO NOTHING RETURNING id INTO v_next_work;
  IF found THEN
    INSERT INTO public.automation_policy_decisions(owner_user_id, correlation_id, run_id, work_item_id, recipe_version_id, configuration_sha256, policy_code, policy_version, decision, reason_code, evaluated_input_sha256, source_code)
      VALUES (NEW.owner_user_id, v_run.correlation_id, NEW.run_id, v_next_work, v_version.id, v_version.configuration_sha256, 'POL_APPROVAL', 'V1', CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'ALLOW' END, CASE WHEN v_review THEN 'RECIPE_HUMAN_REVIEW' ELSE 'RECIPE_APPROVED' END, encode(extensions.digest(v_next_input::text, 'sha256'), 'hex'), 'recipe_compiler');
    PERFORM public.automation_append_event(NEW.owner_user_id, NEW.run_id, v_next_work, v_run.correlation_id, 'RECIPE_SUCCESSOR_COMPILED', v_next ->> 'actionCode', NULL, 'recipe_compiler', NULL, CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END, CASE WHEN v_next ? 'condition' THEN 'CONDITION_MET' ELSE 'DEPENDENCY_COMPLETED' END, jsonb_build_object('parent_work_item_id', OLD.id, 'recipe_action_key', v_next ->> 'stepCode', 'provider_code', v_provider));
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.automation_admit_internal_resource_trigger(
  p_owner uuid, p_actor uuid, p_source_event text, p_recipe_code text, p_resource_reference jsonb, p_input jsonb, p_due_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_receipt public.automation_internal_trigger_receipts%ROWTYPE;
  v_snapshot jsonb; v_snapshot_hash text; v_input_hash text; v_request_hash text;
  v_admission jsonb; v_correlation uuid;
BEGIN
  IF p_source_event IS NULL OR char_length(btrim(p_source_event)) NOT BETWEEN 1 AND 120
     OR p_recipe_code !~ '^RCP_[A-Z0-9_]{3,60}$' OR jsonb_typeof(p_input) <> 'object' OR p_due_at IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_INTERNAL_TRIGGER_INVALID';
  END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner, p_actor);
  v_snapshot := public.automation_resolve_resource_reference(p_owner, p_resource_reference);
  IF p_input -> 'resourceRef' IS DISTINCT FROM p_resource_reference THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RESOURCE_REFERENCE_MISMATCH';
  END IF;
  v_snapshot_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');
  v_input_hash := encode(extensions.digest(p_input::text, 'sha256'), 'hex');
  v_request_hash := encode(extensions.digest(jsonb_build_object('owner', p_owner, 'actor', p_actor, 'source', 'INTERNAL_RESOURCE_EVENT', 'sourceEvent', btrim(p_source_event), 'recipe', p_recipe_code, 'inputHash', v_input_hash, 'resourceSnapshotHash', v_snapshot_hash, 'dueAt', p_due_at)::text, 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text || E'\x1fINTERNAL_RESOURCE_EVENT\x1f' || btrim(p_source_event), 0));
  SELECT * INTO v_receipt FROM public.automation_internal_trigger_receipts WHERE owner_user_id = p_owner AND source_code = 'INTERNAL_RESOURCE_EVENT' AND source_event_id = btrim(p_source_event) FOR UPDATE;
  IF found THEN
    IF v_receipt.request_sha256 <> v_request_hash THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_TRIGGER_CONFLICT'; END IF;
    RETURN jsonb_build_object('replayed', true, 'run_id', v_receipt.run_id, 'correlation_id', v_receipt.correlation_id);
  END IF;
  v_admission := public.automation_admit_recipe_run(p_owner, p_actor, 'owner', p_recipe_code, p_input, p_due_at, 'internal-resource-' || btrim(p_source_event), v_request_hash);
  UPDATE public.automation_trigger_inbox SET source_code = 'INTERNAL_RESOURCE_EVENT', source_event_id = btrim(p_source_event), safe_metadata = jsonb_build_object('recipe_code', p_recipe_code, 'resource_snapshot_sha256', v_snapshot_hash)
    WHERE owner_user_id = p_owner AND id = (v_admission ->> 'trigger_id')::uuid;
  SELECT correlation_id INTO v_correlation FROM public.automation_runs WHERE owner_user_id = p_owner AND id = (v_admission ->> 'run_id')::uuid FOR SHARE;
  INSERT INTO public.automation_run_resource_references(owner_user_id, run_id, organization_id, campaign_id, prospect_id, snapshot, snapshot_sha256)
    VALUES (p_owner, (v_admission ->> 'run_id')::uuid, (v_snapshot ->> 'organizationId')::uuid, NULLIF(v_snapshot ->> 'campaignId', '')::uuid, NULLIF(v_snapshot ->> 'prospectId', '')::uuid, v_snapshot, v_snapshot_hash);
  INSERT INTO public.automation_internal_trigger_receipts(owner_user_id, source_event_id, recipe_code, request_sha256, input_sha256, resource_snapshot_sha256, due_at, run_id, correlation_id)
    VALUES (p_owner, btrim(p_source_event), p_recipe_code, v_request_hash, v_input_hash, v_snapshot_hash, p_due_at, (v_admission ->> 'run_id')::uuid, v_correlation) RETURNING * INTO v_receipt;
  PERFORM public.automation_append_event(p_owner, (v_admission ->> 'run_id')::uuid, (v_admission ->> 'work_item_id')::uuid, v_correlation, 'INTERNAL_RESOURCE_TRIGGER_ADMITTED', NULL, p_actor, 'internal_trigger', NULL, v_admission ->> 'state', 'RESOURCE_REFERENCE_RESOLVED', jsonb_build_object('source_code', 'INTERNAL_RESOURCE_EVENT', 'resource_snapshot_sha256', v_snapshot_hash));
  RETURN jsonb_build_object('replayed', false, 'run_id', v_admission ->> 'run_id', 'work_item_id', v_admission ->> 'work_item_id', 'correlation_id', v_correlation);
END;
$$;

REVOKE ALL ON FUNCTION public.automation_resolve_resource_reference(uuid,jsonb), public.automation_assert_recipe_definition(jsonb), public.automation_recipe_input_is_valid(jsonb,jsonb), public.automation_compile_recipe_successor(), public.automation_admit_internal_resource_trigger(uuid,uuid,text,text,jsonb,jsonb,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.automation_admit_internal_resource_trigger(uuid,uuid,text,text,jsonb,jsonb,timestamptz) TO service_role;
COMMIT;


-- Apply owner-scope validation to every governed admission that declares resourceRef,
-- including manual admission. The internal envelope remains the only source that stores
-- the immutable run snapshot/receipt contract above.
BEGIN;
CREATE FUNCTION public.automation_assert_recipe_input_resource_ownership(p_owner uuid, p_definition jsonb, p_input jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_key text; v_property jsonb;
BEGIN
  FOR v_key, v_property IN SELECT key, value FROM jsonb_each(p_definition -> 'inputSchema' -> 'properties') LOOP
    IF v_property ->> 'type' = 'resourceRef' AND p_input ? v_key THEN
      PERFORM public.automation_resolve_resource_reference(p_owner, p_input -> v_key);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_admit_recipe_run(
  p_owner uuid, p_actor uuid, p_actor_kind text, p_recipe_code text, p_input jsonb, p_due_at timestamptz, p_idempotency text, p_request_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_recipe public.automation_recipes%ROWTYPE; v_version public.automation_recipe_versions%ROWTYPE; v_activation public.automation_recipe_activations%ROWTYPE; v_assignment public.automation_recipe_assignments%ROWTYPE;
  v_trigger public.automation_trigger_inbox%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_root jsonb; v_action text; v_step_code text; v_input_hash text; v_work uuid; v_review boolean; v_policy_decision text; v_provider text;
BEGIN
  IF p_actor_kind NOT IN ('owner','employee') OR p_recipe_code !~ '^RCP_[A-Z0-9_]{3,60}$' OR p_idempotency !~ '^[A-Za-z0-9._:-]{16,200}$' OR p_request_hash !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_input) <> 'object' OR p_due_at IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR'; END IF;
  SELECT * INTO v_recipe FROM public.automation_recipes WHERE owner_user_id = p_owner AND code = p_recipe_code AND status = 'ACTIVE' FOR SHARE;
  SELECT * INTO v_activation FROM public.automation_recipe_activations WHERE owner_user_id = p_owner AND recipe_id = v_recipe.id AND status = 'ACTIVE' FOR SHARE;
  SELECT * INTO v_version FROM public.automation_recipe_versions WHERE owner_user_id = p_owner AND id = v_activation.recipe_version_id AND status = 'APPROVED' FOR SHARE;
  IF NOT found OR v_recipe.id IS NULL OR v_version.id IS NULL THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_NOT_ACTIVE'; END IF;
  IF NOT public.automation_recipe_input_is_valid(v_version.definition,p_input) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RECIPE_INPUT_INVALID'; END IF;
  PERFORM public.automation_assert_recipe_input_resource_ownership(p_owner, v_version.definition, p_input);
  v_root := v_version.definition -> 'steps' -> 0; v_action := v_root ->> 'actionCode'; v_step_code := v_root ->> 'stepCode';
  v_provider := CASE WHEN v_action = 'ACT_APOLLO_SEARCH' THEN 'APOLLO' ELSE 'INTERNAL' END;
  IF v_action = 'ACT_APOLLO_SEARCH' AND NOT public.automation_apollo_search_input_is_valid(p_input) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_APOLLO_INPUT_INVALID'; END IF;
  v_input_hash := encode(extensions.digest(p_input::text,'sha256'),'hex');
  IF p_actor_kind = 'owner' THEN PERFORM public.automation_assert_recipe_owner(p_owner,p_actor);
  ELSE
    SELECT * INTO v_assignment FROM public.automation_recipe_assignments a JOIN public.users u ON u.id=a.employee_user_id WHERE a.owner_user_id=p_owner AND a.recipe_version_id=v_version.id AND a.employee_user_id=p_actor AND a.status='ACTIVE' AND u.role='employee' AND u.status='active' AND u.portal_owner_user_id=p_owner FOR SHARE OF a,u;
    IF NOT found OR NOT ((v_assignment.allowed_inputs -> v_action) ? v_input_hash) THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_EMPLOYEE_SCOPE_DENIED'; END IF;
  END IF;
  SELECT * INTO v_trigger FROM public.automation_trigger_inbox WHERE owner_user_id=p_owner AND source_code='MANUAL' AND source_event_id=p_idempotency FOR UPDATE;
  IF found THEN IF v_trigger.payload_sha256 <> p_request_hash THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_IDEMPOTENCY_CONFLICT'; END IF; RETURN jsonb_build_object('trigger_id',v_trigger.id,'run_id',v_trigger.run_id,'replayed',true); END IF;
  INSERT INTO public.automation_trigger_inbox(owner_user_id,source_code,source_event_id,payload_sha256,safe_metadata) VALUES (p_owner,'MANUAL',p_idempotency,p_request_hash,jsonb_build_object('recipe_code',p_recipe_code)) RETURNING * INTO v_trigger;
  INSERT INTO public.automation_runs(owner_user_id,trigger_inbox_id,recipe_version_id,configuration_sha256,recipe_assignment_id,assignment_allowed_inputs_sha256,correlation_id,idempotency_key,request_sha256,requested_by_user_id,requested_by_kind) VALUES (p_owner,v_trigger.id,v_version.id,v_version.configuration_sha256,CASE WHEN p_actor_kind='employee' THEN v_assignment.id END,CASE WHEN p_actor_kind='employee' THEN v_assignment.allowed_inputs_sha256 END,v_trigger.correlation_id,p_idempotency,p_request_hash,p_actor,p_actor_kind) RETURNING * INTO v_run;
  v_review := coalesce((v_root ->> 'requiresHumanReview')::boolean,false);
  INSERT INTO public.automation_work_items(owner_user_id,run_id,sequence,recipe_action_key,action_code,input,input_sha256,state,provider_code,due_at) VALUES (p_owner,v_run.id,1,v_step_code,v_action,p_input,v_input_hash,CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,v_provider,p_due_at) RETURNING id INTO v_work;
  v_policy_decision := CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'ALLOW' END;
  INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,recipe_version_id,configuration_sha256,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,actor_user_id,source_code) VALUES (p_owner,v_trigger.correlation_id,v_run.id,v_work,v_version.id,v_version.configuration_sha256,'POL_APPROVAL','V1',v_policy_decision,CASE WHEN v_review THEN 'RECIPE_HUMAN_REVIEW' ELSE 'RECIPE_APPROVED' END,v_input_hash,p_actor,'recipe_admission');
  INSERT INTO public.automation_claim_fairness(owner_user_id) VALUES (p_owner) ON CONFLICT DO NOTHING;
  UPDATE public.automation_trigger_inbox SET run_id=v_run.id,status='PROCESSED',processed_at=now() WHERE id=v_trigger.id;
  PERFORM public.automation_recompute_run(p_owner,v_run.id);
  PERFORM public.automation_append_event(p_owner,v_run.id,v_work,v_trigger.correlation_id,'RECIPE_ADMITTED',v_action,p_actor,'recipe_admission',NULL,CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,CASE WHEN v_review THEN 'RECIPE_HUMAN_REVIEW' ELSE 'RECIPE_APPROVED' END,jsonb_build_object('recipe_code',p_recipe_code,'recipe_version_id',v_version.id,'provider_code',v_provider));
  RETURN jsonb_build_object('trigger_id',v_trigger.id,'run_id',v_run.id,'work_item_id',v_work,'state',CASE WHEN v_review THEN 'HUMAN_REVIEW' ELSE 'WAITING' END,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.automation_assert_recipe_input_resource_ownership(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
COMMIT;