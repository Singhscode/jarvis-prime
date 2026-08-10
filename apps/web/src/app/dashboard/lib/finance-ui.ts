import type { FinanceMinorAmount } from './finance-contracts';

export type FinanceApiBody<T> = { success: true; data: T };

export function financeError(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

export function minor(value: FinanceMinorAmount) {
  try { return BigInt(value); } catch { return BigInt(0); }
}

export function money(value: FinanceMinorAmount, currency: string) {
  if (currency === 'mixed') return 'Multiple currencies — not converted';
  const amount = minor(value); const zero = BigInt(0); const sign = amount < zero ? '-' : '';
  const digits = (amount < zero ? -amount : amount).toString().padStart(3, '0');
  return `${currency} ${sign}${digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${digits.slice(-2)}`;
}

export function dateValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

export function localDateTimeToIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

export function nextInvoiceStatuses(status: string) {
  return status === 'draft' ? ['issued', 'void'] : status === 'issued' ? ['paid', 'void'] : [];
}

export function nextPaymentStatuses(status: string) {
  return status === 'pending' ? ['recorded', 'failed', 'void'] : status === 'recorded' ? ['void'] : [];
}

export function nextExpenseStatuses(status: string) {
  return status === 'draft' ? ['submitted', 'void'] : status === 'submitted' ? ['approved', 'void'] : status === 'approved' ? ['reimbursed', 'void'] : [];
}
