import { AppError } from '../../middleware/error-handler.js';
import * as repo from './crm.repository.js';

const NAME_FIELDS = ['name'];
const CONTACT_FIELDS = ['name', 'email', 'phone', 'title', 'company_id'];
const CLIENT_CONTACT_FIELDS = ['name', 'email', 'phone', 'title'];

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

function nameValues(values) {
  assertAllowedFields(values, NAME_FIELDS);
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

function clientContactValues(values, requireName) {
  assertAllowedFields(values, CLIENT_CONTACT_FIELDS);
  if (requireName && !Object.hasOwn(values, 'name')) {
    throw new AppError("Missing required field: 'name'", 400, 'VALIDATION_ERROR');
  }

  const result = {};
  if (Object.hasOwn(values, 'name')) result.name = requiredText(values.name, 'name');
  for (const field of ['email', 'phone', 'title']) {
    if (Object.hasOwn(values, field)) result[field] = optionalText(values[field], field);
  }
  return result;
}

async function verifyCompanyOwnership(ownerUserId, companyId) {
  if (companyId && !(await repo.ownedCompanyExists(ownerUserId, companyId))) {
    throw new AppError('Company not found.', 404, 'COMPANY_NOT_FOUND');
  }
}

async function verifyClientOwnership(ownerUserId, clientId) {
  if (!(await repo.ownedClientExists(ownerUserId, clientId))) {
    throw new AppError('Client not found.', 404, 'CLIENT_NOT_FOUND');
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
  return repo.createCompany(ownerUserId, nameValues(values));
}

export async function updateCompany(ownerUserId, id, values) {
  return requireRecord(await repo.updateCompany(ownerUserId, id, nameValues(values)), 'Company');
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

export function listClients(ownerUserId) {
  return repo.listClients(ownerUserId);
}

export async function createClient(ownerUserId, values) {
  assertAllowedFields(values, ['lead_id', 'name']);
  const leadId = requiredText(values.lead_id, 'lead_id');
  const lead = await repo.getOwnedUnconvertedLead(ownerUserId, leadId);
  if (!lead) throw new AppError('Lead not found.', 404, 'LEAD_NOT_FOUND');

  try {
    return await repo.convertLeadToClient(ownerUserId, lead.id, lead.contact_id, requiredText(values.name, 'name'));
  } catch (error) {
    if (error.code === 'P0001') {
      throw new AppError('Lead conversion could not be completed.', 409, 'LEAD_CONVERSION_CONFLICT');
    }
    throw error;
  }
}

export async function updateClient(ownerUserId, id, values) {
  return requireRecord(await repo.updateClient(ownerUserId, id, nameValues(values)), 'Client');
}

export async function deleteClient(ownerUserId, id) {
  try {
    return requireRecord(await repo.deleteClient(ownerUserId, id), 'Client');
  } catch (error) {
    if (error.code === '23503') {
      throw new AppError('Delete the projects before deleting this client.', 409, 'CLIENT_HAS_PROJECTS');
    }
    throw error;
  }
}

export function listProjects(ownerUserId) {
  return repo.listProjects(ownerUserId);
}

export async function createProject(ownerUserId, values) {
  assertAllowedFields(values, ['client_id', 'name']);
  const clientId = requiredText(values.client_id, 'client_id');
  const name = requiredText(values.name, 'name');
  await verifyClientOwnership(ownerUserId, clientId);
  return repo.createProject(ownerUserId, { client_id: clientId, name });
}

export async function updateProject(ownerUserId, id, values) {
  return requireRecord(await repo.updateProject(ownerUserId, id, nameValues(values)), 'Project');
}

export async function deleteProject(ownerUserId, id) {
  try {
    return requireRecord(await repo.deleteProject(ownerUserId, id), 'Project');
  } catch (error) {
    if (error.code === '23503') {
      throw new AppError('Delete the tasks before deleting this project.', 409, 'PROJECT_HAS_TASKS');
    }
    throw error;
  }
}

async function verifyProjectOwnership(ownerUserId, projectId) {
  if (!(await repo.ownedProjectExists(ownerUserId, projectId))) {
    throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
  }
}

function taskValues(values) {
  assertAllowedFields(values, ['name', 'completed']);
  const result = {};
  if (Object.hasOwn(values, 'name')) result.name = requiredText(values.name, 'name');
  if (Object.hasOwn(values, 'completed')) {
    if (typeof values.completed !== 'boolean') {
      throw new AppError("Field 'completed' must be a boolean.", 400, 'VALIDATION_ERROR');
    }
    result.completed = values.completed;
  }
  return result;
}

export async function listTasks(ownerUserId, projectId) {
  await verifyProjectOwnership(ownerUserId, projectId);
  return repo.listTasks(ownerUserId, projectId);
}

export async function createTask(ownerUserId, projectId, values) {
  const task = nameValues(values);
  await verifyProjectOwnership(ownerUserId, projectId);
  return repo.createTask(ownerUserId, projectId, task);
}

export async function updateTask(ownerUserId, projectId, taskId, values) {
  const task = taskValues(values);
  await verifyProjectOwnership(ownerUserId, projectId);
  return requireRecord(await repo.updateTask(ownerUserId, projectId, taskId, task), 'Task');
}

export async function deleteTask(ownerUserId, projectId, taskId) {
  await verifyProjectOwnership(ownerUserId, projectId);
  return requireRecord(await repo.deleteTask(ownerUserId, projectId, taskId), 'Task');
}

export async function listClientContacts(ownerUserId, clientId) {
  await verifyClientOwnership(ownerUserId, clientId);
  return repo.listClientContacts(ownerUserId, clientId);
}

export async function createClientContact(ownerUserId, clientId, values) {
  const contact = clientContactValues(values, true);
  await verifyClientOwnership(ownerUserId, clientId);
  try {
    return await repo.createClientContact(ownerUserId, clientId, contact);
  } catch (error) {
    rethrowDuplicate(error, 'A contact with that email already exists.', 'CONTACT_EMAIL_EXISTS');
  }
}

export async function updateClientContact(ownerUserId, clientId, contactId, values) {
  const contact = clientContactValues(values, false);
  await verifyClientOwnership(ownerUserId, clientId);
  try {
    return requireRecord(await repo.updateClientContact(ownerUserId, clientId, contactId, contact), 'Contact');
  } catch (error) {
    rethrowDuplicate(error, 'A contact with that email already exists.', 'CONTACT_EMAIL_EXISTS');
  }
}

export async function deleteClientContact(ownerUserId, clientId, contactId) {
  await verifyClientOwnership(ownerUserId, clientId);
  return requireRecord(await repo.detachClientContact(ownerUserId, clientId, contactId), 'Contact');
}
