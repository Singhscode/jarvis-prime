-- Phase 11 P0 local hardening: current-window quota retries, globally idempotent
-- controls, and deterministic internal future-trigger receipts.
-- LOCAL/DISPOSABLE DATABASE ONLY until separately reviewed and authorized.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Claim a caller key before mutating a control. The key is global rather than
-- scope-local, so reusing it for another target or request deterministically conflicts.
CREATE TABLE public.automation_control_idempotency_receipts (
  idempotency_key text PRIMARY KEY CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,200}$'),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER automation_control_idempotency_receipts_immutable
  BEFORE UPDATE OR DELETE ON public.automation_control_idempotency_receipts
  FOR EACH ROW EXECUTE FUNCTION public.automation_reject_immutable();
ALTER TABLE public.automation_control_idempotency_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_control_idempotency_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.automation_control_idempotency_receipts TO service_role;

CREATE OR REPLACE FUNCTION public.automation_set_control(
  p_owner uuid, p_scope_type text, p_scope_id text, p_paused boolean,
  p_emergency boolean, p_reason text, p_actor uuid, p_idempotency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_receipt public.automation_control_idempotency_receipts%ROWTYPE;
  v_request_hash text;
BEGIN
  IF p_scope_type NOT IN ('GLOBAL','OWNER','RECIPE','RUN','PROVIDER') OR p_reason !~ '^[A-Z0-9_]{3,100}$'
     OR p_idempotency !~ '^[A-Za-z0-9._:-]{16,200}$'
     OR (p_scope_type = 'GLOBAL' AND (p_owner IS NOT NULL OR p_scope_id <> 'GLOBAL'))
     OR (p_scope_type <> 'GLOBAL' AND p_owner IS NULL) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  v_request_hash := encode(extensions.digest(jsonb_build_object(
    'owner', p_owner, 'scopeType', p_scope_type, 'scopeId', p_scope_id,
    'paused', p_paused, 'emergency', p_emergency, 'reason', p_reason, 'actor', p_actor
  )::text, 'sha256'), 'hex');
  INSERT INTO public.automation_control_idempotency_receipts(idempotency_key, request_sha256)
    VALUES (p_idempotency, v_request_hash)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING * INTO v_receipt;
  IF NOT found THEN
    SELECT * INTO v_receipt FROM public.automation_control_idempotency_receipts
      WHERE idempotency_key = p_idempotency FOR UPDATE;
    IF v_receipt.request_sha256 <> v_request_hash THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('replayed', true, 'event_id', v_receipt.event_id);
  END IF;
  IF p_scope_type = 'GLOBAL' THEN
    INSERT INTO public.automation_controls(owner_user_id,scope_type,scope_id,paused,emergency_stop,reason_code,actor_user_id)
      VALUES (NULL,'GLOBAL','GLOBAL',p_paused,p_emergency,p_reason,p_actor)
    ON CONFLICT (scope_type,scope_id) WHERE scope_type='GLOBAL' DO UPDATE
      SET paused=excluded.paused,emergency_stop=excluded.emergency_stop,reason_code=excluded.reason_code,
          actor_user_id=excluded.actor_user_id,updated_at=now();
  ELSE
    INSERT INTO public.automation_controls(owner_user_id,scope_type,scope_id,paused,emergency_stop,reason_code,actor_user_id)
      VALUES (p_owner,p_scope_type,p_scope_id,p_paused,p_emergency,p_reason,p_actor)
    ON CONFLICT(owner_user_id,scope_type,scope_id) DO UPDATE
      SET paused=excluded.paused,emergency_stop=excluded.emergency_stop,reason_code=excluded.reason_code,
          actor_user_id=excluded.actor_user_id,updated_at=now();
  END IF;
  INSERT INTO public.automation_control_audit_events(
    id,owner_user_id,scope_type,scope_id,paused,emergency_stop,reason_code,actor_user_id,idempotency_key,safe_metadata
  ) VALUES (
    v_receipt.event_id,p_owner,p_scope_type,p_scope_id,p_paused,p_emergency,p_reason,p_actor,p_idempotency,
    jsonb_build_object('operation',CASE WHEN p_paused OR p_emergency THEN 'SET' ELSE 'CLEAR' END)
  );
  RETURN jsonb_build_object('replayed', false, 'event_id', v_receipt.event_id);
END;
$$;

-- Retry links are durable evidence, but a released DAILY link from a prior day
-- must be rebound to its matching current-day bucket before it is reactivated.
CREATE OR REPLACE FUNCTION public.automation_reserve_work(
  p_owner uuid, p_recipe uuid, p_action text, p_work uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing integer; v_link_count integer; v_bucket record; v_day timestamptz := date_trunc('day', now());
  v_apollo public.automation_provider_action_configs%ROWTYPE; v_action_daily integer := 100000; v_action_concurrent integer := 2;
BEGIN
  IF p_action='ACT_APOLLO_SEARCH' THEN
    SELECT * INTO v_apollo FROM public.automation_provider_action_configs
      WHERE owner_user_id=p_owner AND provider_code='APOLLO' AND action_code='ACT_APOLLO_SEARCH' FOR UPDATE;
    IF NOT found OR NOT v_apollo.enabled THEN RETURN false; END IF;
    v_action_daily:=v_apollo.max_requests_per_window; v_action_concurrent:=v_apollo.max_concurrent_requests;
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
  SELECT count(*) INTO v_link_count FROM public.automation_work_reservations WHERE work_item_id=p_work;
  IF v_link_count>0 THEN
    IF v_link_count<>6 THEN RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_RESERVATION_CORRUPT'; END IF;
    PERFORM 1 FROM public.automation_work_reservations wr JOIN public.automation_quota_reservations qr ON qr.id=wr.reservation_id
      WHERE wr.work_item_id=p_work FOR UPDATE OF wr,qr;
    PERFORM 1 FROM public.automation_quota_reservations qr WHERE qr.owner_user_id=p_owner
      AND ((qr.scope_type='OWNER' AND qr.scope_id=p_owner::text) OR (qr.scope_type='RECIPE' AND qr.scope_id=p_recipe::text) OR (qr.scope_type='ACTION' AND qr.scope_id=p_action))
      AND (qr.reservation_type='CONCURRENT' OR qr.window_start=v_day) FOR UPDATE;
    UPDATE public.automation_work_reservations wr SET reservation_id=current_bucket.id
      FROM public.automation_quota_reservations previous_bucket
      JOIN public.automation_quota_reservations current_bucket
        ON current_bucket.owner_user_id=previous_bucket.owner_user_id
       AND current_bucket.scope_type=previous_bucket.scope_type AND current_bucket.scope_id=previous_bucket.scope_id
       AND current_bucket.reservation_type='DAILY' AND current_bucket.policy_key=previous_bucket.policy_key
       AND current_bucket.window_start=v_day
      WHERE wr.reservation_id=previous_bucket.id AND wr.work_item_id=p_work AND NOT wr.active
        AND wr.reservation_type='DAILY' AND previous_bucket.window_start<>v_day;
    SELECT count(*) INTO v_existing FROM public.automation_work_reservations wr JOIN public.automation_quota_reservations qr ON qr.id=wr.reservation_id
      WHERE wr.work_item_id=p_work AND NOT wr.active
        AND ((wr.reservation_type='DAILY' AND qr.window_start=v_day AND qr.reserved+qr.consumed>=qr.limit_value)
          OR (wr.reservation_type='CONCURRENT' AND qr.reserved>=qr.limit_value));
    IF v_existing>0 THEN RETURN false; END IF;
    UPDATE public.automation_quota_reservations qr SET reserved=reserved+1,updated_at=now() FROM public.automation_work_reservations wr
      WHERE wr.work_item_id=p_work AND wr.reservation_id=qr.id AND NOT wr.active;
    UPDATE public.automation_work_reservations SET active=true,released_at=null WHERE work_item_id=p_work AND NOT active;
    RETURN true;
  END IF;
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

CREATE OR REPLACE FUNCTION public.automation_reserve_work_decision(
  p_owner uuid,p_recipe uuid,p_action text,p_work uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_daily_exhausted boolean;
BEGIN
  IF public.automation_reserve_work(p_owner,p_recipe,p_action,p_work) THEN RETURN jsonb_build_object('decision','ALLOW'); END IF;
  SELECT exists(SELECT 1 FROM public.automation_quota_reservations qr WHERE qr.owner_user_id=p_owner AND qr.reservation_type='DAILY'
    AND qr.window_start=date_trunc('day',now())
    AND ((qr.scope_type='OWNER' AND qr.scope_id=p_owner::text) OR (qr.scope_type='RECIPE' AND qr.scope_id=p_recipe::text) OR (qr.scope_type='ACTION' AND qr.scope_id=p_action))
    AND qr.reserved+qr.consumed>=qr.limit_value) INTO v_daily_exhausted;
  IF v_daily_exhausted THEN RETURN jsonb_build_object('decision','BLOCK','reason_code','QUOTA_DENIED'); END IF;
  RETURN jsonb_build_object('decision','WAIT','reason_code','QUOTA_WAIT','due_at',now()+interval '1 minute');
END;
$$;

ALTER TABLE public.automation_future_trigger_receipts ADD COLUMN IF NOT EXISTS request_sha256 text
  CHECK (request_sha256 IS NULL OR request_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS input_sha256 text
  CHECK (input_sha256 IS NULL OR input_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS due_at timestamptz;
-- Migration 35 did not persist the normalized request. ALLOW receipts can be
-- fully backfilled from their durable admitted work; blocked receipts retain a
-- tightly scoped input-bound legacy replay path because no work/due row exists.
ALTER TABLE public.automation_future_trigger_receipts DISABLE TRIGGER automation_future_trigger_receipts_immutable;
UPDATE public.automation_future_trigger_receipts f
   SET input_sha256=w.input_sha256,
       due_at=w.due_at,
       request_sha256=encode(extensions.digest(jsonb_build_object(
         'owner',f.owner_user_id,'actor',f.owner_user_id,'source',f.source_code,'sourceEvent',f.source_event_id,'recipe',f.recipe_code,
         'inputHash',w.input_sha256,'dueAt',w.due_at,'decision',f.decision,'reason',f.reason_code,'payloadHash',f.payload_sha256
       )::text,'sha256'),'hex')
  FROM public.automation_work_items w
 WHERE f.run_id=w.run_id AND f.owner_user_id=w.owner_user_id AND f.decision='ALLOW' AND f.request_sha256 IS NULL;
UPDATE public.automation_future_trigger_receipts f
   SET input_sha256=d.evaluated_input_sha256
  FROM public.automation_policy_decisions d
 WHERE f.correlation_id=d.correlation_id AND f.owner_user_id=d.owner_user_id
   AND f.decision='BLOCK' AND f.request_sha256 IS NULL AND d.source_code='future_trigger';
ALTER TABLE public.automation_future_trigger_receipts ENABLE TRIGGER automation_future_trigger_receipts_immutable;

CREATE OR REPLACE FUNCTION public.automation_resolve_future_trigger(
  p_owner uuid,p_actor uuid,p_source text,p_source_event text,p_recipe_code text,
  p_input jsonb,p_due_at timestamptz,p_decision text,p_reason text,p_payload_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_receipt public.automation_future_trigger_receipts%ROWTYPE; v_admission jsonb;
  v_input_hash text; v_request_hash text; v_correlation uuid;
BEGIN
  IF p_source<>'INTERNAL_FAKE' OR p_source_event IS NULL OR char_length(btrim(p_source_event)) NOT BETWEEN 1 AND 120
     OR p_recipe_code !~ '^RCP_[A-Z0-9_]{3,60}$' OR jsonb_typeof(p_input)<>'object' OR p_due_at IS NULL
     OR p_decision NOT IN ('ALLOW','BLOCK') OR p_reason !~ '^[A-Z0-9_]{3,100}$' OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_FUTURE_TRIGGER_INVALID';
  END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner,p_actor);
  v_input_hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
  v_request_hash:=encode(extensions.digest(jsonb_build_object(
    'owner',p_owner,'actor',p_actor,'source',p_source,'sourceEvent',btrim(p_source_event),'recipe',p_recipe_code,
    'inputHash',v_input_hash,'dueAt',p_due_at,'decision',p_decision,'reason',p_reason,'payloadHash',p_payload_hash
  )::text,'sha256'),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text||E'\\x1f'||p_source||E'\\x1f'||btrim(p_source_event),0));
  SELECT * INTO v_receipt FROM public.automation_future_trigger_receipts
    WHERE owner_user_id=p_owner AND source_code=p_source AND source_event_id=btrim(p_source_event) FOR UPDATE;
  IF found THEN
    IF v_receipt.request_sha256 IS NOT NULL AND v_receipt.request_sha256<>v_request_hash THEN
      RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_TRIGGER_CONFLICT';
    ELSIF v_receipt.request_sha256 IS NULL AND (v_receipt.decision<>'BLOCK' OR v_receipt.input_sha256 IS DISTINCT FROM v_input_hash) THEN
      RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_TRIGGER_CONFLICT';
    END IF;
    RETURN jsonb_build_object('replayed',true,'run_id',v_receipt.run_id,'correlation_id',v_receipt.correlation_id,'rejected',v_receipt.decision='BLOCK');
  END IF;
  IF p_decision='BLOCK' THEN
    INSERT INTO public.automation_future_trigger_receipts(owner_user_id,source_code,source_event_id,recipe_code,payload_sha256,request_sha256,input_sha256,due_at,decision,reason_code)
      VALUES(p_owner,p_source,btrim(p_source_event),p_recipe_code,p_payload_hash,v_request_hash,v_input_hash,p_due_at,p_decision,p_reason) RETURNING * INTO v_receipt;
    INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,actor_user_id,source_code)
      VALUES(p_owner,v_receipt.correlation_id,'POL_ADMISSION','V1','BLOCK',p_reason,v_input_hash,p_actor,'future_trigger');
    RETURN jsonb_build_object('replayed',false,'rejected',true,'reason',p_reason,'correlation_id',v_receipt.correlation_id);
  END IF;
  v_admission:=public.automation_admit_recipe_run(p_owner,p_actor,'owner',p_recipe_code,p_input,p_due_at,'future-'||btrim(p_source_event),v_request_hash);
  SELECT correlation_id INTO v_correlation FROM public.automation_runs WHERE owner_user_id=p_owner AND id=(v_admission->>'run_id')::uuid FOR SHARE;
  INSERT INTO public.automation_future_trigger_receipts(owner_user_id,source_code,source_event_id,recipe_code,payload_sha256,request_sha256,input_sha256,due_at,decision,reason_code,run_id,correlation_id)
    VALUES(p_owner,p_source,btrim(p_source_event),p_recipe_code,p_payload_hash,v_request_hash,v_input_hash,p_due_at,p_decision,p_reason,(v_admission->>'run_id')::uuid,v_correlation)
    RETURNING * INTO v_receipt;
  PERFORM public.automation_append_event(p_owner,(v_admission->>'run_id')::uuid,(v_admission->>'work_item_id')::uuid,v_correlation,
    'FUTURE_TRIGGER_RESOLVED',NULL,p_actor,'future_trigger',NULL,'WAITING',p_reason,jsonb_build_object('source_code',p_source));
  RETURN jsonb_build_object('replayed',false,'rejected',false,'run_id',v_admission->>'run_id','work_item_id',v_admission->>'work_item_id','correlation_id',v_correlation);
END;
$$;

REVOKE ALL ON FUNCTION public.automation_set_control(uuid,text,text,boolean,boolean,text,uuid),
  public.automation_set_control(uuid,text,text,boolean,boolean,text,uuid,text),
  public.automation_control_admission(uuid,uuid,uuid,text),
  public.automation_reserve_work(uuid,uuid,text,uuid),
  public.automation_reserve_work_decision(uuid,uuid,text,uuid),
  public.automation_resolve_future_trigger(uuid,uuid,text,text,text,jsonb,timestamptz,text,text,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.automation_set_control(uuid,text,text,boolean,boolean,text,uuid,text),
  public.automation_resolve_future_trigger(uuid,uuid,text,text,text,jsonb,timestamptz,text,text,text)
TO service_role;
COMMIT;
