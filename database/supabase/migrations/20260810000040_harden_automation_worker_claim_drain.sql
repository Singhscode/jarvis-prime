-- Queue and worker hardening over the existing durable work-item queue.
-- Relinquishes only an unstarted, still-owned lease during graceful worker drain.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE FUNCTION public.automation_relinquish_unstarted_claim(p_work uuid,p_worker text,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid; v_run_id uuid; v_recipe_id uuid;
  v_run public.automation_runs%ROWTYPE; v_work public.automation_work_items%ROWTYPE;
BEGIN
  IF p_work IS NULL OR p_token IS NULL OR p_worker IS NULL OR char_length(btrim(p_worker)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_VALIDATION_ERROR';
  END IF;

  SELECT w.owner_user_id,w.run_id,rv.recipe_id INTO v_owner,v_run_id,v_recipe_id
    FROM public.automation_work_items w
    JOIN public.automation_runs r ON r.owner_user_id=w.owner_user_id AND r.id=w.run_id
    JOIN public.automation_recipe_versions rv ON rv.owner_user_id=r.owner_user_id AND rv.id=r.recipe_version_id
   WHERE w.id=p_work;
  IF NOT found THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_LEASE_LOST'; END IF;

  -- Keep the canonical recipe -> run -> work lock order used by completion.
  PERFORM 1 FROM public.automation_recipes WHERE owner_user_id=v_owner AND id=v_recipe_id FOR SHARE;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_owner AND id=v_run_id FOR UPDATE;
  SELECT * INTO v_work FROM public.automation_work_items WHERE owner_user_id=v_owner AND id=p_work FOR UPDATE;

  IF v_run.cancelled_at IS NOT NULL OR v_work.state<>'RUNNING' OR v_work.lease_owner<>p_worker
     OR v_work.lease_token<>p_token OR v_work.lease_until<=now() OR v_work.attempt_phase<>'CLAIMED' THEN
    RETURN jsonb_build_object('work_item_id',p_work,'state',v_work.state,'late',true);
  END IF;

  PERFORM public.automation_release_work_reservations(v_work.id,false);
  UPDATE public.automation_work_items
     SET state='WAITING',attempt_count=greatest(0,attempt_count-1),attempt_id=NULL,attempt_phase=NULL,
         dispatch_started_at=NULL,lease_owner=NULL,lease_token=NULL,lease_until=NULL,
         due_at=least(due_at,now()),last_reason_code='WORKER_DRAINING',updated_at=now()
   WHERE id=v_work.id
   RETURNING * INTO v_work;
  PERFORM public.automation_recompute_run(v_owner,v_run_id);
  PERFORM public.automation_append_event(v_owner,v_run_id,v_work.id,v_run.correlation_id,
    'WORK_CLAIM_RELEASED',v_work.action_code,NULL,'worker','RUNNING','WAITING','WORKER_DRAINING',
    jsonb_build_object('worker',p_worker));
  RETURN jsonb_build_object('work_item_id',v_work.id,'state',v_work.state,'relinquished',true);
END;
$$;

REVOKE ALL ON FUNCTION public.automation_relinquish_unstarted_claim(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.automation_relinquish_unstarted_claim(uuid,text,uuid) TO service_role;

-- The V2 worker requires this release RPC and grant, so it cannot become ready before this migration commits.
ALTER TABLE public.automation_execution_contract
  DROP CONSTRAINT automation_execution_contract_worker_version_check;
UPDATE public.automation_execution_contract
   SET worker_version = 'AUTOMATION_WORKER_V2', updated_at = now()
 WHERE singleton;
ALTER TABLE public.automation_execution_contract
  ADD CONSTRAINT automation_execution_contract_worker_version_check
  CHECK (worker_version = 'AUTOMATION_WORKER_V2');
COMMIT;
