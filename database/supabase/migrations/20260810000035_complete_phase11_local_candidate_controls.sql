-- Phase 11 local candidate completion: durable admission decisions, control/quota audit,
-- set-based fair claims, and an internal-only future-trigger resolver.
-- LOCAL/DISPOSABLE DATABASE ONLY until separately reviewed and authorized.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE public.automation_control_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('GLOBAL','OWNER','RECIPE','RUN','PROVIDER')),
  scope_id text NOT NULL,
  paused boolean NOT NULL,
  emergency_stop boolean NOT NULL,
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{3,100}$'),
  actor_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{16,200}$'),
  safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(safe_metadata) = 'object' AND octet_length(safe_metadata::text) <= 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, scope_type, scope_id, idempotency_key)
);
CREATE TRIGGER automation_control_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.automation_control_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.automation_reject_immutable();
ALTER TABLE public.automation_control_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_control_audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.automation_control_audit_events TO service_role;

-- The eight-argument overload is the idempotent control entry point. The legacy
-- seven-argument wrapper below remains available only for existing internal callers.
CREATE FUNCTION public.automation_set_control(
  p_owner uuid, p_scope_type text, p_scope_id text, p_paused boolean,
  p_emergency boolean, p_reason text, p_actor uuid, p_idempotency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event public.automation_control_audit_events%ROWTYPE;
BEGIN
  IF p_scope_type NOT IN ('GLOBAL','OWNER','RECIPE','RUN','PROVIDER') OR p_reason !~ '^[A-Z0-9_]{3,100}$'
     OR p_idempotency !~ '^[A-Za-z0-9._:-]{16,200}$'
     OR (p_scope_type = 'GLOBAL' AND (p_owner IS NOT NULL OR p_scope_id <> 'GLOBAL'))
     OR (p_scope_type <> 'GLOBAL' AND p_owner IS NULL) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_VALIDATION_ERROR';
  END IF;
  SELECT * INTO v_event FROM public.automation_control_audit_events
   WHERE owner_user_id IS NOT DISTINCT FROM p_owner AND scope_type=p_scope_type
     AND scope_id=p_scope_id AND idempotency_key=p_idempotency FOR UPDATE;
  IF found THEN
    IF v_event.paused IS DISTINCT FROM p_paused OR v_event.emergency_stop IS DISTINCT FROM p_emergency
       OR v_event.reason_code IS DISTINCT FROM p_reason OR v_event.actor_user_id IS DISTINCT FROM p_actor THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'AUTOMATION_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('replayed',true,'event_id',v_event.id);
  END IF;
  IF p_scope_type='GLOBAL' THEN
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
    owner_user_id,scope_type,scope_id,paused,emergency_stop,reason_code,actor_user_id,idempotency_key,safe_metadata
  ) VALUES (
    p_owner,p_scope_type,p_scope_id,p_paused,p_emergency,p_reason,p_actor,p_idempotency,
    jsonb_build_object('operation',CASE WHEN p_paused OR p_emergency THEN 'SET' ELSE 'CLEAR' END)
  ) RETURNING * INTO v_event;
  RETURN jsonb_build_object('replayed',false,'event_id',v_event.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.automation_set_control(
  p_owner uuid, p_scope_type text, p_scope_id text, p_paused boolean,
  p_emergency boolean, p_reason text, p_actor uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.automation_set_control(
    p_owner,p_scope_type,p_scope_id,p_paused,p_emergency,p_reason,p_actor,
    'legacy-' || gen_random_uuid()::text
  );
END;
$$;

CREATE FUNCTION public.automation_control_admission(
  p_owner uuid,p_recipe uuid,p_run uuid,p_provider text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_control public.automation_controls%ROWTYPE;
BEGIN
  SELECT * INTO v_control FROM public.automation_controls c
   WHERE ((c.scope_type='GLOBAL' AND c.scope_id='GLOBAL')
       OR (c.scope_type='OWNER' AND c.owner_user_id=p_owner AND c.scope_id=p_owner::text)
       OR (c.scope_type='RECIPE' AND c.owner_user_id=p_owner AND c.scope_id=p_recipe::text)
       OR (c.scope_type='RUN' AND c.owner_user_id=p_owner AND c.scope_id=p_run::text)
       OR (c.scope_type='PROVIDER' AND c.owner_user_id=p_owner AND c.scope_id=p_provider))
     AND (c.paused OR c.emergency_stop)
   ORDER BY CASE c.scope_type WHEN 'GLOBAL' THEN 1 WHEN 'OWNER' THEN 2 WHEN 'RECIPE' THEN 3 WHEN 'RUN' THEN 4 ELSE 5 END
   LIMIT 1;
  IF NOT found THEN RETURN jsonb_build_object('decision','ALLOW'); END IF;
  IF v_control.emergency_stop THEN
    RETURN jsonb_build_object('decision','BLOCK','reason_code',v_control.reason_code);
  END IF;
  RETURN jsonb_build_object('decision','WAIT','reason_code',v_control.reason_code,'due_at',now()+interval '5 minutes');
END;
$$;

CREATE FUNCTION public.automation_reserve_work_decision(
  p_owner uuid,p_recipe uuid,p_action text,p_work uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_daily_exhausted boolean;
BEGIN
  IF public.automation_reserve_work(p_owner,p_recipe,p_action,p_work) THEN
    RETURN jsonb_build_object('decision','ALLOW');
  END IF;
  -- The denied candidate has no reservation links yet, so inspect the locked
  -- owner/recipe/action daily buckets directly rather than its work links.
  SELECT exists(
    SELECT 1 FROM public.automation_quota_reservations qr
     WHERE qr.owner_user_id=p_owner AND qr.reservation_type='DAILY'
       AND ((qr.scope_type='OWNER' AND qr.scope_id=p_owner::text)
         OR (qr.scope_type='RECIPE' AND qr.scope_id=p_recipe::text)
         OR (qr.scope_type='ACTION' AND qr.scope_id=p_action))
       AND qr.reserved+qr.consumed>=qr.limit_value
  ) INTO v_daily_exhausted;
  IF v_daily_exhausted THEN
    RETURN jsonb_build_object('decision','BLOCK','reason_code','QUOTA_DENIED');
  END IF;
  RETURN jsonb_build_object('decision','WAIT','reason_code','QUOTA_WAIT','due_at',now()+interval '1 minute');
END;
$$;

-- Candidate selection is one bounded, indexed, set-based locking query. Subsequent
-- per-row work only performs the state/admission mutation for already locked rows.
CREATE OR REPLACE FUNCTION public.automation_claim_work(p_worker text,p_limit integer DEFAULT 10,p_lease_seconds integer DEFAULT 60)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE;
  v_recipe_id uuid; v_decision jsonb; v_apollo public.automation_provider_action_configs%ROWTYPE; v_cycle bigint:=floor(extract(epoch FROM clock_timestamp())*1000000)::bigint;
  v_count integer:=0; v_previous text;
BEGIN
  IF p_worker IS NULL OR char_length(btrim(p_worker)) NOT BETWEEN 1 AND 120 OR p_limit NOT BETWEEN 1 AND 50 OR p_lease_seconds NOT BETWEEN 10 AND 3600 THEN
    RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_VALIDATION_ERROR';
  END IF;
  FOR v_work IN
    WITH fair_owners AS MATERIALIZED (
      SELECT f.owner_user_id,f.last_served_cycle
        FROM public.automation_claim_fairness f
       WHERE EXISTS (
         SELECT 1 FROM public.automation_work_items w
           JOIN public.automation_runs r ON r.owner_user_id=w.owner_user_id AND r.id=w.run_id
          WHERE w.owner_user_id=f.owner_user_id AND w.state IN ('WAITING','RETRYABLE') AND w.due_at<=now()
            AND w.attempt_count<w.max_attempts AND r.cancelled_at IS NULL
            AND (w.dependency_work_item_id IS NULL OR EXISTS (
              SELECT 1 FROM public.automation_work_items d WHERE d.id=w.dependency_work_item_id AND d.state='COMPLETED'
            ))
       ) ORDER BY f.last_served_cycle,f.owner_user_id LIMIT p_limit FOR UPDATE SKIP LOCKED
    ), ranked_candidates AS MATERIALIZED (
      SELECT w.id,
        row_number() OVER (PARTITION BY w.owner_user_id ORDER BY w.due_at,w.priority DESC,w.id) AS owner_item_rank,
        dense_rank() OVER (ORDER BY f.last_served_cycle,f.owner_user_id) AS owner_rank
      FROM public.automation_work_items w
      JOIN public.automation_runs r ON r.owner_user_id=w.owner_user_id AND r.id=w.run_id
      JOIN fair_owners f ON f.owner_user_id=w.owner_user_id
      WHERE w.state IN ('WAITING','RETRYABLE') AND w.due_at<=now() AND w.attempt_count<w.max_attempts
        AND r.cancelled_at IS NULL
        AND (w.dependency_work_item_id IS NULL OR EXISTS (
          SELECT 1 FROM public.automation_work_items d WHERE d.id=w.dependency_work_item_id AND d.state='COMPLETED'
        ))
    ), bounded_candidates AS MATERIALIZED (
      SELECT id,owner_item_rank,owner_rank FROM ranked_candidates WHERE owner_item_rank<=2
       ORDER BY owner_item_rank,owner_rank,id LIMIT p_limit
    )
    SELECT w.* FROM public.automation_work_items w
      JOIN bounded_candidates c ON c.id=w.id
     ORDER BY c.owner_item_rank,c.owner_rank,w.id
     FOR UPDATE OF w SKIP LOCKED
  LOOP
    EXIT WHEN v_count>=p_limit;
    v_previous:=v_work.state;
    SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_work.owner_user_id AND id=v_work.run_id FOR UPDATE;
    SELECT recipe_id INTO v_recipe_id FROM public.automation_recipe_versions
      WHERE owner_user_id=v_work.owner_user_id AND id=v_run.recipe_version_id FOR SHARE;
    PERFORM public.automation_lock_controls(v_work.owner_user_id,v_recipe_id,v_work.run_id,v_work.provider_code);
    v_decision:=public.automation_control_admission(v_work.owner_user_id,v_recipe_id,v_work.run_id,v_work.provider_code);
    IF v_decision->>'decision'='ALLOW' AND v_work.provider_code='APOLLO' THEN
      SELECT * INTO v_apollo FROM public.automation_provider_action_configs
       WHERE owner_user_id=v_work.owner_user_id AND provider_code='APOLLO' AND action_code='ACT_APOLLO_SEARCH' FOR UPDATE;
      IF NOT found OR NOT v_apollo.enabled THEN
        v_decision:=jsonb_build_object('decision','BLOCK','reason_code','APOLLO_PROVIDER_NOT_READY');
      END IF;
    END IF;
    IF v_decision->>'decision'='WAIT' THEN
      UPDATE public.automation_work_items SET state='WAITING',due_at=(v_decision->>'due_at')::timestamptz,
        last_reason_code=v_decision->>'reason_code',updated_at=now() WHERE id=v_work.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code)
        VALUES(v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_ADMISSION','V1','WAIT',v_decision->>'reason_code',v_work.input_sha256,'claim');
      PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id);
      PERFORM public.automation_append_event(v_work.owner_user_id,v_run.id,v_work.id,v_run.correlation_id,'CONTROL_WAIT',v_work.action_code,NULL,'claim',v_previous,'WAITING',v_decision->>'reason_code',jsonb_build_object('due_at',v_decision->>'due_at'));
      CONTINUE;
    ELSIF v_decision->>'decision'='BLOCK' THEN
      UPDATE public.automation_work_items SET state='BLOCKED',last_reason_code=v_decision->>'reason_code',updated_at=now() WHERE id=v_work.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code)
        VALUES(v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_ADMISSION','V1','BLOCK',v_decision->>'reason_code',v_work.input_sha256,'claim');
      PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id);
      PERFORM public.automation_append_event(v_work.owner_user_id,v_run.id,v_work.id,v_run.correlation_id,'WORK_BLOCKED',v_work.action_code,NULL,'claim',v_previous,'BLOCKED',v_decision->>'reason_code','{}'::jsonb);
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.automation_recipe_versions rv WHERE rv.owner_user_id=v_work.owner_user_id AND rv.id=v_run.recipe_version_id AND rv.status='APPROVED' AND rv.configuration_sha256=v_run.configuration_sha256) THEN
      UPDATE public.automation_work_items SET state='BLOCKED',last_reason_code='VERSION_NOT_APPROVED',updated_at=now() WHERE id=v_work.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code)
        VALUES(v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_ADMISSION','V1','BLOCK','VERSION_NOT_APPROVED',v_work.input_sha256,'claim');
      PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id);
      PERFORM public.automation_append_event(v_work.owner_user_id,v_run.id,v_work.id,v_run.correlation_id,'WORK_BLOCKED',v_work.action_code,NULL,'claim',v_previous,'BLOCKED','VERSION_NOT_APPROVED','{}'::jsonb);
      CONTINUE;
    END IF;
    v_decision:=public.automation_reserve_work_decision(v_work.owner_user_id,v_recipe_id,v_work.action_code,v_work.id);
    IF v_decision->>'decision'='WAIT' THEN
      UPDATE public.automation_work_items SET state='WAITING',due_at=(v_decision->>'due_at')::timestamptz,
        last_reason_code=v_decision->>'reason_code',updated_at=now() WHERE id=v_work.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code)
        VALUES(v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_LIMIT','V1','WAIT',v_decision->>'reason_code',v_work.input_sha256,'claim');
      PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id);
      PERFORM public.automation_append_event(v_work.owner_user_id,v_run.id,v_work.id,v_run.correlation_id,'QUOTA_WAIT',v_work.action_code,NULL,'claim',v_previous,'WAITING',v_decision->>'reason_code',jsonb_build_object('due_at',v_decision->>'due_at'));
      CONTINUE;
    ELSIF v_decision->>'decision'='BLOCK' THEN
      UPDATE public.automation_work_items SET state='BLOCKED',last_reason_code=v_decision->>'reason_code',updated_at=now() WHERE id=v_work.id;
      INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,run_id,work_item_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,source_code)
        VALUES(v_work.owner_user_id,v_run.correlation_id,v_run.id,v_work.id,'POL_LIMIT','V1','BLOCK',v_decision->>'reason_code',v_work.input_sha256,'claim');
      PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id);
      PERFORM public.automation_append_event(v_work.owner_user_id,v_run.id,v_work.id,v_run.correlation_id,'WORK_BLOCKED',v_work.action_code,NULL,'claim',v_previous,'BLOCKED',v_decision->>'reason_code','{}'::jsonb);
      CONTINUE;
    END IF;
    UPDATE public.automation_work_items SET state='RUNNING',attempt_count=attempt_count+1,attempt_id=gen_random_uuid(),attempt_phase='CLAIMED',lease_owner=p_worker,lease_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>p_lease_seconds),started_at=coalesce(started_at,now()),updated_at=now() WHERE id=v_work.id RETURNING * INTO v_work;
    PERFORM public.automation_recompute_run(v_work.owner_user_id,v_work.run_id);
    PERFORM public.automation_append_event(v_work.owner_user_id,v_run.id,v_work.id,v_run.correlation_id,'WORK_CLAIMED',v_work.action_code,NULL,'worker',v_previous,'RUNNING',NULL,jsonb_build_object('worker',p_worker));
    UPDATE public.automation_claim_fairness SET last_served_cycle=greatest(last_served_cycle+1,v_cycle),updated_at=now() WHERE owner_user_id=v_work.owner_user_id;
    v_count:=v_count+1;
    RETURN NEXT jsonb_build_object('id',v_work.id,'owner_user_id',v_work.owner_user_id,'run_id',v_work.run_id,'action_code',v_work.action_code,'provider_code',v_work.provider_code,'input',v_work.input,'lease_token',v_work.lease_token,'lease_until',v_work.lease_until,'attempt_count',v_work.attempt_count,'attempt_phase',v_work.attempt_phase,'requested_by_user_id',v_run.requested_by_user_id,'requested_by_kind',v_run.requested_by_kind,'correlation_id',v_run.correlation_id);
  END LOOP;
END;
$$;

-- Reservation rows are the authoritative quota state. Record every activation and
-- release as immutable run evidence, including retry reactivation and terminal consumption.
CREATE FUNCTION public.automation_audit_work_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_work public.automation_work_items%ROWTYPE; v_run public.automation_runs%ROWTYPE; v_code text;
BEGIN
  IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NOT OLD.active AND NEW.active) THEN
    v_code:='QUOTA_RESERVED';
  ELSIF TG_OP='UPDATE' AND OLD.active AND NOT NEW.active THEN
    v_code:='QUOTA_RELEASED';
  ELSE
    RETURN NEW;
  END IF;
  SELECT * INTO v_work FROM public.automation_work_items WHERE id=NEW.work_item_id;
  SELECT * INTO v_run FROM public.automation_runs WHERE owner_user_id=v_work.owner_user_id AND id=v_work.run_id;
  PERFORM public.automation_append_event(v_work.owner_user_id,v_work.run_id,v_work.id,v_run.correlation_id,
    v_code,v_work.action_code,NULL,'quota',v_work.state,v_work.state,NULL,
    jsonb_build_object('reservation_type',NEW.reservation_type));
  RETURN NEW;
END;
$$;
CREATE TRIGGER automation_work_reservations_audit
  AFTER INSERT OR UPDATE OF active ON public.automation_work_reservations
  FOR EACH ROW EXECUTE FUNCTION public.automation_audit_work_reservation();

CREATE TABLE public.automation_future_trigger_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  source_code text NOT NULL CHECK (source_code='INTERNAL_FAKE'),
  source_event_id text NOT NULL CHECK (char_length(btrim(source_event_id)) BETWEEN 1 AND 120),
  recipe_code text NOT NULL CHECK (recipe_code ~ '^RCP_[A-Z0-9_]{3,60}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('ALLOW','BLOCK')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z0-9_]{3,100}$'),
  run_id uuid,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id,source_code,source_event_id),
  FOREIGN KEY(owner_user_id,run_id) REFERENCES public.automation_runs(owner_user_id,id) ON DELETE RESTRICT
);
CREATE TRIGGER automation_future_trigger_receipts_immutable
  BEFORE UPDATE OR DELETE ON public.automation_future_trigger_receipts
  FOR EACH ROW EXECUTE FUNCTION public.automation_reject_immutable();
ALTER TABLE public.automation_future_trigger_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.automation_future_trigger_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.automation_future_trigger_receipts TO service_role;

-- No action code, provider, webhook, URL, or external source is accepted here. The
-- active recipe derives the action, and ALLOW delegates to the existing recipe/Step 2 admission RPC.
CREATE FUNCTION public.automation_resolve_future_trigger(
  p_owner uuid,p_actor uuid,p_source text,p_source_event text,p_recipe_code text,
  p_input jsonb,p_due_at timestamptz,p_decision text,p_reason text,p_payload_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_receipt public.automation_future_trigger_receipts%ROWTYPE; v_admission jsonb; v_input_hash text;
BEGIN
  IF p_source<>'INTERNAL_FAKE' OR p_source_event IS NULL OR char_length(btrim(p_source_event)) NOT BETWEEN 1 AND 120
     OR p_recipe_code !~ '^RCP_[A-Z0-9_]{3,60}$' OR jsonb_typeof(p_input)<>'object' OR p_due_at IS NULL
     OR p_decision NOT IN ('ALLOW','BLOCK') OR p_reason !~ '^[A-Z0-9_]{3,100}$' OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_FUTURE_TRIGGER_INVALID';
  END IF;
  PERFORM public.automation_assert_recipe_owner(p_owner,p_actor);
  SELECT * INTO v_receipt FROM public.automation_future_trigger_receipts
   WHERE owner_user_id=p_owner AND source_code=p_source AND source_event_id=p_source_event FOR UPDATE;
  IF found THEN
    IF v_receipt.payload_sha256<>p_payload_hash OR v_receipt.recipe_code<>p_recipe_code
       OR v_receipt.decision<>p_decision OR v_receipt.reason_code<>p_reason THEN
      RAISE EXCEPTION USING errcode='P0001',message='AUTOMATION_TRIGGER_CONFLICT';
    END IF;
    RETURN jsonb_build_object('replayed',true,'run_id',v_receipt.run_id,'correlation_id',v_receipt.correlation_id,'rejected',v_receipt.decision='BLOCK');
  END IF;
  v_input_hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
  IF p_decision='BLOCK' THEN
    INSERT INTO public.automation_future_trigger_receipts(owner_user_id,source_code,source_event_id,recipe_code,payload_sha256,decision,reason_code)
      VALUES(p_owner,p_source,p_source_event,p_recipe_code,p_payload_hash,p_decision,p_reason) RETURNING * INTO v_receipt;
    INSERT INTO public.automation_policy_decisions(owner_user_id,correlation_id,policy_code,policy_version,decision,reason_code,evaluated_input_sha256,actor_user_id,source_code)
      VALUES(p_owner,v_receipt.correlation_id,'POL_ADMISSION','V1','BLOCK',p_reason,v_input_hash,p_actor,'future_trigger');
    RETURN jsonb_build_object('replayed',false,'rejected',true,'reason',p_reason,'correlation_id',v_receipt.correlation_id);
  END IF;
  v_admission:=public.automation_admit_recipe_run(
    p_owner,p_actor,'owner',p_recipe_code,p_input,p_due_at,
    'future-' || p_source_event, p_payload_hash
  );
  INSERT INTO public.automation_future_trigger_receipts(owner_user_id,source_code,source_event_id,recipe_code,payload_sha256,decision,reason_code,run_id)
    VALUES(p_owner,p_source,p_source_event,p_recipe_code,p_payload_hash,p_decision,p_reason,(v_admission->>'run_id')::uuid)
    RETURNING * INTO v_receipt;
  PERFORM public.automation_append_event(p_owner,(v_admission->>'run_id')::uuid,(v_admission->>'work_item_id')::uuid,v_receipt.correlation_id,
    'FUTURE_TRIGGER_RESOLVED',NULL,p_actor,'future_trigger',NULL,'WAITING',p_reason,jsonb_build_object('source_code',p_source));
  RETURN jsonb_build_object('replayed',false,'rejected',false,'run_id',v_admission->>'run_id','work_item_id',v_admission->>'work_item_id','correlation_id',v_receipt.correlation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.automation_set_control(uuid,text,text,boolean,boolean,text,uuid,text),
  public.automation_control_admission(uuid,uuid,uuid,text),public.automation_reserve_work_decision(uuid,uuid,text,uuid),
  public.automation_resolve_future_trigger(uuid,uuid,text,text,text,jsonb,timestamptz,text,text,text)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.automation_set_control(uuid,text,text,boolean,boolean,text,uuid,text),
  public.automation_resolve_future_trigger(uuid,uuid,text,text,text,jsonb,timestamptz,text,text,text)
TO service_role;
COMMIT;
