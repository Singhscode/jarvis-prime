-- Phase 11 Step 6H: Apollo remains disabled by default. This adds only durable,
-- owner-scoped request/concurrency configuration and safe result reconciliation.
-- It neither creates a provider client nor enables an external request.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE public.automation_provider_action_configs (
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  provider_code text NOT NULL CHECK (provider_code = 'APOLLO'),
  action_code text NOT NULL CHECK (action_code = 'ACT_APOLLO_SEARCH'),
  enabled boolean NOT NULL DEFAULT false,
  max_requests_per_window integer,
  max_concurrent_requests integer,
  updated_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, provider_code, action_code),
  CHECK (
    (NOT enabled AND max_requests_per_window IS NULL AND max_concurrent_requests IS NULL)
    OR (enabled
      AND max_requests_per_window BETWEEN 1 AND 100000
      AND max_concurrent_requests BETWEEN 1 AND 100000)
  )
);
ALTER TABLE public.automation_provider_action_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_provider_action_configs FROM PUBLIC, anon, authenticated, service_role;

-- This RPC is service-role-only. No browser route is created for it. A disabled
-- row carries no invented budget; enabling requires explicit server-supplied limits.
CREATE OR REPLACE FUNCTION public.automation_configure_apollo_read(
  p_owner uuid, p_actor uuid, p_enabled boolean,
  p_max_requests integer DEFAULT NULL, p_max_concurrent integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_enabled IS NULL
     OR (p_enabled AND (p_max_requests NOT BETWEEN 1 AND 100000 OR p_max_concurrent NOT BETWEEN 1 AND 100000))
     OR (NOT p_enabled AND (p_max_requests IS NOT NULL OR p_max_concurrent IS NOT NULL)) THEN
    RAISE EXCEPTION USING errcode='P0001', message='AUTOMATION_APOLLO_CONFIG_INVALID';
  END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner,p_actor);
  INSERT INTO public.automation_provider_action_configs(
    owner_user_id,provider_code,action_code,enabled,max_requests_per_window,max_concurrent_requests,updated_by_user_id
  ) VALUES (
    p_owner,'APOLLO','ACT_APOLLO_SEARCH',p_enabled,
    CASE WHEN p_enabled THEN p_max_requests END,
    CASE WHEN p_enabled THEN p_max_concurrent END,p_actor
  ) ON CONFLICT (owner_user_id,provider_code,action_code) DO UPDATE
    SET enabled=excluded.enabled,max_requests_per_window=excluded.max_requests_per_window,
        max_concurrent_requests=excluded.max_concurrent_requests,
        updated_by_user_id=excluded.updated_by_user_id,updated_at=now();
  RETURN jsonb_build_object('provider_code','APOLLO','action_code','ACT_APOLLO_SEARCH','enabled',p_enabled);
END;
$$;

-- Apollo result evidence is restricted to a bounded, raw-record-free summary.
CREATE OR REPLACE FUNCTION public.automation_assert_apollo_result(p_next text, p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_outcome text; v_completeness text; v_count integer;
BEGIN
  IF jsonb_typeof(p_result) <> 'object'
     OR p_result ->> 'provider' <> 'APOLLO'
     OR jsonb_typeof(p_result -> 'providerCorrelationId') <> 'string'
     OR char_length(p_result ->> 'providerCorrelationId') NOT BETWEEN 1 AND 200
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_result) AS key
                WHERE key NOT IN ('provider','outcome','completeness','returnedCount','providerCorrelationId','code')) THEN
    RAISE EXCEPTION USING errcode='P0001', message='AUTOMATION_APOLLO_RESULT_INVALID';
  END IF;
  v_outcome := p_result ->> 'outcome';
  v_completeness := p_result ->> 'completeness';
  IF p_next='COMPLETED' THEN
    IF v_outcome NOT IN ('COMPLETE_SUCCESS','PARTIAL_SUCCESS','SUCCESS_UNKNOWN_COMPLETENESS')
       OR v_completeness NOT IN ('COMPLETE','PARTIAL','UNKNOWN')
       OR jsonb_typeof(p_result -> 'returnedCount') <> 'number'
       OR (p_result ->> 'returnedCount') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION USING errcode='P0001', message='AUTOMATION_APOLLO_RESULT_INVALID';
    END IF;
    v_count := (p_result ->> 'returnedCount')::integer;
    IF v_count NOT BETWEEN 0 AND 50
       OR (v_outcome='COMPLETE_SUCCESS' AND v_completeness<>'COMPLETE')
       OR (v_outcome='PARTIAL_SUCCESS' AND v_completeness<>'PARTIAL')
       OR (v_outcome='SUCCESS_UNKNOWN_COMPLETENESS' AND v_completeness<>'UNKNOWN') THEN
      RAISE EXCEPTION USING errcode='P0001', message='AUTOMATION_APOLLO_RESULT_INVALID';
    END IF;
  ELSIF p_next='RETRYABLE' THEN
    IF v_outcome<>'RETRYABLE_FAILURE' OR v_completeness<>'UNKNOWN' OR p_result ? 'returnedCount' THEN
      RAISE EXCEPTION USING errcode='P0001', message='AUTOMATION_APOLLO_RESULT_INVALID';
    END IF;
  ELSIF p_next='FAILED' THEN
    IF v_outcome<>'TERMINAL_FAILURE' OR v_completeness<>'UNKNOWN' OR p_result ? 'returnedCount' THEN
      RAISE EXCEPTION USING errcode='P0001', message='AUTOMATION_APOLLO_RESULT_INVALID';
    END IF;
  ELSIF p_next='HUMAN_REVIEW' THEN
    IF v_outcome<>'UNKNOWN_OUTCOME' OR v_completeness<>'UNKNOWN' OR p_result ? 'returnedCount' THEN
      RAISE EXCEPTION USING errcode='P0001', message='AUTOMATION_APOLLO_RESULT_INVALID';
    END IF;
  END IF;
END;
$$;

-- Reuses the Step 2 six-link model. For Apollo, the owner/action daily and
-- concurrent slots are explicit configuration, not a vendor-credit calculation.
CREATE OR REPLACE FUNCTION public.automation_reserve_work(
  p_owner uuid, p_recipe uuid, p_action text, p_work uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_existing integer; v_link_count integer; v_bucket record; v_day timestamptz:=date_trunc('day',now());
  v_apollo public.automation_provider_action_configs%ROWTYPE; v_action_daily integer:=100000; v_action_concurrent integer:=2;
BEGIN
  IF p_action='ACT_APOLLO_SEARCH' THEN
    SELECT * INTO v_apollo FROM public.automation_provider_action_configs
      WHERE owner_user_id=p_owner AND provider_code='APOLLO' AND action_code='ACT_APOLLO_SEARCH' FOR UPDATE;
    IF NOT found OR NOT v_apollo.enabled THEN RETURN false; END IF;
    v_action_daily:=v_apollo.max_requests_per_window; v_action_concurrent:=v_apollo.max_concurrent_requests;
  END IF;
  SELECT count(*) INTO v_link_count FROM public.automation_work_reservations WHERE work_item_id=p_work;
  IF v_link_count>0 THEN
    IF v_link_count<>6 THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RESERVATION_CORRUPT'; END IF;
    PERFORM 1 FROM public.automation_work_reservations wr JOIN public.automation_quota_reservations qr ON qr.id=wr.reservation_id
      WHERE wr.work_item_id=p_work FOR UPDATE OF wr,qr;
    IF p_action='ACT_APOLLO_SEARCH' THEN
      UPDATE public.automation_quota_reservations SET limit_value=CASE WHEN reservation_type='DAILY' THEN v_action_daily ELSE v_action_concurrent END,updated_at=now()
       WHERE owner_user_id=p_owner AND scope_type='ACTION' AND scope_id=p_action AND policy_key='POL_LIMIT';
    END IF;
    SELECT count(*) INTO v_existing FROM public.automation_work_reservations wr JOIN public.automation_quota_reservations qr ON qr.id=wr.reservation_id
      WHERE wr.work_item_id=p_work AND NOT wr.active AND ((wr.reservation_type='DAILY' AND qr.reserved+qr.consumed>=qr.limit_value) OR (wr.reservation_type='CONCURRENT' AND qr.reserved>=qr.limit_value));
    IF v_existing>0 THEN RETURN false; END IF;
    UPDATE public.automation_quota_reservations qr SET reserved=reserved+1,updated_at=now() FROM public.automation_work_reservations wr
      WHERE wr.work_item_id=p_work AND wr.reservation_id=qr.id AND NOT wr.active;
    UPDATE public.automation_work_reservations SET active=true,released_at=null WHERE work_item_id=p_work AND NOT active;
    RETURN true;
  END IF;
  FOR v_bucket IN SELECT * FROM (VALUES
    ('OWNER'::text,p_owner::text,'DAILY'::text,v_day,100000),('RECIPE',p_recipe::text,'DAILY',v_day,100000),('ACTION',p_action,'DAILY',v_day,v_action_daily),
    ('OWNER',p_owner::text,'CONCURRENT','epoch'::timestamptz,10),('RECIPE',p_recipe::text,'CONCURRENT','epoch'::timestamptz,10),('ACTION',p_action,'CONCURRENT','epoch'::timestamptz,v_action_concurrent)
  ) AS b(scope_type,scope_id,reservation_type,window_start,limit_value) LOOP
    INSERT INTO public.automation_quota_reservations(owner_user_id,scope_type,scope_id,reservation_type,policy_key,window_start,limit_value)
      VALUES(p_owner,v_bucket.scope_type,v_bucket.scope_id,v_bucket.reservation_type,'POL_LIMIT',v_bucket.window_start,v_bucket.limit_value)
      ON CONFLICT(owner_user_id,scope_type,scope_id,reservation_type,policy_key,window_start) DO UPDATE
        SET limit_value=CASE WHEN p_action='ACT_APOLLO_SEARCH' AND excluded.scope_type='ACTION' THEN excluded.limit_value ELSE public.automation_quota_reservations.limit_value END;
  END LOOP;
  PERFORM 1 FROM public.automation_quota_reservations WHERE owner_user_id=p_owner
    AND ((scope_type='OWNER' AND scope_id=p_owner::text) OR (scope_type='RECIPE' AND scope_id=p_recipe::text) OR (scope_type='ACTION' AND scope_id=p_action))
    AND (reservation_type='CONCURRENT' OR window_start=v_day) FOR UPDATE;
  SELECT count(*) INTO v_existing FROM public.automation_quota_reservations WHERE owner_user_id=p_owner
    AND ((scope_type='OWNER' AND scope_id=p_owner::text) OR (scope_type='RECIPE' AND scope_id=p_recipe::text) OR (scope_type='ACTION' AND scope_id=p_action))
    AND (reservation_type='CONCURRENT' OR window_start=v_day)
    AND ((reservation_type='DAILY' AND reserved+consumed>=limit_value) OR (reservation_type='CONCURRENT' AND reserved>=limit_value));
  IF v_existing>0 THEN RETURN false; END IF;
  FOR v_bucket IN SELECT * FROM public.automation_quota_reservations WHERE owner_user_id=p_owner
    AND ((scope_type='OWNER' AND scope_id=p_owner::text) OR (scope_type='RECIPE' AND scope_id=p_recipe::text) OR (scope_type='ACTION' AND scope_id=p_action))
    AND (reservation_type='CONCURRENT' OR window_start=v_day) LOOP
    UPDATE public.automation_quota_reservations SET reserved=reserved+1,updated_at=now() WHERE id=v_bucket.id;
    INSERT INTO public.automation_work_reservations(owner_user_id,work_item_id,reservation_id,reservation_type) VALUES(p_owner,p_work,v_bucket.id,v_bucket.reservation_type);
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_claim_work(p_worker text,p_limit integer DEFAULT 10,p_lease_seconds integer DEFAULT 60)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_owner uuid; v_owners uuid[]:=ARRAY[]::uuid[]; v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_recipe_id uuid; v_reason text; v_apollo public.automation_provider_action_configs%ROWTYPE; v_cycle bigint:=floor(extract(epoch FROM clock_timestamp())*1000000)::bigint; v_count integer:=0; v_pass integer;
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
    IF v_reason IS NULL AND v_work.provider_code='APOLLO' THEN
      SELECT * INTO v_apollo FROM public.automation_provider_action_configs WHERE owner_user_id=v_work.owner_user_id AND provider_code='APOLLO' AND action_code='ACT_APOLLO_SEARCH' FOR UPDATE;
      IF NOT found OR NOT v_apollo.enabled THEN v_reason:='APOLLO_PROVIDER_NOT_READY'; END IF;
    END IF;
    IF v_reason IS NULL AND NOT exists (SELECT 1 FROM public.automation_recipe_versions rv WHERE rv.owner_user_id=v_work.owner_user_id AND rv.id=v_run.recipe_version_id AND rv.status='APPROVED' AND rv.configuration_sha256=v_run.configuration_sha256) THEN v_reason:='VERSION_NOT_APPROVED'; END IF;
    IF v_reason IS NOT NULL THEN
      UPDATE public.automation_work_items SET state='BLOCKED',last_reason_code=v_reason,updated_at=now() WHERE id=v_work.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code) VALUES(v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_LIMIT','V1','BLOCK',v_reason,v_work.input_sha256,'claim');
      PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id); PERFORM public.automation_append_event(v_work.owner_user_id,v_run.id,v_work.id,v_run.correlation_id,'WORK_BLOCKED',v_work.action_code,NULL,'claim',v_work.state,'BLOCKED',v_reason,'{}'::jsonb); CONTINUE;
    END IF;
    IF NOT public.automation_reserve_work(v_work.owner_user_id,v_recipe_id,v_work.action_code,v_work.id) THEN
      UPDATE public.automation_work_items SET state='BLOCKED',last_reason_code='QUOTA_DENIED',updated_at=now() WHERE id=v_work.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code) VALUES(v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_LIMIT','V1','BLOCK','QUOTA_DENIED',v_work.input_sha256,'claim');
      PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id); PERFORM public.automation_append_event(v_work.owner_user_id,v_run.id,v_work.id,v_run.correlation_id,'WORK_BLOCKED',v_work.action_code,NULL,'claim',v_work.state,'BLOCKED','QUOTA_DENIED','{}'::jsonb); CONTINUE;
    END IF;
    UPDATE public.automation_work_items SET state='RUNNING',attempt_count=attempt_count+1,attempt_id=gen_random_uuid(),attempt_phase='CLAIMED',lease_owner=p_worker,lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>p_lease_seconds),started_at=coalesce(started_at,now()),updated_at=now() WHERE id=v_work.id RETURNING * INTO v_work;
    PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id); PERFORM public.automation_append_event(v_work.owner_user_id,v_work.run_id,v_work.id,v_run.correlation_id,'WORK_CLAIMED',v_work.action_code,NULL,'worker','WAITING','RUNNING',NULL,jsonb_build_object('worker',p_worker)); UPDATE public.automation_claim_fairness SET last_served_cycle=greatest(last_served_cycle+1,v_cycle),updated_at=now() WHERE owner_user_id=v_work.owner_user_id; v_count:=v_count+1;
    RETURN NEXT jsonb_build_object('id',v_work.id,'owner_user_id',v_work.owner_user_id,'run_id',v_work.run_id,'action_code',v_work.action_code,'provider_code',v_work.provider_code,'input',v_work.input,'lease_token',v_work.lease_token,'lease_until',v_work.lease_until,'attempt_count',v_work.attempt_count,'attempt_phase',v_work.attempt_phase,'requested_by_user_id',v_run.requested_by_user_id,'requested_by_kind',v_run.requested_by_kind,'correlation_id',v_run.correlation_id);
  END LOOP; END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_mark_dispatching(p_work uuid,p_worker text,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_recipe_id uuid; v_assignment public.automation_recipe_assignments%ROWTYPE; v_reason text; v_apollo public.automation_provider_action_configs%ROWTYPE; v_provider_idempotency text; v_provider_correlation text;
BEGIN
  SELECT * INTO v_work FROM public.automation_work_items WHERE id=p_work FOR UPDATE;
  IF NOT found OR v_work.state<>'RUNNING' OR v_work.lease_owner<>p_worker OR v_work.lease_token<>p_token OR v_work.lease_until<=now() OR v_work.attempt_phase<>'CLAIMED' THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LEASE_LOST'; END IF;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_work.owner_user_id AND id=v_work.run_id FOR UPDATE;
  SELECT recipe_id INTO v_recipe_id FROM public.automation_recipe_versions WHERE owner_user_id=v_work.owner_user_id AND id=v_run.recipe_version_id FOR SHARE;
  PERFORM public.automation_lock_controls(v_work.owner_user_id,v_recipe_id,v_work.run_id,v_work.provider_code); v_reason:=public.automation_control_reason(v_work.owner_user_id,v_recipe_id,v_work.run_id,v_work.provider_code);
  IF v_reason IS NULL AND v_work.provider_code='APOLLO' THEN
    SELECT * INTO v_apollo FROM public.automation_provider_action_configs WHERE owner_user_id=v_work.owner_user_id AND provider_code='APOLLO' AND action_code='ACT_APOLLO_SEARCH' FOR UPDATE;
    IF NOT found OR NOT v_apollo.enabled THEN v_reason:='APOLLO_PROVIDER_NOT_READY'; END IF;
  END IF;
  IF v_reason IS NULL AND NOT exists (SELECT 1 FROM public.automation_recipe_versions rv WHERE rv.owner_user_id=v_work.owner_user_id AND rv.id=v_run.recipe_version_id AND rv.status='APPROVED' AND rv.configuration_sha256=v_run.configuration_sha256) THEN v_reason:='VERSION_NOT_APPROVED'; END IF;
  IF v_reason IS NULL AND v_run.requested_by_kind='employee' THEN
    SELECT a.* INTO v_assignment FROM public.automation_recipe_assignments a JOIN public.users u ON u.id=a.employee_user_id WHERE a.owner_user_id=v_work.owner_user_id AND a.id=v_run.recipe_assignment_id AND a.recipe_version_id=v_run.recipe_version_id AND a.employee_user_id=v_run.requested_by_user_id AND a.status='ACTIVE' AND u.role='employee' AND u.status='active' AND u.portal_owner_user_id=v_work.owner_user_id FOR SHARE OF a,u;
    IF NOT found OR v_assignment.allowed_inputs_sha256<>v_run.assignment_allowed_inputs_sha256 OR NOT ((v_assignment.allowed_inputs -> v_work.action_code) ? v_work.input_sha256) THEN v_reason:='EMPLOYEE_SCOPE_REVOKED'; END IF;
  END IF;
  IF v_reason IS NULL AND (SELECT count(*) FROM public.automation_work_reservations WHERE work_item_id=v_work.id AND active)<>6 THEN v_reason:='RESERVATION_INVALID'; END IF;
  IF v_reason IS NOT NULL THEN
    PERFORM public.automation_release_work_reservations(v_work.id,false); UPDATE public.automation_work_items SET state=CASE WHEN v_reason LIKE '%STOP%' THEN 'CANCELLED' ELSE 'BLOCKED' END,lease_owner=NULL,lease_token=NULL,lease_until=NULL,last_reason_code=v_reason,completed_at=CASE WHEN v_reason LIKE '%STOP%' THEN now() ELSE NULL END,updated_at=now() WHERE id=v_work.id;
    INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code) VALUES(v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_ADMISSION','V1','BLOCK',v_reason,v_work.input_sha256,'dispatch'); PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id); PERFORM public.automation_append_event(v_work.owner_user_id,v_run.id,v_work.id,v_run.correlation_id,'DISPATCH_DENIED',v_work.action_code,NULL,'worker','RUNNING','BLOCKED',v_reason,'{}'::jsonb); RETURN jsonb_build_object('allowed',false,'state','BLOCKED','reason',v_reason);
  END IF;
  v_provider_idempotency:=CASE WHEN v_work.provider_code='APOLLO' THEN 'phase11:APOLLO:'||v_work.action_code||':'||v_work.id::text ELSE NULL END;
  v_provider_correlation:=CASE WHEN v_work.provider_code='APOLLO' THEN 'phase11:APOLLO:'||v_run.correlation_id::text ELSE NULL END;
  UPDATE public.automation_work_items SET attempt_phase='DISPATCHING',dispatch_started_at=now(),provider_idempotency_key=v_provider_idempotency,provider_correlation_id=v_provider_correlation,updated_at=now() WHERE id=v_work.id;
  PERFORM public.automation_append_event(v_work.owner_user_id,v_run.id,v_work.id,v_run.correlation_id,'WORK_DISPATCHING',v_work.action_code,NULL,'worker','RUNNING','RUNNING',NULL,jsonb_build_object('provider_code',v_work.provider_code)); RETURN jsonb_build_object('allowed',true,'state','RUNNING');
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_transition_work(p_work uuid,p_worker text,p_token uuid,p_expected text,p_next text,p_reason text,p_result jsonb DEFAULT '{}'::jsonb,p_due timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE;
BEGIN
  IF p_expected<>'RUNNING' OR p_next NOT IN ('WAITING','COMPLETED','RETRYABLE','FAILED','BLOCKED','CANCELLED','HUMAN_REVIEW') OR jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>16384 THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_TRANSITION_INVALID'; END IF;
  SELECT * INTO v_work FROM public.automation_work_items WHERE id=p_work FOR UPDATE;
  IF NOT found THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LEASE_LOST'; END IF;
  IF v_work.state<>p_expected OR v_work.lease_owner<>p_worker OR v_work.lease_token<>p_token OR v_work.lease_until<=now() THEN
    SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_work.owner_user_id AND id=v_work.run_id;
    PERFORM public.automation_append_event(v_work.owner_user_id,v_work.run_id,v_work.id,v_run.correlation_id,'LATE_RESULT',v_work.action_code,NULL,'worker',v_work.state,v_work.state,'LATE_RESULT',jsonb_build_object('result_sha256',encode(extensions.digest(p_result::text,'sha256'),'hex'))); RETURN jsonb_build_object('work_item_id',v_work.id,'state',v_work.state,'late',true);
  END IF;
  IF p_next='RETRYABLE' AND v_work.attempt_count>=v_work.max_attempts THEN p_next:='FAILED'; p_reason:='ATTEMPTS_EXHAUSTED'; IF v_work.provider_code='APOLLO' THEN p_result:=jsonb_build_object('provider','APOLLO','outcome','TERMINAL_FAILURE','completeness','UNKNOWN','providerCorrelationId',v_work.provider_correlation_id,'code',p_reason); END IF; END IF;
  IF v_work.provider_code='APOLLO' AND p_next IN ('COMPLETED','RETRYABLE','FAILED','HUMAN_REVIEW') THEN PERFORM public.automation_assert_apollo_result(p_next,p_result); END IF;
  PERFORM public.automation_release_work_reservations(v_work.id,p_next='COMPLETED');
  UPDATE public.automation_work_items SET state=p_next,attempt_phase='RESULT_RECORDED',lease_owner=NULL,lease_token=NULL,lease_until=NULL,due_at=coalesce(p_due,due_at),last_reason_code=p_reason,result_metadata=p_result,completed_at=CASE WHEN p_next IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE NULL END,updated_at=now() WHERE id=p_work RETURNING * INTO v_work;
  PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id); SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_work.owner_user_id AND id=v_work.run_id;
  PERFORM public.automation_append_event(v_work.owner_user_id,v_work.run_id,v_work.id,v_run.correlation_id,'WORK_TRANSITION',v_work.action_code,NULL,'worker',p_expected,p_next,p_reason,'{}'::jsonb); RETURN jsonb_build_object('work_item_id',v_work.id,'state',v_work.state,'run_state',v_run.state);
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_recover_stale(p_limit integer DEFAULT 50)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_recipe_id uuid; v_next text; v_reason text; v_result jsonb;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_VALIDATION_ERROR'; END IF;
  FOR v_work IN SELECT * FROM public.automation_work_items WHERE state='RUNNING' AND lease_until<now() ORDER BY lease_until,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
    SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_work.owner_user_id AND id=v_work.run_id FOR UPDATE; SELECT recipe_id INTO v_recipe_id FROM public.automation_recipe_versions WHERE owner_user_id=v_work.owner_user_id AND id=v_run.recipe_version_id FOR SHARE;
    PERFORM public.automation_lock_controls(v_work.owner_user_id,v_recipe_id,v_work.run_id,v_work.provider_code); v_reason:=public.automation_control_reason(v_work.owner_user_id,v_recipe_id,v_work.run_id,v_work.provider_code);
    IF v_run.cancelled_at IS NOT NULL OR v_reason LIKE '%STOP%' THEN v_next:='CANCELLED'; v_reason:=coalesce(v_reason,'RUN_CANCELLED');
    ELSIF v_work.attempt_phase='CLAIMED' AND v_work.attempt_count>=v_work.max_attempts THEN v_next:='FAILED'; v_reason:='ATTEMPTS_EXHAUSTED';
    ELSIF v_work.attempt_phase='CLAIMED' AND v_reason IS NULL THEN v_next:='RETRYABLE'; v_reason:='LEASE_EXPIRED_UNSTARTED';
    ELSIF v_work.attempt_phase='CLAIMED' THEN v_next:='BLOCKED';
    ELSE v_next:='HUMAN_REVIEW'; v_reason:='LEASE_EXPIRED_DISPATCHING'; END IF;
    v_result:=CASE WHEN v_work.provider_code='APOLLO' AND v_next='HUMAN_REVIEW' THEN jsonb_build_object('provider','APOLLO','outcome','UNKNOWN_OUTCOME','completeness','UNKNOWN','providerCorrelationId',v_work.provider_correlation_id,'code',v_reason) ELSE v_work.result_metadata END;
    PERFORM public.automation_release_work_reservations(v_work.id,false);
    UPDATE public.automation_work_items SET state=v_next,lease_owner=NULL,lease_token=NULL,lease_until=NULL,last_reason_code=v_reason,due_at=CASE WHEN v_next='RETRYABLE' THEN now()+interval '1 second' ELSE due_at END,result_metadata=v_result,completed_at=CASE WHEN v_next IN ('FAILED','CANCELLED') THEN now() ELSE NULL END,updated_at=now() WHERE id=v_work.id;
    PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id); PERFORM public.automation_append_event(v_work.owner_user_id,v_work.run_id,v_work.id,v_run.correlation_id,'LEASE_RECOVERED',v_work.action_code,NULL,'recovery','RUNNING',v_next,v_reason,'{}'::jsonb); RETURN NEXT jsonb_build_object('work_item_id',v_work.id,'state',v_next);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.automation_configure_apollo_read(uuid,uuid,boolean,integer,integer), public.automation_assert_apollo_result(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.automation_configure_apollo_read(uuid,uuid,boolean,integer,integer), public.automation_claim_work(text,integer,integer), public.automation_mark_dispatching(uuid,text,uuid), public.automation_transition_work(uuid,text,uuid,text,text,text,jsonb,timestamptz), public.automation_recover_stale(integer) TO service_role;
COMMIT;
