import { getDb } from '../../database/db.js';

function client() {
  const { client: db, usingMemory } = getDb();
  if (usingMemory) throw new Error('Owner Workspace requires a Supabase database.');
  return db;
}

async function countRows(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function isAuthorizedOwnerWorkspaceUser(userId) {
  const { data: user, error: userError } = await client().from('users')
    .select('id,role,status').eq('id', userId).maybeSingle();
  if (userError) throw userError;

  // Temporary Phase 8 predicate: CRM owners are active standard accounts; external
  // Client Portal identities are authoritatively identified by memberships. Every
  // membership state is denied so a pending or revoked portal identity cannot gain
  // Owner access. Replace this bridge with the approved Phase 17 policy.
  if (!user || user.role !== 'client' || user.status !== 'active') return false;

  const { data: memberships, error: membershipError } = await client().from('client_portal_memberships')
    .select('id').eq('user_id', userId).limit(1);
  if (membershipError) throw membershipError;
  return memberships.length === 0;
}

export async function getDashboardCounts(ownerUserId) {
  const [activeEmployees, openTasks, completedTasks] = await Promise.all([
    countRows(client().from('users').select('id', { count: 'exact', head: true })
      .eq('portal_owner_user_id', ownerUserId).eq('role', 'employee').eq('status', 'active')),
    countRows(client().from('crm_tasks').select('id', { count: 'exact', head: true })
      .eq('owner_user_id', ownerUserId).eq('completed', false)),
    countRows(client().from('crm_tasks').select('id', { count: 'exact', head: true })
      .eq('owner_user_id', ownerUserId).eq('completed', true)),
  ]);
  return { activeEmployees, openTasks, completedTasks };
}


export async function listClientPortalMemberships(clientId, { limit, offset }) {
  const { data, error } = await client().from('client_portal_memberships')
    .select('id,contact_id,status,created_at,updated_at,activated_at,revoked_at')
    .eq('crm_client_id', clientId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit);
  if (error) throw error;
  const items = data || [];
  return {
    items: items.slice(0, limit),
    nextOffset: items.length > limit ? offset + limit : null,
  };
}

export async function listClientPortalContacts(ownerUserId, clientId, contactIds) {
  if (contactIds.length === 0) return [];
  const { data, error } = await client().from('contacts')
    .select('id,name,email,title').eq('owner_user_id', ownerUserId).eq('client_id', clientId).in('id', contactIds);
  if (error) throw error;
  return data || [];
}


export async function listOwnerEmployees(ownerUserId, { limit, offset, sort, q }) {
  let query = client().from('users').select('id,full_name,email,department,phone,status')
    .eq('portal_owner_user_id', ownerUserId).eq('role', 'employee').in('status', ['active', 'pending_verification']);
  if (q) query = query.ilike('full_name', `%${q}%`);
  const { data, error } = await query.order(sort.field, { ascending: sort.ascending }).order('id', { ascending: sort.ascending }).range(offset, offset + limit);
  if (error) throw error;
  const items = data || [];
  return { items: items.slice(0, limit), nextOffset: items.length > limit ? offset + limit : null };
}

export async function getOwnerEmployee(ownerUserId, employeeId) {
  const { data, error } = await client().from('users').select('id,full_name,email,department,phone,status')
    .eq('id', employeeId).eq('portal_owner_user_id', ownerUserId).eq('role', 'employee').in('status', ['active', 'pending_verification']).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createOwnerEmployeeInvitation(ownerUserId, values, tokenHash, expiresAt) {
  const { data, error } = await client().rpc('create_owner_employee_invitation', {
    p_owner_user_id: ownerUserId, p_email: values.email, p_full_name: values.fullName, p_department: values.department,
    p_phone: values.phone, p_token_hash: tokenHash, p_expires_at: expiresAt,
  });
  if (error) throw error;
  return data;
}

export async function recordOwnerEmployeeInvitationDelivery(ownerUserId, invitationId, deliveryStatus) {
  const { data, error } = await client().rpc('record_owner_employee_invitation_delivery', {
    p_owner_user_id: ownerUserId, p_invitation_id: invitationId, p_delivery_status: deliveryStatus,
  });
  if (error) throw error;
  return data;
}

export async function prepareOwnerEmployeeInvitationResend(ownerUserId, employeeUserId, tokenHash, expiresAt) {
  const { data, error } = await client().rpc('prepare_owner_employee_invitation_resend', {
    p_owner_user_id: ownerUserId, p_employee_user_id: employeeUserId, p_token_hash: tokenHash, p_expires_at: expiresAt,
  });
  if (error) throw error;
  return data;
}

export async function createOwnerAutomationRun(ownerUserId, workflow, idempotencyKey) {
  const { data, error } = await client().rpc('create_owner_automation_run', {
    p_owner_user_id: ownerUserId, p_workflow: workflow, p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export async function claimOwnerAutomationRun(ownerUserId, runId) {
  const { data, error } = await client().rpc('claim_owner_automation_run', { p_owner_user_id: ownerUserId, p_run_id: runId });
  if (error) throw error;
  return data;
}

export async function completeOwnerAutomationRun(ownerUserId, runId, result) {
  const { data, error } = await client().rpc('complete_owner_automation_run', { p_owner_user_id: ownerUserId, p_run_id: runId, p_result: result });
  if (error) throw error;
  return data;
}

export async function failOwnerAutomationRun(ownerUserId, runId) {
  const { data, error } = await client().rpc('fail_owner_automation_run', { p_owner_user_id: ownerUserId, p_run_id: runId });
  if (error) throw error;
  return data;
}

export async function getOwnerAutomationRun(ownerUserId, runId) {
  const { data, error } = await client().from('owner_automation_runs')
    .select('id,workflow,status,logs,result,created_at,started_at,completed_at').eq('id', runId).eq('owner_user_id', ownerUserId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getEmployeeWorkload(ownerUserId, employeeId) {
  const base = () => client().from('crm_tasks').select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId).eq('assigned_user_id', employeeId);
  const [assigned, open, completed] = await Promise.all([
    countRows(base()), countRows(base().eq('completed', false)), countRows(base().eq('completed', true)),
  ]);
  return { assigned, open, completed };
}

export async function listEmployeeAssignedTasks(ownerUserId, employeeId, { limit, offset }) {
  const { data, error } = await client().from('crm_tasks').select('id,project_id,name,completed,assigned_user_id')
    .eq('owner_user_id', ownerUserId).eq('assigned_user_id', employeeId)
    .order('name', { ascending: true }).order('id', { ascending: true }).range(offset, offset + limit);
  if (error) throw error;
  const items = data || [];
  return { items: items.slice(0, limit), nextOffset: items.length > limit ? offset + limit : null };
}


export async function listOwnerDocuments(ownerUserId, options) {
  let query = client().from('client_portal_documents')
    .select('id,crm_client_id,project_id,title,document_type,client_visible,created_at,revoked_at,crm_clients!inner(id,name,owner_user_id),crm_projects(id,name)')
    .eq('crm_clients.owner_user_id', ownerUserId);
  if (options.clientId) query = query.eq('crm_client_id', options.clientId);
  if (options.projectId) query = query.eq('project_id', options.projectId);
  if (options.documentType) query = query.eq('document_type', options.documentType);
  if (options.visibility === 'visible') query = query.eq('client_visible', true).is('revoked_at', null);
  if (options.visibility === 'revoked') query = query.eq('client_visible', false).not('revoked_at', 'is', null);
  if (options.q) query = query.ilike('title', `%${options.q}%`);
  const { data, error } = await query.order(options.sort.field, { ascending: options.sort.ascending }).order('id', { ascending: options.sort.ascending }).range(options.offset, options.offset + options.limit);
  if (error) throw error;
  const items = data || [];
  return { items: items.slice(0, options.limit), nextOffset: items.length > options.limit ? options.offset + options.limit : null };
}

export async function getOwnerDocument(ownerUserId, documentId) {
  const { data, error } = await client().from('client_portal_documents')
    .select('id,crm_client_id,project_id,title,document_type,client_visible,created_at,revoked_at,crm_clients!inner(id,name,owner_user_id),crm_projects(id,name)')
    .eq('id', documentId).eq('crm_clients.owner_user_id', ownerUserId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listOwnerAuditEvents(ownerUserId, options) {
  let query = client().from('audit_logs').select('id,event_type,action,resource_type,resource_id,success,created_at')
    .eq('user_id', ownerUserId);
  if (options.category !== 'all') query = query.in('event_type', options.eventTypes);
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(options.offset, options.offset + options.limit);
  if (error) throw error;
  const items = data || [];
  return { items: items.slice(0, options.limit), nextOffset: items.length > options.limit ? options.offset + options.limit : null };
}
