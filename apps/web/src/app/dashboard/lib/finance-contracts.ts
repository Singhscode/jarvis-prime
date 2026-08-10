export type FinanceMinorAmount = number | string;

export type FinanceWorkspaceAccess = {
  identity: { email: string };
  capabilities: { billingProfile: 'manage' | 'read' };
};

export type FinanceOverview = {
  asOf?: string;
  totalInvoicedMinor: FinanceMinorAmount;
  totalPaidMinor: FinanceMinorAmount;
  outstandingMinor: FinanceMinorAmount;
  expensesMinor: FinanceMinorAmount;
  currency: string;
};

export type FinanceBillingProfile = {
  id: string;
  legal_name: string;
  billing_email: string | null;
  tax_identifier: string | null;
  billing_address: Record<string, unknown>;
  currency: string;
  created_at?: string;
  updated_at?: string;
};

export type FinanceInvoiceItem = {
  id?: string;
  line_number: number;
  description: string;
  quantity: string;
  unit_amount_minor: number;
  tax_amount_minor: number;
  line_amount_minor: number;
};

export type FinanceInvoice = {
  id: string;
  billing_profile_id: string;
  crm_client_id: string;
  invoice_number: string;
  status: 'draft' | 'issued' | 'paid' | 'void';
  currency: string;
  issued_at: string | null;
  due_at: string | null;
  subtotal_amount_minor: FinanceMinorAmount;
  tax_amount_minor: FinanceMinorAmount;
  total_amount_minor: FinanceMinorAmount;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FinanceInvoiceDetail = { invoice: FinanceInvoice; items: FinanceInvoiceItem[] };

export type FinancePayment = {
  id: string;
  crm_client_id: string;
  invoice_id: string | null;
  status: 'pending' | 'recorded' | 'failed' | 'void';
  currency: string;
  amount_minor: FinanceMinorAmount;
  provider: string | null;
  provider_reference: string | null;
  received_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FinanceExpense = {
  id: string;
  submitted_by_employee_user_id: string | null;
  category: string;
  description: string;
  status: 'draft' | 'submitted' | 'approved' | 'reimbursed' | 'void';
  currency: string;
  amount_minor: FinanceMinorAmount;
  incurred_at: string;
  created_at?: string;
  updated_at?: string;
};
