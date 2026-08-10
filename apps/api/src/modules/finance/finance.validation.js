import { AppError } from '../../middleware/error-handler.js';
import {
  EXPENSE_STATUSES, INVOICE_STATUSES, MAX_PAGE_SIZE, PAGE_SIZE, PAYMENT_STATUSES,
} from './finance.constants.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function invalid(message = 'Finance request is invalid.') {
  throw new AppError(message, 400, 'VALIDATION_ERROR');
}

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value;
}

function fields(values, allowed) {
  object(values);
  if (Object.keys(values).some((key) => !allowed.has(key))) invalid();
}

function text(value, field, min, max) {
  if (typeof value !== 'string') invalid(`Field '${field}' is invalid.`);
  const result = value.trim();
  if (result.length < min || result.length > max) invalid(`Field '${field}' is invalid.`);
  return result;
}

function nullableText(value, field, max) {
  if (value === null) return null;
  return text(value, field, 1, max);
}

export function uuid(value, field = 'id') {
  if (typeof value !== 'string' || !UUID.test(value)) invalid(`Field '${field}' must be a valid UUID.`);
  return value;
}

function currency(value) {
  if (typeof value !== 'string' || !CURRENCY.test(value)) invalid("Field 'currency' is invalid.");
  return value;
}

function amount(value, field, { zero = false } = {}) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || (zero ? value < 0 : value <= 0)) {
    invalid(`Field '${field}' must be an integer minor-unit amount.`);
  }
  return value;
}

function timestamp(value, field) {
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) invalid(`Field '${field}' is invalid.`);
  return new Date(value).toISOString();
}

function date(value, field) {
  if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    invalid(`Field '${field}' is invalid.`);
  }
  return value;
}

function billingAddress(value) {
  object(value);
  const serialized = JSON.stringify(value);
  if (serialized.length > 5000) invalid("Field 'billing_address' is invalid.");
  return value;
}

function quantityMillis(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/.test(value)) {
    invalid("Field 'quantity' is invalid.");
  }
  const [whole, fraction = ''] = value.split('.');
  const scaled = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  if (scaled <= 0n) invalid("Field 'quantity' is invalid.");
  return scaled;
}

function invoiceItems(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) invalid("Field 'items' is invalid.");
  const lines = []; const seen = new Set();
  let subtotal = 0n; let tax = 0n; let total = 0n;
  for (const entry of value) {
    fields(entry, new Set(['line_number', 'description', 'quantity', 'unit_amount_minor', 'tax_amount_minor', 'line_amount_minor']));
    const lineNumber = amount(entry.line_number, 'line_number');
    if (seen.has(lineNumber)) invalid("Field 'items' is invalid.");
    seen.add(lineNumber);
    const quantity = typeof entry.quantity === 'string' ? entry.quantity : invalid("Field 'quantity' is invalid.");
    const quantityValue = quantityMillis(quantity);
    const unitAmountMinor = amount(entry.unit_amount_minor, 'unit_amount_minor', { zero: true });
    const taxAmountMinor = amount(entry.tax_amount_minor ?? 0, 'tax_amount_minor', { zero: true });
    const lineAmountMinor = amount(entry.line_amount_minor, 'line_amount_minor', { zero: true });
    const product = quantityValue * BigInt(unitAmountMinor);
    if (product % 1000n !== 0n || BigInt(lineAmountMinor) !== product / 1000n + BigInt(taxAmountMinor)) {
      invalid("Field 'items' has an invalid amount.");
    }
    subtotal += product / 1000n; tax += BigInt(taxAmountMinor); total += BigInt(lineAmountMinor);
    lines.push({ line_number: lineNumber, description: text(entry.description, 'description', 1, 500), quantity, unit_amount_minor: unitAmountMinor, tax_amount_minor: taxAmountMinor, line_amount_minor: lineAmountMinor });
  }
  return { lines, subtotal, tax, total };
}

function assertInvoiceTotals(values, items) {
  const subtotal = amount(values.subtotal_amount_minor, 'subtotal_amount_minor', { zero: true });
  const tax = amount(values.tax_amount_minor, 'tax_amount_minor', { zero: true });
  const total = amount(values.total_amount_minor, 'total_amount_minor', { zero: true });
  if (BigInt(subtotal) !== items.subtotal || BigInt(tax) !== items.tax || BigInt(total) !== items.total) {
    invalid('Invoice totals must match their line items.');
  }
  return { subtotal, tax, total };
}

export function billingProfileValues(values, { existing = null } = {}) {
  fields(values, new Set(['legal_name', 'billing_email', 'tax_identifier', 'billing_address', 'currency']));
  const source = existing || {};
  const legalName = Object.hasOwn(values, 'legal_name') ? text(values.legal_name, 'legal_name', 2, 200) : source.legal_name;
  if (!legalName) invalid("Field 'legal_name' is required.");
  const billingEmail = Object.hasOwn(values, 'billing_email') ? nullableText(values.billing_email, 'billing_email', 254) : (source.billing_email ?? null);
  const taxIdentifier = Object.hasOwn(values, 'tax_identifier') ? nullableText(values.tax_identifier, 'tax_identifier', 120) : (source.tax_identifier ?? null);
  const address = Object.hasOwn(values, 'billing_address') ? billingAddress(values.billing_address) : (source.billing_address || {});
  const valueCurrency = Object.hasOwn(values, 'currency') ? currency(values.currency) : (source.currency || 'INR');
  return { legal_name: legalName, billing_email: billingEmail, tax_identifier: taxIdentifier, billing_address: address, currency: valueCurrency };
}

export function invoiceCreateValues(values) {
  fields(values, new Set(['billing_profile_id', 'crm_client_id', 'invoice_number', 'currency', 'issued_at', 'due_at', 'subtotal_amount_minor', 'tax_amount_minor', 'total_amount_minor', 'notes', 'items']));
  const items = invoiceItems(values.items); const totals = assertInvoiceTotals(values, items);
  const issuedAt = timestamp(values.issued_at ?? null, 'issued_at'); const dueAt = timestamp(values.due_at ?? null, 'due_at');
  if (issuedAt && dueAt && dueAt < issuedAt) invalid("Field 'due_at' is invalid.");
  return { billing_profile_id: uuid(values.billing_profile_id, 'billing_profile_id'), crm_client_id: uuid(values.crm_client_id, 'crm_client_id'), invoice_number: text(values.invoice_number, 'invoice_number', 1, 64), currency: currency(values.currency), issued_at: issuedAt, due_at: dueAt, subtotal_amount_minor: totals.subtotal, tax_amount_minor: totals.tax, total_amount_minor: totals.total, notes: Object.hasOwn(values, 'notes') ? nullableText(values.notes, 'notes', 5000) : null, items: items.lines };
}

export function invoiceUpdateValues(values, existing, existingItems) {
  fields(values, new Set(['billing_profile_id', 'crm_client_id', 'currency', 'issued_at', 'due_at', 'subtotal_amount_minor', 'tax_amount_minor', 'total_amount_minor', 'notes', 'items']));
  const combined = {
    billing_profile_id: Object.hasOwn(values, 'billing_profile_id') ? values.billing_profile_id : existing.billing_profile_id,
    crm_client_id: Object.hasOwn(values, 'crm_client_id') ? values.crm_client_id : existing.crm_client_id,
    currency: Object.hasOwn(values, 'currency') ? values.currency : existing.currency,
    issued_at: Object.hasOwn(values, 'issued_at') ? values.issued_at : existing.issued_at,
    due_at: Object.hasOwn(values, 'due_at') ? values.due_at : existing.due_at,
    subtotal_amount_minor: Object.hasOwn(values, 'subtotal_amount_minor') ? values.subtotal_amount_minor : Number(existing.subtotal_amount_minor),
    tax_amount_minor: Object.hasOwn(values, 'tax_amount_minor') ? values.tax_amount_minor : Number(existing.tax_amount_minor),
    total_amount_minor: Object.hasOwn(values, 'total_amount_minor') ? values.total_amount_minor : Number(existing.total_amount_minor),
    notes: Object.hasOwn(values, 'notes') ? values.notes : existing.notes,
    items: Object.hasOwn(values, 'items') ? values.items : existingItems.map((item) => ({ ...item, quantity: String(item.quantity) })),
  };
  return invoiceCreateValues({ ...combined, invoice_number: existing.invoice_number });
}

export function invoiceStatusValue(values) {
  fields(values, new Set(['status']));
  if (!INVOICE_STATUSES.has(values.status)) invalid("Field 'status' is invalid.");
  return values.status;
}

export function paymentCreateValues(values) {
  fields(values, new Set(['crm_client_id', 'invoice_id', 'currency', 'amount_minor', 'status', 'provider', 'provider_reference', 'received_at']));
  const status = values.status ?? 'recorded';
  if (!['pending', 'recorded'].includes(status)) invalid("Field 'status' is invalid.");
  const provider = Object.hasOwn(values, 'provider') ? nullableText(values.provider, 'provider', 64) : null;
  const providerReference = Object.hasOwn(values, 'provider_reference') ? nullableText(values.provider_reference, 'provider_reference', 256) : null;
  if (Boolean(provider) !== Boolean(providerReference)) invalid('Provider and provider_reference must be provided together.');
  return { crm_client_id: uuid(values.crm_client_id, 'crm_client_id'), invoice_id: Object.hasOwn(values, 'invoice_id') ? (values.invoice_id === null ? null : uuid(values.invoice_id, 'invoice_id')) : null, currency: currency(values.currency), amount_minor: amount(values.amount_minor, 'amount_minor'), status, provider, provider_reference: providerReference, received_at: Object.hasOwn(values, 'received_at') ? timestamp(values.received_at, 'received_at') : (status === 'recorded' ? new Date().toISOString() : null) };
}

export function paymentStatusValue(values) {
  fields(values, new Set(['status']));
  if (!PAYMENT_STATUSES.has(values.status)) invalid("Field 'status' is invalid.");
  return values.status;
}

export function expenseCreateValues(values) {
  fields(values, new Set(['category', 'description', 'status', 'currency', 'amount_minor', 'incurred_at']));
  const status = values.status ?? 'draft';
  if (!['draft', 'submitted'].includes(status)) invalid("Field 'status' is invalid.");
  return { category: text(values.category, 'category', 1, 80), description: text(values.description, 'description', 1, 1000), status, currency: currency(values.currency), amount_minor: amount(values.amount_minor, 'amount_minor'), incurred_at: date(values.incurred_at, 'incurred_at') };
}

export function expenseUpdateValues(values, existing) {
  fields(values, new Set(['category', 'description', 'currency', 'amount_minor', 'incurred_at']));
  return expenseCreateValues({
    category: Object.hasOwn(values, 'category') ? values.category : existing.category,
    description: Object.hasOwn(values, 'description') ? values.description : existing.description,
    status: existing.status,
    currency: Object.hasOwn(values, 'currency') ? values.currency : existing.currency,
    amount_minor: Object.hasOwn(values, 'amount_minor') ? values.amount_minor : Number(existing.amount_minor),
    incurred_at: Object.hasOwn(values, 'incurred_at') ? values.incurred_at : existing.incurred_at,
  });
}

export function expenseStatusValue(values) {
  fields(values, new Set(['status']));
  if (!EXPENSE_STATUSES.has(values.status)) invalid("Field 'status' is invalid.");
  return values.status;
}

export function pageOptions(query, statuses) {
  const rawLimit = query?.limit; const limit = rawLimit === undefined ? PAGE_SIZE : Number.parseInt(rawLimit, 10);
  if (rawLimit !== undefined && (typeof rawLimit !== 'string' || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE || String(limit) !== rawLimit)) invalid('Query limit is invalid.');
  const status = query?.status;
  if (status !== undefined && (typeof status !== 'string' || !statuses.has(status))) invalid('Query status is invalid.');
  const clientId = query?.client_id;
  return { limit, status, client_id: clientId === undefined ? undefined : uuid(clientId, 'client_id') };
}
