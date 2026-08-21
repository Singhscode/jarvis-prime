-- Owner-scoped client account deletion. Forward-only; do not apply outside a disposable local test database.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE FUNCTION public.delete_owner_client_account(
  p_owner_user_id uuid,
  p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client public.crm_clients%ROWTYPE;
  v_portal_user public.users%ROWTYPE;
  v_portal_user_id uuid;
  v_portal_user_ids uuid[];
BEGIN
  IF p_owner_user_id IS NULL OR p_client_id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'CLIENT_ACCOUNT_VALIDATION_ERROR';
  END IF;

  -- Lock the target account first. This also serializes inserts that require its FK.
  SELECT * INTO v_client
  FROM public.crm_clients client_row
  WHERE client_row.id = p_client_id AND client_row.owner_user_id = p_owner_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'CLIENT_ACCOUNT_NOT_FOUND';
  END IF;

  -- The caller is re-proven in the transaction; UI/JWT scope is not sufficient.
  PERFORM 1
  FROM public.users owner_user
  WHERE owner_user.id = p_owner_user_id
    AND owner_user.role = 'client'
    AND owner_user.status = 'active'
  FOR KEY SHARE;
  IF NOT FOUND OR EXISTS (
    SELECT 1 FROM public.client_portal_memberships membership
    WHERE membership.user_id = p_owner_user_id
  ) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'OWNER_ACCESS_DENIED';
  END IF;

  -- Fail closed before any mutation. No finance, documents, projects, or tasks are deleted.
  IF EXISTS (SELECT 1 FROM public.finance_invoices invoice WHERE invoice.owner_user_id = p_owner_user_id AND invoice.crm_client_id = p_client_id)
    OR EXISTS (SELECT 1 FROM public.finance_payments payment WHERE payment.owner_user_id = p_owner_user_id AND payment.crm_client_id = p_client_id)
    OR EXISTS (SELECT 1 FROM public.crm_projects project WHERE project.owner_user_id = p_owner_user_id AND project.client_id = p_client_id)
    OR EXISTS (
      SELECT 1 FROM public.crm_tasks task
      JOIN public.crm_projects project ON project.id = task.project_id
      WHERE task.owner_user_id = p_owner_user_id AND project.owner_user_id = p_owner_user_id AND project.client_id = p_client_id
    )
    OR EXISTS (SELECT 1 FROM public.client_portal_documents document WHERE document.crm_client_id = p_client_id) THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'CLIENT_ACCOUNT_DELETE_CONFLICT';
  END IF;

  -- Every linked identity is locked and must be exclusively a client portal identity for this account.
  PERFORM 1 FROM public.client_portal_memberships membership
  WHERE membership.crm_client_id = p_client_id FOR UPDATE;
  SELECT coalesce(array_agg(DISTINCT membership.user_id), '{}'::uuid[])
  INTO v_portal_user_ids
  FROM public.client_portal_memberships membership
  WHERE membership.crm_client_id = p_client_id;

  FOR v_portal_user_id IN SELECT unnest(v_portal_user_ids)
  LOOP
    SELECT * INTO v_portal_user FROM public.users portal_user WHERE portal_user.id = v_portal_user_id FOR UPDATE;
    IF NOT FOUND
      OR v_portal_user.role <> 'client'
      OR v_portal_user.id = p_owner_user_id
      OR v_portal_user.portal_owner_user_id IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.client_portal_memberships membership WHERE membership.user_id = v_portal_user.id AND membership.crm_client_id <> p_client_id)
      OR EXISTS (SELECT 1 FROM public.companies company WHERE company.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.contacts contact WHERE contact.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.crm_leads lead WHERE lead.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.crm_clients owned_client WHERE owned_client.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.crm_projects project WHERE project.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.crm_tasks task WHERE task.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.owner_automation_runs run WHERE run.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.finance_billing_profiles profile WHERE profile.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.finance_employee_permissions permission WHERE permission.owner_user_id = v_portal_user.id OR permission.employee_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.finance_invoices invoice WHERE invoice.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.finance_payments payment WHERE payment.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.finance_expenses expense WHERE expense.owner_user_id = v_portal_user.id OR expense.submitted_by_employee_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.finance_documents document WHERE document.owner_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.employee_invitations invitation WHERE invitation.owner_user_id = v_portal_user.id OR invitation.employee_user_id = v_portal_user.id)
      OR EXISTS (SELECT 1 FROM public.client_portal_documents document WHERE document.created_by_user_id = v_portal_user.id)
      OR EXISTS (
        SELECT 1 FROM public.client_portal_invitations invitation
        JOIN public.client_portal_memberships membership ON membership.id = invitation.membership_id
        WHERE invitation.created_by_user_id = v_portal_user.id AND membership.crm_client_id <> p_client_id
      ) THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'CLIENT_ACCOUNT_DELETE_CONFLICT';
    END IF;
  END LOOP;

  -- Target-only invitations/memberships must be removed before their restrictive FKs permit client deletion.
  DELETE FROM public.client_portal_invitations invitation
  USING public.client_portal_memberships membership
  WHERE invitation.membership_id = membership.id AND membership.crm_client_id = p_client_id;
  DELETE FROM public.client_portal_memberships membership WHERE membership.crm_client_id = p_client_id;

  -- Auth/session rows are removed solely by established user FK cascades. Audit rows are retained (SET NULL).
  DELETE FROM public.users portal_user WHERE portal_user.id = ANY(v_portal_user_ids);

  DELETE FROM public.crm_clients client_row WHERE client_row.id = v_client.id AND client_row.owner_user_id = p_owner_user_id;

  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_owner_user_id, 'client_account', 'delete', 'crm_client', v_client.id, true, jsonb_build_object('client_id', v_client.id));

  RETURN jsonb_build_object('id', v_client.id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_owner_client_account(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_owner_client_account(uuid, uuid) TO service_role;
COMMIT;
