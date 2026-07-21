import { AppError } from '../../middleware/error-handler.js';
import * as repo from './crm.repository.js';

const NAME_FIELDS = ['name'];
const CONTACT_FIELDS = ['name', 'email', 'phone', 'title', 'company_id'];
const CLIENT_CONTACT_FIELDS = ['name', 'email', 'phone', 'title'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function verifyEmployeeAssignment(ownerUserId, employeeUserId) {
  if (!(await repo.getActiveEmployeeById(employeeUserId, ownerUserId))) {
    throw new AppError('Employee not found.', 404, 'EMPLOYEE_NOT_FOUND');
  }
}

function taskValues(values) {
  assertAllowedFields(values, ['name', 'completed', 'assigned_user_id']);
  const result = {};
  if (Object.hasOwn(values, 'name')) result.name = requiredText(values.name, 'name');
  if (Object.hasOwn(values, 'completed')) {
    if (typeof values.completed !== 'boolean') {
      throw new AppError("Field 'completed' must be a boolean.", 400, 'VALIDATION_ERROR');
    }
    result.completed = values.completed;
  }
  if (Object.hasOwn(values, 'assigned_user_id')) {
    if (typeof values.assigned_user_id !== 'string' || !UUID_PATTERN.test(values.assigned_user_id)) {
      throw new AppError("Field 'assigned_user_id' must be a valid UUID.", 400, 'VALIDATION_ERROR');
    }
    result.assigned_user_id = values.assigned_user_id;
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
  if (task.assigned_user_id) await verifyEmployeeAssignment(ownerUserId, task.assigned_user_id);
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

export async function getEmployeePortal(employeeUserId) {
  try {
    const employee = await repo.getActiveEmployeeById(employeeUserId);
    if (!employee) {
      throw new AppError('Employee access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    if (!employee.portal_owner_user_id) {
      throw new AppError('Employee portal scope is not configured.', 403, 'EMPLOYEE_SCOPE_MISSING');
    }

    const ownerUserId = employee.portal_owner_user_id;
    const [tasks, clients, leads] = await Promise.all([
      repo.listAssignedTasks(ownerUserId, employee.id),
      repo.listEmployeeClients(ownerUserId),
      repo.listEmployeeLeads(ownerUserId),
    ]);
    const projectIds = [...new Set(tasks.map((task) => task.project_id))];
    const projects = await repo.listEmployeeProjects(ownerUserId, projectIds);
    return { projects, tasks, clients, leads };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Employee portal load failed.', 500, 'INTERNAL_ERROR', false);
  }
}

export async function completeEmployeeTask(employeeUserId, taskId, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new AppError('Request body must be an object.', 400, 'VALIDATION_ERROR');
  }
  assertAllowedFields(values, ['completed', 'justification']);
  if (!Object.hasOwn(values, 'completed') || !Object.hasOwn(values, 'justification')) {
    throw new AppError('Completed and justification are required.', 400, 'VALIDATION_ERROR');
  }
  if (typeof values.completed !== 'boolean') {
    throw new AppError("Field 'completed' must be a boolean.", 400, 'VALIDATION_ERROR');
  }
  const justification = requiredText(values.justification, 'justification');
  if (justification.length > 1000) {
    throw new AppError("Field 'justification' must be at most 1000 characters.", 400, 'VALIDATION_ERROR');
  }
  if (typeof taskId !== 'string' || !UUID_PATTERN.test(taskId)) {
    throw new AppError('Task id must be a valid UUID.', 400, 'VALIDATION_ERROR');
  }

  try {
    return await repo.completeTask(employeeUserId, taskId, values.completed, justification);
  } catch (error) {
    if (error.code === 'P0001') {
      if (error.message === 'INSUFFICIENT_PERMISSIONS') {
        throw new AppError('Employee access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS');
      }
      if (error.message === 'EMPLOYEE_SCOPE_MISSING') {
        throw new AppError('Employee portal scope is not configured.', 403, 'EMPLOYEE_SCOPE_MISSING');
      }
      if (error.message === 'TASK_NOT_FOUND') {
        throw new AppError('Task not found.', 404, 'TASK_NOT_FOUND');
      }
      if (error.message === 'VALIDATION_ERROR') {
        throw new AppError('Completion update is invalid.', 400, 'VALIDATION_ERROR');
      }
    }
    throw new AppError('Task completion failed.', 500, 'INTERNAL_ERROR', false);
  }
}

function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(`Field '${field}' must be a valid UUID.`, 400, 'VALIDATION_ERROR');
  }
  return value;
}

function requireBodyObject(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new AppError('Request body must be an object.', 400, 'VALIDATION_ERROR');
  }
}

function clientPortalActivationValues(values) {
  requireBodyObject(values);
  assertAllowedFields(values, ['invitation']);
  return requiredText(values.invitation, 'invitation');
}

function clientPortalDocumentValues(values) {
  requireBodyObject(values);
  assertAllowedFields(values, ['title', 'document_type', 'project_id']);
  const title = requiredText(values.title, 'title');
  const documentType = requiredText(values.document_type, 'document_type');
  if (!['deliverable', 'report'].includes(documentType)) {
    throw new AppError("Field 'document_type' must be 'deliverable' or 'report'.", 400, 'VALIDATION_ERROR');
  }
  const projectId = Object.hasOwn(values, 'project_id')
    ? requireUuid(values.project_id, 'project_id')
    : null;
  return { title, documentType, projectId };
}

function clientPortalFileValues(file) {
  const allowedTypes = new Set([
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]);
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new AppError('One document file is required.', 400, 'VALIDATION_ERROR');
  }
  if (file.buffer.length > 10 * 1024 * 1024 || !allowedTypes.has(file.mimeType)) {
    throw new AppError('Document file is not permitted.', 400, 'VALIDATION_ERROR');
  }
  return file;
}

function ownerPortalError(error, message, code) {
  if (error instanceof AppError) throw error;
  if (error?.code === 'P0001') throw new AppError(message, 404, code);
  throw new AppError('Client Portal operation failed.', 500, 'INTERNAL_ERROR', false);
}

async function resolveClientPortalMembership(userId) {
  const memberships = await repo.listActiveClientPortalMemberships(userId);
  if (memberships.length !== 1) {
    throw new AppError('Client access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS');
  }
  return memberships[0];
}

async function createInvitationCredentials() {
  const { generateToken, hashToken } = await import('../auth/crypto.js');
  const invitation = generateToken();
  return { invitation, tokenHash: hashToken(invitation) };
}

async function deliverClientPortalInvitation(email, invitation) {
  const { config } = await import('../../config/config.js');
  const { sendTransactionalEmail } = await import('../../integrations/email-sender.js');
  const origin = config.corsOrigins.split(',').map((value) => value.trim()).find(Boolean);
  let activationUrl;
  try {
    activationUrl = new URL('/client/activate', origin);
  } catch {
    throw new AppError('Invitation delivery failed. Please resend.', 500, 'INTERNAL_ERROR', false);
  }
  activationUrl.searchParams.set('invitation', invitation);
  const result = await sendTransactionalEmail({
    to: email,
    subject: 'Your JARVIS PRIME Client Portal invitation',
    body: `Use this secure link to activate your Client Portal access:\n${activationUrl.toString()}\n\nThis link expires in 24 hours.`,
  });
  if (!['sent', 'dry_run'].includes(result.status)) {
    throw new AppError('Invitation delivery failed. Please resend.', 500, 'INTERNAL_ERROR', false);
  }
}

export async function getClientPortal(userId) {
  try {
    const membership = await resolveClientPortalMembership(userId);
    const snapshot = await repo.getClientPortalSnapshot(membership.crm_client_id);
    if (!snapshot.client) {
      throw new AppError('Client access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    return snapshot;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Client portal load failed.', 500, 'INTERNAL_ERROR', false);
  }
}

export async function activateClientPortalMembership(userId, values) {
  try {
    const invitation = clientPortalActivationValues(values);
    const { hashToken } = await import('../auth/crypto.js');
    const result = await repo.activateClientPortalInvitation(userId, hashToken(invitation));
    if (!result?.activated) {
      throw new AppError('Invitation could not be activated.', 400, 'INVALID_ACTIVATION');
    }
    return { activated: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Invitation could not be activated.', 400, 'INVALID_ACTIVATION');
  }
}

export async function getClientPortalDocumentDownload(userId, documentId) {
  try {
    requireUuid(documentId, 'documentId');
    const membership = await resolveClientPortalMembership(userId);
    const document = await repo.getClientPortalDocument(membership.crm_client_id, documentId);
    if (!document) {
      await repo.recordClientPortalAudit(userId, 'download', 'client_portal_document', null, false);
      throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
    }
    const signed = await repo.createClientPortalDownload(document.storage_path);
    if (!signed?.signedUrl) throw new Error('Signed URL was not created.');
    await repo.recordClientPortalAudit(userId, 'download', 'client_portal_document', document.id, true);
    return {
      url: signed.signedUrl,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Document download failed.', 500, 'INTERNAL_ERROR', false);
  }
}

export async function inviteClientPortalMember(ownerUserId, clientId, values) {
  try {
    requireBodyObject(values);
    assertAllowedFields(values, ['contact_id']);
    const contactId = requireUuid(values.contact_id, 'contact_id');
    const { invitation, tokenHash } = await createInvitationCredentials();
    const result = await repo.reissueClientPortalInvitation(
      ownerUserId, clientId, contactId, tokenHash, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    );
    const membership = await repo.getClientPortalMembership(clientId, result.membership_id);
    if (!membership) throw new Error('Membership was not created.');
    await deliverClientPortalInvitation(membership.email_normalized, invitation);
    return { membership: { id: result.membership_id, status: result.status, expires_at: result.expires_at } };
  } catch (error) {
    ownerPortalError(error, 'Client portal member not found.', 'PORTAL_MEMBER_NOT_FOUND');
  }
}

export async function resendClientPortalInvitation(ownerUserId, clientId, membershipId) {
  try {
    requireUuid(membershipId, 'membershipId');
    const membership = await repo.getClientPortalMembership(clientId, membershipId);
    if (!membership) throw new AppError('Client portal member not found.', 404, 'PORTAL_MEMBER_NOT_FOUND');
    const { invitation, tokenHash } = await createInvitationCredentials();
    const result = await repo.reissueClientPortalInvitation(
      ownerUserId, clientId, membership.contact_id, tokenHash, new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    );
    await deliverClientPortalInvitation(membership.email_normalized, invitation);
    return { membership: { id: result.membership_id, status: result.status, expires_at: result.expires_at } };
  } catch (error) {
    ownerPortalError(error, 'Client portal member not found.', 'PORTAL_MEMBER_NOT_FOUND');
  }
}

export async function revokeClientPortalMembership(ownerUserId, clientId, membershipId) {
  try {
    requireUuid(membershipId, 'membershipId');
    await repo.revokeClientPortalMembership(ownerUserId, clientId, membershipId);
  } catch (error) {
    ownerPortalError(error, 'Client portal member not found.', 'PORTAL_MEMBER_NOT_FOUND');
  }
}

export async function publishClientPortalDocument(ownerUserId, clientId, file, values) {
  const document = clientPortalDocumentValues(values);
  const upload = clientPortalFileValues(file);
  const { randomUUID } = await import('node:crypto');
  const path = `${clientId}/${randomUUID()}`;
  try {
    await repo.uploadClientPortalDocument(path, upload);
    return await repo.publishClientPortalDocument(
      ownerUserId, clientId, document.projectId, path, document.title, document.documentType
    );
  } catch (error) {
    await repo.removeClientPortalDocument(path).catch(() => {});
    ownerPortalError(error, 'Document not found.', 'PORTAL_DOCUMENT_NOT_FOUND');
  }
}

export async function revokeClientPortalDocument(ownerUserId, clientId, documentId) {
  try {
    requireUuid(documentId, 'documentId');
    await verifyClientOwnership(ownerUserId, clientId);
    return requireRecord(await repo.revokeClientPortalDocument(clientId, documentId), 'Document');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Client Portal operation failed.', 500, 'INTERNAL_ERROR', false);
  }
}


function textQuery(value, field, max = 80) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max || /[%_\\]/.test(value)) {
    throw new AppError(`Query '${field}' is invalid.`, 400, 'VALIDATION_ERROR');
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function queryString(query, field) {
  const value = query?.[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new AppError(`Query '${field}' is invalid.`, 400, 'VALIDATION_ERROR');
  return value;
}

function cursorOffset(value) {
  if (!value) return 0;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    if (!/^\d+$/.test(decoded)) throw new Error('invalid');
    const offset = Number.parseInt(decoded, 10);
    if (!Number.isSafeInteger(offset) || offset > 1000) throw new Error('invalid');
    return offset;
  } catch {
    throw new AppError('Query cursor is invalid.', 400, 'VALIDATION_ERROR');
  }
}

function pageOptions(query, allowedSorts, filterFields = [], acceptsSearch = true) {
  const rawLimit = queryString(query, 'limit');
  const limit = rawLimit === undefined ? 20 : Number.parseInt(rawLimit, 10);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (rawLimit !== undefined && String(limit) !== rawLimit)) {
    throw new AppError('Query limit is invalid.', 400, 'VALIDATION_ERROR');
  }
  const sortValue = queryString(query, 'sort') || Object.keys(allowedSorts)[0];
  const sort = allowedSorts[sortValue];
  if (!sort) throw new AppError('Query sort is invalid.', 400, 'VALIDATION_ERROR');
  const filters = {};
  for (const field of filterFields) {
    const value = queryString(query, field);
    if (value !== undefined) filters[field] = requireUuid(value, field);
  }
  const q = textQuery(queryString(query, 'q'), 'q');
  if (q && !acceptsSearch) throw new AppError('Query q is not supported for this resource.', 400, 'VALIDATION_ERROR');
  return { q, limit, offset: cursorOffset(queryString(query, 'cursor')), sort, filters };
}

function pageResult(result) {
  return {
    items: result.items,
    pageInfo: { nextCursor: result.nextOffset === null ? null : Buffer.from(String(result.nextOffset)).toString('base64url'), hasNextPage: result.nextOffset !== null },
  };
}

const NAME_SORTS = { 'created_at:desc': { field: 'created_at', ascending: false }, 'name:asc': { field: 'name', ascending: true } };
const LEAD_SORTS = { 'created_at:desc': { field: 'created_at', ascending: false } };

export async function listOwnerCompanies(ownerUserId, query) {
  return pageResult(await repo.listOwnerCompaniesPage(ownerUserId, pageOptions(query, NAME_SORTS)));
}

export async function getOwnerCompany(ownerUserId, id) {
  return requireRecord(await repo.getOwnerCompany(ownerUserId, requireUuid(id, 'id')), 'Company');
}

export async function listOwnerContacts(ownerUserId, query) {
  return pageResult(await repo.listOwnerContactsPage(ownerUserId, pageOptions(query, NAME_SORTS, ['company_id', 'client_id'])));
}

export async function getOwnerContact(ownerUserId, id) {
  return requireRecord(await repo.getOwnerContact(ownerUserId, requireUuid(id, 'id')), 'Contact');
}

export async function listOwnerLeads(ownerUserId, query) {
  return pageResult(await repo.listOwnerLeadsPage(ownerUserId, pageOptions(query, LEAD_SORTS, [], false)));
}

export async function getOwnerLead(ownerUserId, id) {
  return requireRecord(await repo.getOwnerLead(ownerUserId, requireUuid(id, 'id')), 'Lead');
}

export async function listOwnerClients(ownerUserId, query) {
  return pageResult(await repo.listOwnerClientsPage(ownerUserId, pageOptions(query, NAME_SORTS)));
}

export async function getOwnerClient(ownerUserId, id) {
  return requireRecord(await repo.getOwnerClient(ownerUserId, requireUuid(id, 'clientId')), 'Client');
}

export async function listOwnerClientContacts(ownerUserId, clientId, query) {
  await verifyClientOwnership(ownerUserId, requireUuid(clientId, 'clientId'));
  return pageResult(await repo.listOwnerClientContactsPage(ownerUserId, clientId, pageOptions(query, NAME_SORTS)));
}


const PROJECT_SORTS = {
  'name:asc': { field: 'name', ascending: true },
  'name:desc': { field: 'name', ascending: false },
};
const TASK_SORTS = PROJECT_SORTS;

export async function listOwnerProjects(ownerUserId, query) {
  return pageResult(await repo.listOwnerProjectsPage(ownerUserId, pageOptions(query, PROJECT_SORTS, ['client_id'])));
}

export async function getOwnerProject(ownerUserId, id) {
  return requireRecord(await repo.getOwnerProject(ownerUserId, requireUuid(id, 'projectId')), 'Project');
}

export async function listOwnerTasks(ownerUserId, query) {
  const options = pageOptions(query, TASK_SORTS, ['project_id']);
  if (options.filters.project_id) await verifyProjectOwnership(ownerUserId, options.filters.project_id);
  return pageResult(await repo.listOwnerTasksPage(ownerUserId, options));
}

export async function getOwnerTask(ownerUserId, id) {
  const task = requireRecord(await repo.getOwnerTask(ownerUserId, requireUuid(id, 'taskId')), 'Task');
  if (!(await repo.getOwnerProject(ownerUserId, task.project_id))) {
    throw new AppError('Task not found.', 404, 'TASK_NOT_FOUND');
  }
  return task;
}

export async function listOwnerProjectTasks(ownerUserId, projectId, query) {
  const id = requireUuid(projectId, 'projectId');
  await verifyProjectOwnership(ownerUserId, id);
  const options = pageOptions(query, TASK_SORTS, ['project_id']);
  if (options.filters.project_id && options.filters.project_id !== id) {
    throw new AppError('Query project_id does not match the requested project.', 400, 'VALIDATION_ERROR');
  }
  options.filters.project_id = id;
  return pageResult(await repo.listOwnerTasksPage(ownerUserId, options));
}

export function listOwnerProjectReferences(ownerUserId, projectIds) {
  return repo.listOwnerProjectReferences(ownerUserId, projectIds);
}

export function listOwnerClientReferences(ownerUserId, clientIds) {
  return repo.listOwnerClientReferences(ownerUserId, clientIds);
}

export function listOwnerEmployeeReferences(ownerUserId, employeeIds) {
  return repo.listOwnerEmployeeReferences(ownerUserId, employeeIds);
}
