export const FINANCE_PERMISSIONS = Object.freeze({
  READ: 'finance.read',
  INVOICES_WRITE: 'finance.invoices.write',
  PAYMENTS_WRITE: 'finance.payments.write',
  EXPENSES_WRITE: 'finance.expenses.write',
});

export const INVOICE_STATUSES = new Set(['draft', 'issued', 'paid', 'void']);
export const PAYMENT_STATUSES = new Set(['pending', 'recorded', 'failed', 'void']);
export const EXPENSE_STATUSES = new Set(['draft', 'submitted', 'approved', 'reimbursed', 'void']);

export const INVOICE_TRANSITIONS = Object.freeze({
  draft: new Set(['issued', 'void']),
  issued: new Set(['paid', 'void']),
  paid: new Set(),
  void: new Set(),
});
export const PAYMENT_TRANSITIONS = Object.freeze({
  pending: new Set(['recorded', 'failed', 'void']),
  recorded: new Set(['void']),
  failed: new Set(),
  void: new Set(),
});
export const EXPENSE_TRANSITIONS = Object.freeze({
  draft: new Set(['submitted', 'void']),
  submitted: new Set(['approved', 'void']),
  approved: new Set(['reimbursed', 'void']),
  reimbursed: new Set(),
  void: new Set(),
});

export const PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50;
