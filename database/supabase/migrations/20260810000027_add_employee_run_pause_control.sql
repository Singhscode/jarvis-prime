-- Phase 11 Step 5A: narrowly scoped Employee-owned RUN pause/resume control.
-- Reuses the Step 2 control and immutable event authorities; creates no storage.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE FUNCTION public.automation_set_employee_run_pause(
  p_actor uuid,
  p_run uuid,
  p_operation text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_run public.automation_runs%ROWTYPE;
  v_assignment public.automation_recipe_assignments%ROWTYPE;
  v_recipe_id uuid;
  v_provider text;
  v_control public.automation_controls%ROWTYPE;
  v_before_reason text;
  v_after_reason text;
  v_emergency boolean;
  v_has_run_control boolean := false;
  v_changed boolean := false;
BEGIN
  IF p_actor IS NULL OR p_run IS NULL OR p_operation NOT IN ('PAUSE','RESUME') THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;

  -- Lock the target first: all authorization and subsequent control mutations are serialized with cancel/recompute.
  SELECT * INTO v_run FROM public.automation_runs WHERE id = p_run FOR UPDATE;
  IF NOT found THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RUN_NOT_FOUND'; END IF;
  IF v_run.state IN ('COMPLETED','FAILED','CANCELLED') OR v_run.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RUN_TERMINAL';
  END IF;

  -- The Owner is derived only from the current authenticated Employee relationship.
  IF NOT exists (
    SELECT 1 FROM public.users u
     WHERE u.id = p_actor AND u.role = 'employee' AND u.status = 'active'
       AND u.portal_owner_user_id = v_run.owner_user_id
  ) OR v_run.requested_by_user_id IS DISTINCT FROM p_actor
       OR v_run.requested_by_kind <> 'employee'
       OR v_run.recipe_assignment_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_EMPLOYEE_RUN_DENIED';
  END IF;

  -- The immutable run snapshot must still be backed by an active exact assignment and active governed Recipe route.
  SELECT a.* INTO v_assignment
    FROM public.automation_recipe_assignments a
    JOIN public.automation_recipe_versions v
      ON v.owner_user_id = a.owner_user_id AND v.id = a.recipe_version_id AND v.status = 'APPROVED'
    JOIN public.automation_recipes r
      ON r.owner_user_id = v.owner_user_id AND r.id = v.recipe_id AND r.status = 'ACTIVE'
    JOIN public.automation_recipe_activations ac
      ON ac.owner_user_id = r.owner_user_id AND ac.recipe_id = r.id
     AND ac.recipe_version_id = v.id AND ac.status = 'ACTIVE'
   WHERE a.id = v_run.recipe_assignment_id AND a.owner_user_id = v_run.owner_user_id
     AND a.recipe_version_id = v_run.recipe_version_id AND a.employee_user_id = p_actor
     AND a.status = 'ACTIVE'
   FOR SHARE;
  IF NOT found THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_EMPLOYEE_ASSIGNMENT_DENIED'; END IF;

  SELECT v.recipe_id INTO v_recipe_id FROM public.automation_recipe_versions v
   WHERE v.owner_user_id = v_run.owner_user_id AND v.id = v_run.recipe_version_id FOR SHARE;
  SELECT coalesce(min(provider_code), 'INTERNAL') INTO v_provider
    FROM public.automation_work_items WHERE owner_user_id = v_run.owner_user_id AND run_id = v_run.id;

  -- Reuse the established scope locking and precedence authority before taking the mutable RUN row lock.
  PERFORM public.automation_lock_controls(v_run.owner_user_id, v_recipe_id, v_run.id, v_provider);
  SELECT * INTO v_control FROM public.automation_controls
   WHERE owner_user_id = v_run.owner_user_id AND scope_type = 'RUN' AND scope_id = v_run.id::text FOR UPDATE;
  v_has_run_control := found;
  v_before_reason := public.automation_control_reason(v_run.owner_user_id, v_recipe_id, v_run.id, v_provider);

  IF p_operation = 'RESUME' THEN
    -- Emergency controls at every existing effective scope remain authoritative and are never modified here.
    SELECT exists (
      SELECT 1 FROM public.automation_controls c
       WHERE c.emergency_stop AND (
            (c.scope_type = 'GLOBAL' AND c.scope_id = 'GLOBAL')
         OR (c.scope_type = 'OWNER' AND c.owner_user_id = v_run.owner_user_id AND c.scope_id = v_run.owner_user_id::text)
         OR (c.scope_type = 'RECIPE' AND c.owner_user_id = v_run.owner_user_id AND c.scope_id = v_recipe_id::text)
         OR (c.scope_type = 'RUN' AND c.owner_user_id = v_run.owner_user_id AND c.scope_id = v_run.id::text)
         OR (c.scope_type = 'PROVIDER' AND c.owner_user_id = v_run.owner_user_id AND c.scope_id = v_provider)
       )
    ) INTO v_emergency;
    IF v_emergency THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_EMERGENCY_STOP_ACTIVE'; END IF;
    -- Only remove a pause that this Employee created. An Owner's RUN control is immutable to this RPC.
    IF v_has_run_control AND v_control.actor_user_id = p_actor AND v_control.paused AND NOT v_control.emergency_stop THEN
      UPDATE public.automation_controls SET paused = false, reason_code = 'EMPLOYEE_RESUMED', actor_user_id = p_actor, updated_at = now()
       WHERE id = v_control.id;
      UPDATE public.automation_runs SET pause_reason_code = NULL, updated_at = now()
       WHERE owner_user_id = v_run.owner_user_id AND id = v_run.id;
      v_changed := true;
    ELSIF v_has_run_control AND (v_control.paused OR v_control.emergency_stop) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_EMPLOYEE_RUN_CONTROL_DENIED';
    END IF;
  ELSE
    -- Never overwrite an Owner or stronger RUN control. Retaining it is a safe successful pause.
    IF v_has_run_control AND v_control.actor_user_id = p_actor AND NOT v_control.emergency_stop THEN
      UPDATE public.automation_controls SET paused = true, reason_code = 'EMPLOYEE_PAUSED', actor_user_id = p_actor, updated_at = now()
       WHERE id = v_control.id;
      v_changed := true;
    ELSIF NOT v_has_run_control THEN
      INSERT INTO public.automation_controls(owner_user_id, scope_type, scope_id, paused, emergency_stop, reason_code, actor_user_id)
        VALUES (v_run.owner_user_id, 'RUN', v_run.id::text, true, false, 'EMPLOYEE_PAUSED', p_actor);
      v_changed := true;
    END IF;
    IF v_changed THEN
      UPDATE public.automation_runs SET pause_reason_code = 'EMPLOYEE_PAUSED', updated_at = now()
       WHERE owner_user_id = v_run.owner_user_id AND id = v_run.id;
    END IF;
  END IF;

  v_after_reason := public.automation_control_reason(v_run.owner_user_id, v_recipe_id, v_run.id, v_provider);
  PERFORM public.automation_append_event(
    v_run.owner_user_id, v_run.id, NULL, v_run.correlation_id,
    CASE WHEN p_operation = 'PAUSE' THEN 'EMPLOYEE_RUN_PAUSED' ELSE 'EMPLOYEE_RUN_RESUMED' END,
    NULL, p_actor, 'employee_control', v_before_reason, v_after_reason,
    CASE WHEN p_operation = 'PAUSE' THEN 'EMPLOYEE_PAUSED' ELSE 'EMPLOYEE_RESUMED' END,
    jsonb_build_object('operation', lower(p_operation), 'changed', v_changed)
  );
  RETURN jsonb_build_object('run_id', v_run.id, 'operation', lower(p_operation), 'state', v_run.state,
    'effective_control_reason', v_after_reason, 'changed', v_changed);
END;
$$;

REVOKE ALL ON FUNCTION public.automation_set_employee_run_pause(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.automation_set_employee_run_pause(uuid,uuid,text) TO service_role;
COMMIT;
