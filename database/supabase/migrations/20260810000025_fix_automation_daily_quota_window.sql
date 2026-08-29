-- Phase 11 Step 2 gap closure: evaluate daily quota only in the active durable window.
-- Historical daily buckets remain immutable audit/accounting evidence and must not block new-window work.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.automation_reserve_work(
  p_owner uuid, p_recipe uuid, p_action text, p_work uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing integer;
  v_link_count integer;
  v_bucket record;
  v_day timestamptz := date_trunc('day', now());
BEGIN
  SELECT count(*) INTO v_link_count
    FROM public.automation_work_reservations WHERE work_item_id = p_work;
  IF v_link_count > 0 THEN
    IF v_link_count <> 6 THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_RESERVATION_CORRUPT';
    END IF;
    PERFORM 1
      FROM public.automation_work_reservations wr
      JOIN public.automation_quota_reservations qr ON qr.id = wr.reservation_id
     WHERE wr.work_item_id = p_work
     FOR UPDATE OF wr, qr;
    SELECT count(*) INTO v_existing
      FROM public.automation_work_reservations wr
      JOIN public.automation_quota_reservations qr ON qr.id = wr.reservation_id
     WHERE wr.work_item_id = p_work AND NOT wr.active
       AND ((wr.reservation_type = 'DAILY' AND qr.reserved + qr.consumed >= qr.limit_value)
         OR (wr.reservation_type = 'CONCURRENT' AND qr.reserved >= qr.limit_value));
    IF v_existing > 0 THEN RETURN false; END IF;
    UPDATE public.automation_quota_reservations qr
       SET reserved = reserved + 1, updated_at = now()
      FROM public.automation_work_reservations wr
     WHERE wr.work_item_id = p_work AND wr.reservation_id = qr.id AND NOT wr.active;
    UPDATE public.automation_work_reservations
       SET active = true, released_at = null
     WHERE work_item_id = p_work AND NOT active;
    RETURN true;
  END IF;

  FOR v_bucket IN
    SELECT * FROM (VALUES
      ('OWNER'::text, p_owner::text, 'DAILY'::text, v_day, 100000),
      ('RECIPE', p_recipe::text, 'DAILY', v_day, 100000),
      ('ACTION', p_action, 'DAILY', v_day, 100000),
      ('OWNER', p_owner::text, 'CONCURRENT', 'epoch'::timestamptz, 10),
      ('RECIPE', p_recipe::text, 'CONCURRENT', 'epoch'::timestamptz, 10),
      ('ACTION', p_action, 'CONCURRENT', 'epoch'::timestamptz, 2)
    ) AS b(scope_type, scope_id, reservation_type, window_start, limit_value)
  LOOP
    INSERT INTO public.automation_quota_reservations(
      owner_user_id, scope_type, scope_id, reservation_type, policy_key, window_start, limit_value
    ) VALUES (p_owner, v_bucket.scope_type, v_bucket.scope_id, v_bucket.reservation_type, 'POL_LIMIT', v_bucket.window_start, v_bucket.limit_value)
    ON CONFLICT (owner_user_id, scope_type, scope_id, reservation_type, policy_key, window_start) DO NOTHING;
  END LOOP;

  PERFORM 1 FROM public.automation_quota_reservations
   WHERE owner_user_id = p_owner
     AND ((scope_type = 'OWNER' AND scope_id = p_owner::text)
       OR (scope_type = 'RECIPE' AND scope_id = p_recipe::text)
       OR (scope_type = 'ACTION' AND scope_id = p_action))
     AND (reservation_type = 'CONCURRENT' OR window_start = v_day)
   FOR UPDATE;
  SELECT count(*) INTO v_existing
    FROM public.automation_quota_reservations
   WHERE owner_user_id = p_owner
     AND ((scope_type = 'OWNER' AND scope_id = p_owner::text)
       OR (scope_type = 'RECIPE' AND scope_id = p_recipe::text)
       OR (scope_type = 'ACTION' AND scope_id = p_action))
     AND (reservation_type = 'CONCURRENT' OR window_start = v_day)
     AND ((reservation_type = 'DAILY' AND reserved + consumed >= limit_value)
       OR (reservation_type = 'CONCURRENT' AND reserved >= limit_value));
  IF v_existing > 0 THEN RETURN false; END IF;
  FOR v_bucket IN
    SELECT * FROM public.automation_quota_reservations
     WHERE owner_user_id = p_owner
       AND ((scope_type = 'OWNER' AND scope_id = p_owner::text)
         OR (scope_type = 'RECIPE' AND scope_id = p_recipe::text)
         OR (scope_type = 'ACTION' AND scope_id = p_action))
       AND (reservation_type = 'CONCURRENT' OR window_start = v_day)
  LOOP
    UPDATE public.automation_quota_reservations
       SET reserved = reserved + 1, updated_at = now() WHERE id = v_bucket.id;
    INSERT INTO public.automation_work_reservations(owner_user_id, work_item_id, reservation_id, reservation_type)
      VALUES (p_owner, p_work, v_bucket.id, v_bucket.reservation_type);
  END LOOP;
  RETURN true;
END;
$$;

COMMIT;
