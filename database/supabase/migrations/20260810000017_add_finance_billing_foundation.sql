-- Phase 9.1 Finance & Billing foundation. No provider integration or browser access.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.crm_clients
  ADD CONSTRAINT crm_clients_owner_id_id_key UNIQUE (owner_user_id, id);

CREATE TABLE public.finance_billing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  legal_name text NOT NULL CHECK (char_length(btrim(legal_name)) BETWEEN 2 AND 200),
  billing_email text,
  tax_identifier text,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(billing_address) = 'object'),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id),
  UNIQUE (owner_user_id, id)
);

CREATE TABLE public.finance_employee_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  employee_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN (
    'finance.read', 'finance.invoices.write', 'finance.payments.write',
    'finance.expenses.write', 'finance.documents.write', 'finance.reports.read'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, employee_user_id, permission)
);

CREATE TABLE public.finance_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  billing_profile_id uuid NOT NULL,
  crm_client_id uuid NOT NULL,
  invoice_number text NOT NULL CHECK (char_length(btrim(invoice_number)) BETWEEN 1 AND 64),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'void')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  issued_at timestamptz,
  due_at timestamptz,
  subtotal_amount_minor bigint NOT NULL DEFAULT 0 CHECK (subtotal_amount_minor >= 0),
  tax_amount_minor bigint NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
  total_amount_minor bigint NOT NULL DEFAULT 0 CHECK (total_amount_minor >= 0 AND total_amount_minor = subtotal_amount_minor + tax_amount_minor),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_at IS NULL OR issued_at IS NULL OR due_at >= issued_at),
  UNIQUE (owner_user_id, invoice_number),
  UNIQUE (owner_user_id, id),
  FOREIGN KEY (owner_user_id, billing_profile_id)
    REFERENCES public.finance_billing_profiles(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, crm_client_id)
    REFERENCES public.crm_clients(owner_user_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.finance_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.finance_invoices(id) ON DELETE CASCADE,
  line_number integer NOT NULL CHECK (line_number > 0),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  quantity numeric(14, 3) NOT NULL CHECK (quantity > 0),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  tax_amount_minor bigint NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
  line_amount_minor bigint NOT NULL CHECK (line_amount_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, line_number)
);

CREATE TABLE public.finance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  crm_client_id uuid NOT NULL,
  invoice_id uuid,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('pending', 'recorded', 'failed', 'void')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  provider text,
  provider_reference text,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (owner_user_id, crm_client_id)
    REFERENCES public.crm_clients(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, invoice_id)
    REFERENCES public.finance_invoices(owner_user_id, id) ON DELETE RESTRICT,
  UNIQUE (owner_user_id, id)
);

CREATE TABLE public.finance_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  submitted_by_employee_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (char_length(btrim(category)) BETWEEN 1 AND 80),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'reimbursed', 'void')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  incurred_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, id)
);

CREATE TABLE public.finance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  invoice_id uuid,
  payment_id uuid,
  expense_id uuid,
  document_type text NOT NULL CHECK (document_type IN ('invoice', 'receipt', 'supporting')),
  storage_bucket text NOT NULL CHECK (storage_bucket = 'finance-private'),
  storage_path text NOT NULL CHECK (char_length(btrim(storage_path)) BETWEEN 1 AND 1024),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (num_nonnulls(invoice_id, payment_id, expense_id) = 1),
  UNIQUE (storage_bucket, storage_path),
  FOREIGN KEY (owner_user_id, invoice_id)
    REFERENCES public.finance_invoices(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, payment_id)
    REFERENCES public.finance_payments(owner_user_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_user_id, expense_id)
    REFERENCES public.finance_expenses(owner_user_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.enforce_finance_employee_permission_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.users owner_user
    WHERE owner_user.id = NEW.owner_user_id
      AND owner_user.role = 'client'
      AND owner_user.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.client_portal_memberships membership
        WHERE membership.user_id = owner_user.id
      );
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_OWNER_SCOPE_INVALID';
  END IF;

  PERFORM 1 FROM public.users employee_user
    WHERE employee_user.id = NEW.employee_user_id
      AND employee_user.role = 'employee'
      AND employee_user.status = 'active'
      AND employee_user.portal_owner_user_id = NEW.owner_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_EMPLOYEE_SCOPE_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_finance_payment_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    PERFORM 1 FROM public.finance_invoices invoice
      WHERE invoice.id = NEW.invoice_id
        AND invoice.owner_user_id = NEW.owner_user_id
        AND invoice.crm_client_id = NEW.crm_client_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_PAYMENT_SCOPE_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_finance_expense_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.submitted_by_employee_user_id IS NOT NULL THEN
    PERFORM 1 FROM public.users employee_user
      WHERE employee_user.id = NEW.submitted_by_employee_user_id
        AND employee_user.role = 'employee'
        AND employee_user.status = 'active'
        AND employee_user.portal_owner_user_id = NEW.owner_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = 'P0001', message = 'FINANCE_EXPENSE_SCOPE_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_employee_permissions_scope_trigger
  BEFORE INSERT OR UPDATE OF owner_user_id, employee_user_id ON public.finance_employee_permissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_finance_employee_permission_scope();
CREATE TRIGGER finance_payments_scope_trigger
  BEFORE INSERT OR UPDATE OF owner_user_id, crm_client_id, invoice_id ON public.finance_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_finance_payment_scope();
CREATE TRIGGER finance_expenses_scope_trigger
  BEFORE INSERT OR UPDATE OF owner_user_id, submitted_by_employee_user_id ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_finance_expense_scope();

CREATE TRIGGER finance_billing_profiles_updated_at
  BEFORE UPDATE ON public.finance_billing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER finance_invoices_updated_at
  BEFORE UPDATE ON public.finance_invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER finance_invoice_items_updated_at
  BEFORE UPDATE ON public.finance_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER finance_payments_updated_at
  BEFORE UPDATE ON public.finance_payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER finance_expenses_updated_at
  BEFORE UPDATE ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX finance_employee_permissions_owner_employee_idx
  ON public.finance_employee_permissions (owner_user_id, employee_user_id);
CREATE INDEX finance_invoices_owner_status_due_idx
  ON public.finance_invoices (owner_user_id, status, due_at DESC);
CREATE INDEX finance_invoices_owner_client_issued_idx
  ON public.finance_invoices (owner_user_id, crm_client_id, issued_at DESC);
CREATE INDEX finance_invoice_items_invoice_line_idx
  ON public.finance_invoice_items (invoice_id, line_number);
CREATE INDEX finance_payments_owner_received_idx
  ON public.finance_payments (owner_user_id, received_at DESC);
CREATE INDEX finance_payments_owner_client_idx
  ON public.finance_payments (owner_user_id, crm_client_id);
CREATE INDEX finance_payments_invoice_idx
  ON public.finance_payments (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE UNIQUE INDEX finance_payments_owner_provider_reference_key
  ON public.finance_payments (owner_user_id, provider, provider_reference)
  WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;
CREATE INDEX finance_expenses_owner_status_incurred_idx
  ON public.finance_expenses (owner_user_id, status, incurred_at DESC);
CREATE INDEX finance_expenses_submitter_idx
  ON public.finance_expenses (submitted_by_employee_user_id) WHERE submitted_by_employee_user_id IS NOT NULL;
CREATE INDEX finance_documents_owner_created_idx
  ON public.finance_documents (owner_user_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public)
  VALUES ('finance-private', 'finance-private', false)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.finance_billing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_employee_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.finance_billing_profiles, public.finance_employee_permissions,
  public.finance_invoices, public.finance_invoice_items, public.finance_payments,
  public.finance_expenses, public.finance_documents FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_finance_employee_permission_scope() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_finance_payment_scope() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_finance_expense_scope() FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_billing_profiles,
  public.finance_employee_permissions, public.finance_invoices, public.finance_invoice_items,
  public.finance_payments, public.finance_expenses, public.finance_documents TO service_role;
COMMIT;
