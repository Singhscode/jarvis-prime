import { AppError } from '../../middleware/error-handler.js';
import * as repo from './crm.repository.js';

const COMPANY_FIELDS = ['name'];
const CONTACT_FIELDS = ['name', 'email', 'phone', 'title', 'company_id'];

function assertAllowedFields(values, allowedFields) {
  const invalid = Object.keys(values).filter((field) => !allowedFields.includes(field));
  if (invalid.length > 0) {
    throw new AppError(`Fields not allowed: ${invalid.join(', ')}.`, 400, 'INVALID_FIELDS');
  }
  if (Object.keys(values).length === 0) {
    throw new AppError('No valid fields provided.', 400, 'EMPTY_UPDATE');
  }
}

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(`Field '${field}' must be a non-empty string.`, 400, 'VALIDATION_ERROR');
  }
  return value.trim();
}

function optionalText(value, field) {
  return value === null ? null : requiredText(value, field);
}

function companyValues(values) {
  assertAllowedFields(values, COMPANY_FIELDS);
  return { name: requiredText(values.name, 'name') };
}

function contactValues(values, requireName) {
  assertAllowedFields(values, CONTACT_FIELDS);
  if (requireName && !Object.hasOwn(values, 'name')) {
    throw new AppError("Missing required field: 'name'", 400, 'VALIDATION_ERROR');
  }

  const result = {};
  if (Object.hasOwn(values, 'name')) result.name = requiredText(values.name, 'name');
  for (const field of ['email', 'phone', 'title']) {
    if (Object.hasOwn(values, field)) result[field] = optionalText(values[field], field);
  }
  if (Object.hasOwn(values, 'company_id')) {
    const companyId = values.company_id;
    if (companyId !== null && (typeof companyId !== 'string' || companyId.trim() === '')) {
      throw new AppError("Field 'company_id' must be a non-empty string or null.", 400, 'VALIDATION_ERROR');
    }
    result.company_id = companyId;
  }
  return result;
}

async function verifyCompanyOwnership(ownerUserId, companyId) {
  if (companyId && !(await repo.ownedCompanyExists(ownerUserId, companyId))) {
    throw new AppError('Company not found.', 404, 'COMPANY_NOT_FOUND');
  }
}

function requireRecord(record, name) {
  if (!record) throw new AppError(`${name} not found.`, 404, `${name.toUpperCase()}_NOT_FOUND`);
  return record;
}

function rethrowDuplicate(error, message, code) {
  if (error.code === '23505') throw new AppError(message, 409, code);
  throw error;
}

export function listCompanies(ownerUserId) {
  return repo.listCompanies(ownerUserId);
}

export function createCompany(ownerUserId, values) {
  return repo.createCompany(ownerUserId, companyValues(values));
}

export async function updateCompany(ownerUserId, id, values) {
  return requireRecord(await repo.updateCompany(ownerUserId, id, companyValues(values)), 'Company');
}

export async function deleteCompany(ownerUserId, id) {
  return requireRecord(await repo.deleteCompany(ownerUserId, id), 'Company');
}

export function listContacts(ownerUserId) {
  return repo.listContacts(ownerUserId);
}

export async function createContact(ownerUserId, values) {
  const contact = contactValues(values, true);
  await verifyCompanyOwnership(ownerUserId, contact.company_id);
  try {
    return await repo.createContact(ownerUserId, contact);
  } catch (error) {
    rethrowDuplicate(error, 'A contact with that email already exists.', 'CONTACT_EMAIL_EXISTS');
  }
}

export async function updateContact(ownerUserId, id, values) {
  const contact = contactValues(values, false);
  await verifyCompanyOwnership(ownerUserId, contact.company_id);
  try {
    return requireRecord(await repo.updateContact(ownerUserId, id, contact), 'Contact');
  } catch (error) {
    rethrowDuplicate(error, 'A contact with that email already exists.', 'CONTACT_EMAIL_EXISTS');
  }
}

export async function deleteContact(ownerUserId, id) {
  try {
    return requireRecord(await repo.deleteContact(ownerUserId, id), 'Contact');
  } catch (error) {
    if (error.code === '23503') {
      throw new AppError('Delete the CRM lead before deleting this contact.', 409, 'CONTACT_HAS_LEAD');
    }
    throw error;
  }
}

export function listLeads(ownerUserId) {
  return repo.listLeads(ownerUserId);
}

export async function createLead(ownerUserId, contactId) {
  if (!(await repo.ownedContactExists(ownerUserId, contactId))) {
    throw new AppError('Contact not found.', 404, 'CONTACT_NOT_FOUND');
  }
  try {
    return await repo.createLead(ownerUserId, contactId);
  } catch (error) {
    rethrowDuplicate(error, 'This contact is already a CRM lead.', 'LEAD_EXISTS');
  }
}

export async function deleteLead(ownerUserId, id) {
  return requireRecord(await repo.deleteLead(ownerUserId, id), 'Lead');
}
