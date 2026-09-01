-- Phase 11 operational projection. This derives redacted health from the existing
-- durable queue and immutable audit; it creates no worker, queue, metrics store, or execution authority.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE INDEX IF NOT EXISTS automation_work_items_owner_health_idx
  ON public.automation_work_items(owner_user_id, state, created_at);
CREATE INDEX IF NOT EXISTS automation_run_events_owner_recovery_idx
  ON public.automation_run_events(owner_user_id, event_code, created_at DESC)
  WHERE event_code = 'LEASE_RECOVERED';

CREATE OR REPLACE FUNCTION public.automation_get_owner_operational_health(p_owner uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now timestamptz := now();
  v_eligible integer; v_delayed integer; v_active integer; v_stale integer;
  v_stale_claimed integer; v_stale_dispatching integer; v_retryable integer;
  v_failed integer; v_blocked integer; v_review integer; v_recovered integer;
  v_oldest_queued timestamptz; v_oldest_eligible timestamptz;
BEGIN
  PERFORM public.automation_assert_recipe_owner(p_owner, p_actor);

  SELECT
    count(*) FILTER (WHERE state IN ('WAITING','RETRYABLE') AND due_at <= v_now),
    count(*) FILTER (WHERE state IN ('WAITING','RETRYABLE') AND due_at > v_now),
    count(*) FILTER (WHERE state = 'RUNNING' AND lease_until >= v_now),
    count(*) FILTER (WHERE state = 'RUNNING' AND lease_until < v_now),
    count(*) FILTER (WHERE state = 'RUNNING' AND lease_until < v_now AND attempt_phase = 'CLAIMED'),
    count(*) FILTER (WHERE state = 'RUNNING' AND lease_until < v_now AND attempt_phase IN ('DISPATCHING','RESULT_RECORDED')),
    count(*) FILTER (WHERE state = 'RETRYABLE'),
    count(*) FILTER (WHERE state = 'FAILED'),
    count(*) FILTER (WHERE state = 'BLOCKED'),
    count(*) FILTER (WHERE state = 'HUMAN_REVIEW'),
    min(created_at) FILTER (WHERE state IN ('WAITING','RETRYABLE')),
    min(due_at) FILTER (WHERE state IN ('WAITING','RETRYABLE') AND due_at <= v_now)
  INTO v_eligible, v_delayed, v_active, v_stale, v_stale_claimed, v_stale_dispatching,
    v_retryable, v_failed, v_blocked, v_review, v_oldest_queued, v_oldest_eligible
  FROM public.automation_work_items
  WHERE owner_user_id = p_owner;

  SELECT count(*) INTO v_recovered
  FROM public.automation_run_events
  WHERE owner_user_id = p_owner AND event_code = 'LEASE_RECOVERED' AND created_at >= v_now - interval '24 hours';

  RETURN jsonb_build_object(
    'observedAt', v_now,
    'queue', jsonb_build_object('eligibleCount', v_eligible, 'delayedCount', v_delayed, 'oldestQueuedAt', v_oldest_queued, 'oldestEligibleAt', v_oldest_eligible),
    'leases', jsonb_build_object('activeCount', v_active, 'staleCount', v_stale, 'staleClaimedCount', v_stale_claimed, 'staleDispatchingCount', v_stale_dispatching),
    'attention', jsonb_build_object('retryableCount', v_retryable, 'failedCount', v_failed, 'blockedCount', v_blocked, 'humanReviewCount', v_review),
    'recovery', jsonb_build_object('recoveredLast24h', v_recovered)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.automation_get_owner_operational_health(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.automation_get_owner_operational_health(uuid,uuid) TO service_role;
COMMIT;
