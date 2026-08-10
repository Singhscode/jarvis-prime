-- Phase 9.2 Finance API: server-only atomic mutations and audit records.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE FUNCTION public.finance_assert_access(p_actor_user_id uuid, p_owner_user_id uuid, p_permission text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_actor_user_id = p_owner_user_id AND EXISTS (
    SELECT 1 FROM public.users owner_user
    WHERE owner_user.id = p_owner_user_id AND owner_user.role = 'client' AND owner_user.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM public.client_portal_memberships membership WHERE membership.user_id = owner_user.id)
  ) THEN RETURN; END IF;
  IF p_permission IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users employee_user
    JOIN public.finance_employee_permissions permission ON permission.employee_user_id = employee_user.id
      AND permission.owner_user_id = p_owner_user_id AND permission.permission = p_permission
    WHERE employee_user.id = p_actor_user_id AND employee_user.role = 'employee' AND employee_user.status = 'active'
      AND employee_user.portal_owner_user_id = p_owner_user_id
  ) THEN RETURN; END IF;
  RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_ACCESS_DENIED';
END;
$$;

CREATE FUNCTION public.finance_write_audit(p_actor_user_id uuid, p_event_type text, p_action text, p_resource_type text, p_resource_id uuid, p_details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, event_type, action, resource_type, resource_id, success, details)
  VALUES (p_actor_user_id, p_event_type, p_action, p_resource_type, p_resource_id, true, p_details);
END;
$$;

CREATE FUNCTION public.finance_validate_invoice_items(p_items jsonb, p_tax_amount_minor bigint, p_total_amount_minor bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer; v_tax bigint; v_total bigint;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_INVOICE_ITEMS_INVALID'; END IF;
  SELECT count(*), coalesce(sum(tax_amount_minor), 0), coalesce(sum(line_amount_minor), 0)
  INTO v_count, v_tax, v_total FROM jsonb_to_recordset(p_items) AS item(line_number integer, description text, quantity numeric, unit_amount_minor bigint, tax_amount_minor bigint, line_amount_minor bigint);
  IF v_count <> jsonb_array_length(p_items) OR v_tax <> p_tax_amount_minor OR v_total <> p_total_amount_minor THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_INVOICE_TOTALS_INVALID'; END IF;
END;
$$;

CREATE FUNCTION public.finance_upsert_billing_profile(p_actor_user_id uuid, p_owner_user_id uuid, p_legal_name text, p_billing_email text, p_tax_identifier text, p_billing_address jsonb, p_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile public.finance_billing_profiles%ROWTYPE; v_action text;
BEGIN
  PERFORM public.finance_assert_access(p_actor_user_id, p_owner_user_id, NULL);
  SELECT * INTO v_profile FROM public.finance_billing_profiles WHERE owner_user_id = p_owner_user_id FOR UPDATE;
  v_action := CASE WHEN FOUND THEN 'update' ELSE 'create' END;
  INSERT INTO public.finance_billing_profiles (owner_user_id, legal_name, billing_email, tax_identifier, billing_address, currency)
  VALUES (p_owner_user_id, p_legal_name, p_billing_email, p_tax_identifier, p_billing_address, p_currency)
  ON CONFLICT (owner_user_id) DO UPDATE SET legal_name = EXCLUDED.legal_name, billing_email = EXCLUDED.billing_email,
    tax_identifier = EXCLUDED.tax_identifier, billing_address = EXCLUDED.billing_address, currency = EXCLUDED.currency
  RETURNING * INTO v_profile;
  PERFORM public.finance_write_audit(p_actor_user_id, 'finance.billing_profile', v_action, 'finance_billing_profile', v_profile.id, '{}'::jsonb);
  RETURN to_jsonb(v_profile);
END;
$$;

CREATE FUNCTION public.finance_get_overview(p_actor_user_id uuid, p_owner_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_invoiced bigint; v_paid bigint; v_allocated bigint; v_expenses bigint;
BEGIN
  PERFORM public.finance_assert_access(p_actor_user_id, p_owner_user_id, 'finance.read');
  SELECT coalesce(sum(total_amount_minor), 0) INTO v_invoiced FROM public.finance_invoices
    WHERE owner_user_id = p_owner_user_id AND status IN ('issued', 'paid');
  SELECT coalesce(sum(amount_minor), 0) INTO v_paid FROM public.finance_payments
    WHERE owner_user_id = p_owner_user_id AND status = 'recorded';
  SELECT coalesce(sum(amount_minor), 0) INTO v_allocated FROM public.finance_payments
    WHERE owner_user_id = p_owner_user_id AND status = 'recorded' AND invoice_id IS NOT NULL;
  SELECT coalesce(sum(amount_minor), 0) INTO v_expenses FROM public.finance_expenses
    WHERE owner_user_id = p_owner_user_id AND status IN ('approved', 'reimbursed');
  RETURN jsonb_build_object('asOf', now(), 'totalInvoicedMinor', v_invoiced, 'totalPaidMinor', v_paid,
    'outstandingMinor', greatest(v_invoiced - v_allocated, 0), 'expensesMinor', v_expenses, 'currency', 'mixed');
END;
$$;

CREATE FUNCTION public.finance_mutate_invoice(p_actor_user_id uuid, p_owner_user_id uuid, p_invoice_id uuid, p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_invoice public.finance_invoices%ROWTYPE; v_status text;
BEGIN
  PERFORM public.finance_assert_access(p_actor_user_id, p_owner_user_id, 'finance.invoices.write');
  IF p_action = 'create' THEN
    PERFORM public.finance_validate_invoice_items(p_payload->'items', (p_payload->>'tax_amount_minor')::bigint, (p_payload->>'total_amount_minor')::bigint);
    INSERT INTO public.finance_invoices (owner_user_id, billing_profile_id, crm_client_id, invoice_number, currency, issued_at, due_at, subtotal_amount_minor, tax_amount_minor, total_amount_minor, notes)
    VALUES (p_owner_user_id, (p_payload->>'billing_profile_id')::uuid, (p_payload->>'crm_client_id')::uuid, p_payload->>'invoice_number', p_payload->>'currency',
      nullif(p_payload->>'issued_at', '')::timestamptz, nullif(p_payload->>'due_at', '')::timestamptz, (p_payload->>'subtotal_amount_minor')::bigint,
      (p_payload->>'tax_amount_minor')::bigint, (p_payload->>'total_amount_minor')::bigint, nullif(p_payload->>'notes', '')) RETURNING * INTO v_invoice;
    INSERT INTO public.finance_invoice_items (invoice_id, line_number, description, quantity, unit_amount_minor, tax_amount_minor, line_amount_minor)
    SELECT v_invoice.id, item.line_number, item.description, item.quantity, item.unit_amount_minor, item.tax_amount_minor, item.line_amount_minor
    FROM jsonb_to_recordset(p_payload->'items') AS item(line_number integer, description text, quantity numeric, unit_amount_minor bigint, tax_amount_minor bigint, line_amount_minor bigint);
  ELSIF p_action = 'update' THEN
    SELECT * INTO v_invoice FROM public.finance_invoices WHERE id = p_invoice_id AND owner_user_id = p_owner_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_INVOICE_NOT_FOUND'; END IF;
    IF v_invoice.status <> 'draft' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_INVOICE_NOT_EDITABLE'; END IF;
    PERFORM public.finance_validate_invoice_items(p_payload->'items', (p_payload->>'tax_amount_minor')::bigint, (p_payload->>'total_amount_minor')::bigint);
    UPDATE public.finance_invoices SET billing_profile_id = (p_payload->>'billing_profile_id')::uuid, crm_client_id = (p_payload->>'crm_client_id')::uuid,
      currency = p_payload->>'currency', issued_at = nullif(p_payload->>'issued_at', '')::timestamptz, due_at = nullif(p_payload->>'due_at', '')::timestamptz,
      subtotal_amount_minor = (p_payload->>'subtotal_amount_minor')::bigint, tax_amount_minor = (p_payload->>'tax_amount_minor')::bigint,
      total_amount_minor = (p_payload->>'total_amount_minor')::bigint, notes = nullif(p_payload->>'notes', '') WHERE id = v_invoice.id RETURNING * INTO v_invoice;
    DELETE FROM public.finance_invoice_items WHERE invoice_id = v_invoice.id;
    INSERT INTO public.finance_invoice_items (invoice_id, line_number, description, quantity, unit_amount_minor, tax_amount_minor, line_amount_minor)
    SELECT v_invoice.id, item.line_number, item.description, item.quantity, item.unit_amount_minor, item.tax_amount_minor, item.line_amount_minor
    FROM jsonb_to_recordset(p_payload->'items') AS item(line_number integer, description text, quantity numeric, unit_amount_minor bigint, tax_amount_minor bigint, line_amount_minor bigint);
  ELSIF p_action = 'status' THEN
    SELECT * INTO v_invoice FROM public.finance_invoices WHERE id = p_invoice_id AND owner_user_id = p_owner_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_INVOICE_NOT_FOUND'; END IF;
    v_status := p_payload->>'status';
    IF NOT ((v_invoice.status = 'draft' AND v_status IN ('issued', 'void')) OR (v_invoice.status = 'issued' AND v_status IN ('paid', 'void'))) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_STATUS_TRANSITION_INVALID'; END IF;
    UPDATE public.finance_invoices SET status = v_status WHERE id = v_invoice.id RETURNING * INTO v_invoice;
  ELSE RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_INVOICE_ACTION_INVALID'; END IF;
  PERFORM public.finance_write_audit(p_actor_user_id, 'finance.invoice', p_action, 'finance_invoice', v_invoice.id, jsonb_build_object('status', v_invoice.status));
  RETURN to_jsonb(v_invoice);
END;
$$;

CREATE FUNCTION public.finance_mutate_payment(p_actor_user_id uuid, p_owner_user_id uuid, p_payment_id uuid, p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_payment public.finance_payments%ROWTYPE; v_status text;
BEGIN
  PERFORM public.finance_assert_access(p_actor_user_id, p_owner_user_id, 'finance.payments.write');
  IF p_action = 'create' THEN
    INSERT INTO public.finance_payments (owner_user_id, crm_client_id, invoice_id, status, currency, amount_minor, provider, provider_reference, received_at)
    VALUES (p_owner_user_id, (p_payload->>'crm_client_id')::uuid, nullif(p_payload->>'invoice_id', '')::uuid, p_payload->>'status', p_payload->>'currency',
      (p_payload->>'amount_minor')::bigint, nullif(p_payload->>'provider', ''), nullif(p_payload->>'provider_reference', ''), nullif(p_payload->>'received_at', '')::timestamptz)
    RETURNING * INTO v_payment;
  ELSIF p_action = 'status' THEN
    SELECT * INTO v_payment FROM public.finance_payments WHERE id = p_payment_id AND owner_user_id = p_owner_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_PAYMENT_NOT_FOUND'; END IF;
    v_status := p_payload->>'status';
    IF NOT ((v_payment.status = 'pending' AND v_status IN ('recorded', 'failed', 'void')) OR (v_payment.status = 'recorded' AND v_status = 'void')) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_STATUS_TRANSITION_INVALID'; END IF;
    UPDATE public.finance_payments SET status = v_status WHERE id = v_payment.id RETURNING * INTO v_payment;
  ELSE RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_PAYMENT_ACTION_INVALID'; END IF;
  PERFORM public.finance_write_audit(p_actor_user_id, 'finance.payment', p_action, 'finance_payment', v_payment.id, jsonb_build_object('status', v_payment.status));
  RETURN to_jsonb(v_payment);
END;
$$;

CREATE FUNCTION public.finance_mutate_expense(p_actor_user_id uuid, p_owner_user_id uuid, p_expense_id uuid, p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_expense public.finance_expenses%ROWTYPE; v_status text; v_submitter uuid;
BEGIN
  PERFORM public.finance_assert_access(p_actor_user_id, p_owner_user_id, 'finance.expenses.write');
  IF p_action = 'create' THEN
    v_submitter := CASE WHEN p_actor_user_id = p_owner_user_id THEN NULL ELSE p_actor_user_id END;
    INSERT INTO public.finance_expenses (owner_user_id, submitted_by_employee_user_id, category, description, status, currency, amount_minor, incurred_at)
    VALUES (p_owner_user_id, v_submitter, p_payload->>'category', p_payload->>'description', p_payload->>'status', p_payload->>'currency',
      (p_payload->>'amount_minor')::bigint, (p_payload->>'incurred_at')::date) RETURNING * INTO v_expense;
  ELSIF p_action = 'update' THEN
    SELECT * INTO v_expense FROM public.finance_expenses WHERE id = p_expense_id AND owner_user_id = p_owner_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_EXPENSE_NOT_FOUND'; END IF;
    IF v_expense.status <> 'draft' THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_EXPENSE_NOT_EDITABLE'; END IF;
    UPDATE public.finance_expenses SET category = p_payload->>'category', description = p_payload->>'description', currency = p_payload->>'currency',
      amount_minor = (p_payload->>'amount_minor')::bigint, incurred_at = (p_payload->>'incurred_at')::date WHERE id = v_expense.id RETURNING * INTO v_expense;
  ELSIF p_action = 'status' THEN
    SELECT * INTO v_expense FROM public.finance_expenses WHERE id = p_expense_id AND owner_user_id = p_owner_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_EXPENSE_NOT_FOUND'; END IF;
    v_status := p_payload->>'status';
    IF NOT ((v_expense.status = 'draft' AND v_status IN ('submitted', 'void')) OR (v_expense.status = 'submitted' AND v_status IN ('approved', 'void')) OR (v_expense.status = 'approved' AND v_status IN ('reimbursed', 'void'))) THEN RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_STATUS_TRANSITION_INVALID'; END IF;
    UPDATE public.finance_expenses SET status = v_status WHERE id = v_expense.id RETURNING * INTO v_expense;
  ELSE RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_EXPENSE_ACTION_INVALID'; END IF;
  PERFORM public.finance_write_audit(p_actor_user_id, 'finance.expense', p_action, 'finance_expense', v_expense.id, jsonb_build_object('status', v_expense.status));
  RETURN to_jsonb(v_expense);
END;
$$;

REVOKE ALL ON FUNCTION public.finance_assert_access(uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finance_write_audit(uuid,text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finance_validate_invoice_items(jsonb,bigint,bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finance_upsert_billing_profile(uuid,uuid,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finance_get_overview(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finance_mutate_invoice(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finance_mutate_payment(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finance_mutate_expense(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finance_upsert_billing_profile(uuid,uuid,text,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_get_overview(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_mutate_invoice(uuid,uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_mutate_payment(uuid,uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_mutate_expense(uuid,uuid,uuid,text,jsonb) TO service_role;
COMMIT;
