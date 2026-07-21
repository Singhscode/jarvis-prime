import { AppError } from '../../middleware/error-handler.js';
import * as crm from '../crm/crm.service.js';
import * as repository from './owner-workspace.repository.js';

function unavailable(label, source, asOf, reason) {
  return { label, status: 'unavailable', source, window: 'current', asOf, reason };
}

function available(label, source, value, asOf) {
  return { label, status: 'available', value, source, window: 'current', asOf };
}

export function getBootstrap(claims) {
  return {
    identity: { email: claims.email || 'Authenticated user' },
    capabilities: { overview: 'available' },
  };
}

export async function assertOwnerWorkspaceAccess(userId) {
  try {
    if (!(await repository.isAuthorizedOwnerWorkspaceUser(userId))) {
      throw new AppError('Owner Workspace access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Owner Workspace access is temporarily unavailable.', 503, 'OWNER_WORKSPACE_UNAVAILABLE', false);
  }
}

export async function getDashboard(ownerUserId) {
  const asOf = new Date().toISOString();
  try {
    const counts = await repository.getDashboardCounts(ownerUserId);
    return {
      asOf,
      window: 'today',
      metrics: [
        unavailable('Active clients', 'crm_clients', asOf, 'Client lifecycle state is not defined.'),
        available('Active employees', 'users', counts.activeEmployees, asOf),
        unavailable('Open projects', 'crm_projects', asOf, 'Project lifecycle state is not defined.'),
        available('Open tasks', 'crm_tasks', counts.openTasks, asOf),
        available('Completed tasks', 'crm_tasks', counts.completedTasks, asOf),
      ],
      attention: { ...unavailable('Attention', 'owner_workspace', asOf, 'No approved attention source is available.'), items: [] },
      recentActivity: { ...unavailable('Recent activity', 'audit_logs', asOf, 'No safe owner-attributable activity source is available.'), items: [] },
      health: unavailable('System health', 'owner_workspace', asOf, 'A redacted health source is not configured.'),
    };
  } catch {
    throw new AppError('Owner Workspace dashboard is temporarily unavailable.', 500, 'OWNER_WORKSPACE_UNAVAILABLE', false);
  }
}


function unavailableActivity(asOf) {
  return { status: 'unavailable', source: 'client_portal_memberships', asOf, items: [], reason: 'No client portal activity is available.' };
}

function membershipActivity(memberships, asOf) {
  const items = memberships.slice(0, 10).map((membership) => {
    const timestamp = membership.revoked_at || membership.activated_at || membership.updated_at || membership.created_at;
    const label = membership.status === 'active' ? 'Client Portal access activated' : membership.status === 'revoked' ? 'Client Portal access revoked' : 'Client Portal invitation pending';
    return { id: membership.id, label, status: membership.status, timestamp };
  });
  return items.length ? { status: 'available', source: 'client_portal_memberships', asOf, items } : unavailableActivity(asOf);
}

export function listCrmCompanies(ownerUserId, query) { return crm.listOwnerCompanies(ownerUserId, query); }
export function getCrmCompany(ownerUserId, id) { return crm.getOwnerCompany(ownerUserId, id); }
export function createCrmCompany(ownerUserId, values) { return crm.createCompany(ownerUserId, values); }
export function updateCrmCompany(ownerUserId, id, values) { return crm.updateCompany(ownerUserId, id, values); }
export function listCrmContacts(ownerUserId, query) { return crm.listOwnerContacts(ownerUserId, query); }
export function getCrmContact(ownerUserId, id) { return crm.getOwnerContact(ownerUserId, id); }
export function createCrmContact(ownerUserId, values) { return crm.createContact(ownerUserId, values); }
export function updateCrmContact(ownerUserId, id, values) { return crm.updateContact(ownerUserId, id, values); }
export function listCrmLeads(ownerUserId, query) { return crm.listOwnerLeads(ownerUserId, query); }
export function getCrmLead(ownerUserId, id) { return crm.getOwnerLead(ownerUserId, id); }
export function createCrmLead(ownerUserId, contactId) { return crm.createLead(ownerUserId, contactId); }
export function listClients(ownerUserId, query) { return crm.listOwnerClients(ownerUserId, query); }
export function createClient(ownerUserId, values) { return crm.createClient(ownerUserId, values); }
export function updateClient(ownerUserId, id, values) { return crm.updateClient(ownerUserId, id, values); }

export async function getClientDetail(ownerUserId, clientId, query) {
  const [client, contacts] = await Promise.all([crm.getOwnerClient(ownerUserId, clientId), crm.listOwnerClientContacts(ownerUserId, clientId, query)]);
  return { client, contacts };
}

function portalPageOptions(query) {
  const rawLimit = query?.limit;
  const limit = rawLimit === undefined ? 25 : Number.parseInt(rawLimit, 10);
  if (typeof rawLimit !== 'undefined' && (typeof rawLimit !== 'string' || !Number.isSafeInteger(limit) || limit < 1 || limit > 50 || String(limit) !== rawLimit)) {
    throw new AppError('Query limit is invalid.', 400, 'VALIDATION_ERROR');
  }
  const rawCursor = query?.cursor;
  if (rawCursor === undefined) return { limit, offset: 0 };
  if (typeof rawCursor !== 'string') throw new AppError('Query cursor is invalid.', 400, 'VALIDATION_ERROR');
  try {
    const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8');
    if (!/^\d+$/.test(decoded)) throw new Error('invalid');
    const offset = Number.parseInt(decoded, 10);
    if (!Number.isSafeInteger(offset) || offset > 1000) throw new Error('invalid');
    return { limit, offset };
  } catch {
    throw new AppError('Query cursor is invalid.', 400, 'VALIDATION_ERROR');
  }
}

export async function getClientPortalAdministration(ownerUserId, clientId, query) {
  const page = portalPageOptions(query);
  await crm.getOwnerClient(ownerUserId, clientId);
  const { items, nextOffset } = await repository.listClientPortalMemberships(clientId, page);
  const contacts = await repository.listClientPortalContacts(ownerUserId, clientId, items.map((item) => item.contact_id));
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const memberships = items.map(({ contact_id, ...membership }) => ({ ...membership, contact: contactsById.get(contact_id) || null }));
  const asOf = new Date().toISOString();
  return {
    memberships,
    pageInfo: {
      nextCursor: nextOffset === null ? null : Buffer.from(String(nextOffset)).toString('base64url'),
      hasNextPage: nextOffset !== null,
    },
    activity: membershipActivity(memberships, asOf),
  };
}

export async function inviteClientPortalMember(ownerUserId, clientId, values) {
  await crm.getOwnerClient(ownerUserId, clientId);
  return crm.inviteClientPortalMember(ownerUserId, clientId, values);
}

export async function resendClientPortalInvitation(ownerUserId, clientId, membershipId) {
  await crm.getOwnerClient(ownerUserId, clientId);
  return crm.resendClientPortalInvitation(ownerUserId, clientId, membershipId);
}

export async function revokeClientPortalMembership(ownerUserId, clientId, membershipId) {
  await crm.getOwnerClient(ownerUserId, clientId);
  return crm.revokeClientPortalMembership(ownerUserId, clientId, membershipId);
}

export function createClientContact(ownerUserId, clientId, values) { return crm.createClientContact(ownerUserId, clientId, values); }
export function updateClientContact(ownerUserId, clientId, contactId, values) { return crm.updateClientContact(ownerUserId, clientId, contactId, values); }
export function deleteClientContact(ownerUserId, clientId, contactId) { return crm.deleteClientContact(ownerUserId, clientId, contactId); }


function unavailableField(label, source, reason) {
  return { label, status: 'unavailable', source, window: 'current', asOf: new Date().toISOString(), reason };
}

async function projectReferences(ownerUserId, projects) {
  const clientIds = [...new Set(projects.map((project) => project.client_id))];
  const clients = await crm.listOwnerClientReferences(ownerUserId, clientIds);
  return new Map(clients.map((client) => [client.id, client]));
}

function projectView(project, clientsById) {
  return {
    id: project.id,
    name: project.name,
    client: clientsById.get(project.client_id) || null,
    status: unavailableField('Project status', 'crm_projects', 'No authoritative project status field exists.'),
    progress: unavailableField('Project progress', 'crm_projects', 'No authoritative project progress field exists.'),
  };
}

async function taskViews(ownerUserId, tasks) {
  const projectIds = [...new Set(tasks.map((task) => task.project_id))];
  const projects = await crm.listOwnerProjectReferences(ownerUserId, projectIds);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const clientsById = await projectReferences(ownerUserId, projects);
  const employeeIds = [...new Set(tasks.map((task) => task.assigned_user_id).filter(Boolean))];
  const employees = await crm.listOwnerEmployeeReferences(ownerUserId, employeeIds);
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  return tasks.flatMap((task) => {
    const project = projectsById.get(task.project_id);
    if (!project) return [];
    const employee = task.assigned_user_id ? employeesById.get(task.assigned_user_id) : null;
    return [{
      id: task.id,
      name: task.name,
      completed: task.completed,
      assignee: employee ? { id: employee.id, fullName: employee.full_name || null, email: employee.email } : null,
      project: { id: project.id, name: project.name, client: clientsById.get(project.client_id) || null },
      status: unavailableField('Task status', 'crm_tasks', 'Completion is the only authoritative task-state field.'),
      priority: unavailableField('Task priority', 'crm_tasks', 'No authoritative task priority field exists.'),
      dueDate: unavailableField('Task due date', 'crm_tasks', 'No authoritative task due-date field exists.'),
      progress: unavailableField('Task progress', 'crm_tasks', 'No authoritative task progress field exists.'),
    }];
  });
}

export async function listProjects(ownerUserId, query) {
  const page = await crm.listOwnerProjects(ownerUserId, query);
  const clientsById = await projectReferences(ownerUserId, page.items);
  return { ...page, items: page.items.map((project) => projectView(project, clientsById)) };
}

export async function getProjectDetail(ownerUserId, projectId, query) {
  const [project, taskPage] = await Promise.all([
    crm.getOwnerProject(ownerUserId, projectId),
    crm.listOwnerProjectTasks(ownerUserId, projectId, query),
  ]);
  const clientsById = await projectReferences(ownerUserId, [project]);
  return { project: projectView(project, clientsById), tasks: { ...taskPage, items: await taskViews(ownerUserId, taskPage.items) } };
}

export async function listTasks(ownerUserId, query) {
  const page = await crm.listOwnerTasks(ownerUserId, query);
  return { ...page, items: await taskViews(ownerUserId, page.items) };
}

export async function getTaskDetail(ownerUserId, taskId) {
  const task = await crm.getOwnerTask(ownerUserId, taskId);
  const [view] = await taskViews(ownerUserId, [task]);
  if (!view) throw new AppError('Task not found.', 404, 'TASK_NOT_FOUND');
  return view;
}

export function createProject(ownerUserId, values) { return crm.createProject(ownerUserId, values); }
export function updateProject(ownerUserId, projectId, values) { return crm.updateProject(ownerUserId, projectId, values); }
export function createProjectTask(ownerUserId, projectId, values) { return crm.createTask(ownerUserId, projectId, values); }
export function updateProjectTask(ownerUserId, projectId, taskId, values) { return crm.updateTask(ownerUserId, projectId, taskId, values); }


const EMPLOYEE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPLOYEE_SORTS = { 'name:asc': { field: 'full_name', ascending: true }, 'name:desc': { field: 'full_name', ascending: false }, 'email:asc': { field: 'email', ascending: true } };

function employeePageOptions(query, { searchable = false } = {}) {
  const rawLimit = query?.limit; const limit = rawLimit === undefined ? 20 : Number.parseInt(rawLimit, 10);
  if (rawLimit !== undefined && (typeof rawLimit !== 'string' || !Number.isSafeInteger(limit) || limit < 1 || limit > 50 || String(limit) !== rawLimit)) throw new AppError('Query limit is invalid.', 400, 'VALIDATION_ERROR');
  const sortValue = query?.sort || 'name:asc'; if (typeof sortValue !== 'string' || !EMPLOYEE_SORTS[sortValue]) throw new AppError('Query sort is invalid.', 400, 'VALIDATION_ERROR');
  const rawCursor = query?.cursor; let offset = 0;
  if (rawCursor !== undefined) { if (typeof rawCursor !== 'string') throw new AppError('Query cursor is invalid.', 400, 'VALIDATION_ERROR'); try { const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8'); if (!/^\d+$/.test(decoded)) throw new Error('invalid'); offset = Number.parseInt(decoded, 10); if (!Number.isSafeInteger(offset) || offset > 1000) throw new Error('invalid'); } catch { throw new AppError('Query cursor is invalid.', 400, 'VALIDATION_ERROR'); } }
  const q = query?.q; if (q !== undefined && (!searchable || typeof q !== 'string' || q.length > 80 || /[%_\\]/.test(q))) throw new AppError('Query q is invalid.', 400, 'VALIDATION_ERROR');
  return { limit, offset, sort: EMPLOYEE_SORTS[sortValue], q: q?.trim() || undefined };
}

function employeeId(value) {
  if (typeof value !== 'string' || !EMPLOYEE_UUID.test(value)) throw new AppError('Employee not found.', 404, 'EMPLOYEE_NOT_FOUND');
  return value;
}

function employeeUnavailable(label, reason) { return unavailableField(label, 'users', reason); }

function employeeView(employee, workload, asOf) {
  return {
    id: employee.id, fullName: employee.full_name || null, email: employee.email,
    workload: { status: 'available', source: 'crm_tasks', window: 'current', asOf, definition: 'Direct assignments currently scoped to this employee.', ...workload },
    availability: employeeUnavailable('Availability', 'No authoritative availability field exists.'),
    performance: employeeUnavailable('Performance summary', 'No authoritative performance definition or source exists.'),
  };
}

export async function listEmployees(ownerUserId, query) {
  const page = await repository.listOwnerEmployees(ownerUserId, employeePageOptions(query, { searchable: true }));
  const asOf = new Date().toISOString();
  const items = await Promise.all(page.items.map(async (employee) => employeeView(employee, await repository.getEmployeeWorkload(ownerUserId, employee.id), asOf)));
  return { items, pageInfo: { nextCursor: page.nextOffset === null ? null : Buffer.from(String(page.nextOffset)).toString('base64url'), hasNextPage: page.nextOffset !== null } };
}

export async function getEmployeeDetail(ownerUserId, rawEmployeeId, query) {
  const id = employeeId(rawEmployeeId); const employee = await repository.getOwnerEmployee(ownerUserId, id);
  if (!employee) throw new AppError('Employee not found.', 404, 'EMPLOYEE_NOT_FOUND');
  const taskPage = await repository.listEmployeeAssignedTasks(ownerUserId, id, employeePageOptions(query));
  const asOf = new Date().toISOString(); const assignments = await taskViews(ownerUserId, taskPage.items);
  const projects = [...new Map(assignments.map((task) => [task.project.id, task.project])).values()];
  return {
    employee: employeeView(employee, await repository.getEmployeeWorkload(ownerUserId, id), asOf), projects,
    assignments: { items: assignments, pageInfo: { nextCursor: taskPage.nextOffset === null ? null : Buffer.from(String(taskPage.nextOffset)).toString('base64url'), hasNextPage: taskPage.nextOffset !== null } },
  };
}


const DOCUMENT_SORTS = { 'created_at:desc': { field: 'created_at', ascending: false }, 'title:asc': { field: 'title', ascending: true } };
const DOCUMENT_TYPES = new Set(['deliverable', 'report']);
const AUDIT_CATEGORIES = { all: [], security: ['user.login', 'login.failed', 'account.locked'], invitations: ['client_portal_invitation'], documents: ['client_portal_document'] };
const SEARCH_TYPES = new Set(['companies', 'contacts', 'leads', 'clients', 'projects', 'tasks', 'employees', 'documents']);

function boundedQuery(value, field, { required = false } = {}) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || value.length > 80 || /[%_\\]/.test(value)) throw new AppError(`Query ${field} is invalid.`, 400, 'VALIDATION_ERROR');
  return value.trim();
}

function boundedOffset(value) {
  if (value === undefined) return 0;
  if (typeof value !== 'string') throw new AppError('Query cursor is invalid.', 400, 'VALIDATION_ERROR');
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    if (!/^\d+$/.test(decoded)) throw new Error('invalid');
    const offset = Number.parseInt(decoded, 10);
    if (!Number.isSafeInteger(offset) || offset > 1000) throw new Error('invalid');
    return offset;
  } catch { throw new AppError('Query cursor is invalid.', 400, 'VALIDATION_ERROR'); }
}

function boundedLimit(value) {
  const limit = value === undefined ? 20 : Number.parseInt(value, 10);
  if (typeof value !== 'undefined' && (typeof value !== 'string' || !Number.isSafeInteger(limit) || limit < 1 || limit > 50 || String(limit) !== value)) throw new AppError('Query limit is invalid.', 400, 'VALIDATION_ERROR');
  return limit;
}

function documentPageOptions(query) {
  const limit = boundedLimit(query?.limit); const sortValue = query?.sort || 'created_at:desc';
  if (typeof sortValue !== 'string' || !DOCUMENT_SORTS[sortValue]) throw new AppError('Query sort is invalid.', 400, 'VALIDATION_ERROR');
  const clientId = query?.client_id; const projectId = query?.project_id;
  if (clientId !== undefined && !EMPLOYEE_UUID.test(clientId)) throw new AppError('Query client_id is invalid.', 400, 'VALIDATION_ERROR');
  if (projectId !== undefined && !EMPLOYEE_UUID.test(projectId)) throw new AppError('Query project_id is invalid.', 400, 'VALIDATION_ERROR');
  const visibility = query?.visibility || 'all'; if (!['all', 'visible', 'revoked'].includes(visibility)) throw new AppError('Query visibility is invalid.', 400, 'VALIDATION_ERROR');
  const documentType = query?.document_type; if (documentType !== undefined && !DOCUMENT_TYPES.has(documentType)) throw new AppError('Query document_type is invalid.', 400, 'VALIDATION_ERROR');
  return { limit, offset: boundedOffset(query?.cursor), sort: DOCUMENT_SORTS[sortValue], clientId, projectId, visibility, documentType, q: boundedQuery(query?.q, 'q') };
}

function documentView(document) {
  const client = Array.isArray(document.crm_clients) ? document.crm_clients[0] : document.crm_clients;
  const project = Array.isArray(document.crm_projects) ? document.crm_projects[0] : document.crm_projects;
  return { id: document.id, title: document.title, documentType: document.document_type, client: client ? { id: client.id, name: client.name } : null, project: project ? { id: project.id, name: project.name } : null, visibility: document.client_visible && !document.revoked_at ? 'visible' : 'revoked', createdAt: document.created_at, revokedAt: document.revoked_at || null };
}

function documentPage(result) {
  return { items: result.items.map(documentView), pageInfo: { nextCursor: result.nextOffset === null ? null : Buffer.from(String(result.nextOffset)).toString('base64url'), hasNextPage: result.nextOffset !== null } };
}

export async function listDocuments(ownerUserId, query) {
  const options = documentPageOptions(query);
  if (options.clientId) await crm.getOwnerClient(ownerUserId, options.clientId);
  if (options.projectId) await crm.getOwnerProject(ownerUserId, options.projectId);
  return documentPage(await repository.listOwnerDocuments(ownerUserId, options));
}

export async function getDocumentDetail(ownerUserId, rawDocumentId) {
  if (typeof rawDocumentId !== 'string' || !EMPLOYEE_UUID.test(rawDocumentId)) throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  const documentId = rawDocumentId;
  const document = await repository.getOwnerDocument(ownerUserId, documentId);
  if (!document) throw new AppError('Document not found.', 404, 'DOCUMENT_NOT_FOUND');
  return documentView(document);
}

export async function publishDocument(ownerUserId, values, file) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new AppError('Request body must be an object.', 400, 'VALIDATION_ERROR');
  const { client_id: clientId, ...documentValues } = values;
  if (typeof clientId !== 'string' || !EMPLOYEE_UUID.test(clientId)) throw new AppError('Field client_id must be a valid UUID.', 400, 'VALIDATION_ERROR');
  await crm.getOwnerClient(ownerUserId, clientId);
  const created = await crm.publishClientPortalDocument(ownerUserId, clientId, file, documentValues);
  return getDocumentDetail(ownerUserId, created.id);
}

export async function revokeDocument(ownerUserId, documentId) {
  const document = await getDocumentDetail(ownerUserId, documentId);
  await crm.revokeClientPortalDocument(ownerUserId, document.client.id, document.id);
  return getDocumentDetail(ownerUserId, document.id);
}

function auditPageOptions(query) {
  const category = query?.category || 'all';
  if (typeof category !== 'string' || !Object.hasOwn(AUDIT_CATEGORIES, category)) throw new AppError('Query category is invalid.', 400, 'VALIDATION_ERROR');
  return { limit: boundedLimit(query?.limit), offset: boundedOffset(query?.cursor), category, eventTypes: AUDIT_CATEGORIES[category] };
}

function auditLabel(event) {
  if (event.event_type === 'client_portal_document') return event.action === 'publish' ? 'Client Portal document published' : 'Client Portal document event';
  if (event.event_type === 'client_portal_invitation') return `Client Portal invitation ${event.action}`;
  if (event.event_type === 'user.login') return 'Successful owner sign-in';
  if (event.event_type === 'login.failed') return 'Failed owner sign-in';
  if (event.event_type === 'account.locked') return 'Owner account locked';
  return 'Owner security event';
}

export async function listAuditEvents(ownerUserId, query) {
  const options = auditPageOptions(query); const result = await repository.listOwnerAuditEvents(ownerUserId, options);
  return { items: result.items.map((event) => ({ id: event.id, label: auditLabel(event), category: event.event_type.startsWith('client_portal_document') ? 'documents' : event.event_type.startsWith('client_portal_invitation') ? 'invitations' : 'security', action: event.action, success: event.success, resourceType: event.resource_type || null, resourceId: event.resource_id || null, createdAt: event.created_at })), pageInfo: { nextCursor: result.nextOffset === null ? null : Buffer.from(String(result.nextOffset)).toString('base64url'), hasNextPage: result.nextOffset !== null } };
}

export function getSettingsStatus() {
  const asOf = new Date().toISOString();
  const unavailableStatus = (label, source, reason) => ({ label, status: 'unavailable', source, asOf, reason });
  return { asOf, api: { label: 'Owner Workspace API', status: 'available', source: 'owner_workspace_request', asOf, value: 'reachable' }, environment: { label: 'Runtime environment', status: 'available', source: 'runtime', asOf, value: process.env.NODE_ENV === 'production' ? 'production' : 'non-production' }, companyProfile: unavailableStatus('Company profile', 'crm', 'No authoritative company profile source is configured.'), branding: unavailableStatus('Branding', 'settings', 'No authoritative branding source is configured.'), integrations: unavailableStatus('Integrations', 'integrations', 'No redacted integration status source is configured.'), editableSettings: unavailableStatus('Editable settings', 'auth_settings', 'No safely allowlisted owner settings are configured.') };
}

function searchGroup(type, status, items = [], reason) { return { type, status, items, ...(reason ? { reason } : {}) }; }

export async function globalSearch(ownerUserId, query) {
  const q = boundedQuery(query?.q, 'q', { required: true });
  const rawTypes = query?.types || [...SEARCH_TYPES].join(',');
  if (typeof rawTypes !== 'string') throw new AppError('Query types is invalid.', 400, 'VALIDATION_ERROR');
  const types = [...new Set(rawTypes.split(',').filter(Boolean))];
  if (types.length === 0 || types.some((type) => !SEARCH_TYPES.has(type))) throw new AppError('Query types is invalid.', 400, 'VALIDATION_ERROR');
  const page = { limit: '5', q, sort: 'name:asc' };
  const sources = {
    companies: async () => (await crm.listOwnerCompanies(ownerUserId, page)).items.map((item) => ({ id: item.id, label: item.name, href: `/dashboard/crm?company=${item.id}` })),
    contacts: async () => (await crm.listOwnerContacts(ownerUserId, page)).items.map((item) => ({ id: item.id, label: item.name, detail: item.email || undefined, href: `/dashboard/crm?contact=${item.id}` })),
    clients: async () => (await crm.listOwnerClients(ownerUserId, page)).items.map((item) => ({ id: item.id, label: item.name, href: `/dashboard/clients/${item.id}` })),
    projects: async () => (await crm.listOwnerProjects(ownerUserId, page)).items.map((item) => ({ id: item.id, label: item.name, href: `/dashboard/projects/${item.id}` })),
    tasks: async () => (await crm.listOwnerTasks(ownerUserId, page)).items.map((item) => ({ id: item.id, label: item.name, detail: item.completed ? 'Completed' : 'Open', href: `/dashboard/projects/${item.project_id}` })),
    employees: async () => (await repository.listOwnerEmployees(ownerUserId, { limit: 5, offset: 0, sort: EMPLOYEE_SORTS['name:asc'], q })).items.map((item) => ({ id: item.id, label: item.full_name || item.email, detail: item.email, href: `/dashboard/employees/${item.id}` })),
    documents: async () => (await listDocuments(ownerUserId, { limit: '5', q })).items.map((item) => ({ id: item.id, label: item.title, detail: item.documentType, href: `/dashboard/documents/${item.id}` })),
  };
  const groups = await Promise.all(types.map(async (type) => {
    if (type === 'leads') return searchGroup(type, 'unavailable', [], 'No searchable lead display field exists.');
    try { return searchGroup(type, 'available', await sources[type]()); } catch { return searchGroup(type, 'unavailable', [], 'This source is temporarily unavailable.'); }
  }));
  return { asOf: new Date().toISOString(), groups };
}
