-- Explicit server-only Owner Workspace entitlement.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE public.owner_workspace_entitlements (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source = 'initial_owner_bootstrap'),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT owner_workspace_entitlements_revocation_order
    CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

ALTER TABLE public.owner_workspace_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_workspace_entitlements FORCE ROW LEVEL SECURITY;

INSERT INTO public.owner_workspace_entitlements (user_id, source, granted_at)
SELECT audit.user_id, 'initial_owner_bootstrap', audit.created_at
FROM public.audit_logs audit
JOIN public.users owner_user ON owner_user.id = audit.user_id
WHERE audit.event_type = 'owner.bootstrap_completed'
  AND audit.action = 'create'
  AND audit.resource_type = 'user'
  AND audit.resource_id = audit.user_id
  AND audit.success = true
  AND audit.details = '{"source":"owner:bootstrap","version":1}'::jsonb
  AND owner_user.role = 'client'
ON CONFLICT (user_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.audit_logs audit
    JOIN public.users owner_user ON owner_user.id = audit.user_id
    WHERE audit.event_type = 'owner.bootstrap_completed'
      AND audit.action = 'create'
      AND audit.resource_type = 'user'
      AND audit.resource_id = audit.user_id
      AND audit.success = true
      AND audit.details = '{"source":"owner:bootstrap","version":1}'::jsonb
      AND owner_user.role = 'client'
      AND NOT EXISTS (
        SELECT 1 FROM public.owner_workspace_entitlements entitlement
        WHERE entitlement.user_id = audit.user_id AND entitlement.revoked_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'STOP: Owner entitlement backfill failed';
  END IF;
END
$$;

REVOKE ALL ON public.owner_workspace_entitlements FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.owner_workspace_entitlements TO service_role;

COMMIT;