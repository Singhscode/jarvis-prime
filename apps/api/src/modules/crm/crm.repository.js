import { getDb } from '../../database/db.js';

function client() {
  const { client: db, usingMemory } = getDb();
  if (usingMemory) {
    throw new Error('CRM requires a Supabase database. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return db;
}

async function ownedRecordExists(table, ownerUserId, id) {
  const { data, error } = await client()
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function listCompanies(ownerUserId) {
  const { data, error } = await client()
    .from('companies')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createCompany(ownerUserId, values) {
  const { data, error } = await client()
    .from('companies')
    .insert({ owner_user_id: ownerUserId, ...values })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCompany(ownerUserId, id, values) {
  const { data, error } = await client()
    .from('companies')
    .update(values)
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteCompany(ownerUserId, id) {
  const { data, error } = await client()
    .from('companies')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listContacts(ownerUserId) {
  const { data, error } = await client()
    .from('contacts')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createContact(ownerUserId, values) {
  const { data, error } = await client()
    .from('contacts')
    .insert({ owner_user_id: ownerUserId, ...values })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateContact(ownerUserId, id, values) {
  const { data, error } = await client()
    .from('contacts')
    .update(values)
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteContact(ownerUserId, id) {
  const { data, error } = await client()
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listLeads(ownerUserId) {
  const { data, error } = await client()
    .from('crm_leads')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .is('client_id', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createLead(ownerUserId, contactId) {
  const { data, error } = await client()
    .from('crm_leads')
    .insert({ owner_user_id: ownerUserId, contact_id: contactId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLead(ownerUserId, id) {
  const { data, error } = await client()
    .from('crm_leads')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listClients(ownerUserId) {
  const { data, error } = await client()
    .from('crm_clients')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function convertLeadToClient(ownerUserId, leadId, contactId, name) {
  const { data, error } = await client().rpc('convert_crm_lead_to_client', {
    p_owner_user_id: ownerUserId,
    p_lead_id: leadId,
    p_contact_id: contactId,
    p_name: name,
  });
  if (error) throw error;
  return data;
}

export async function listProjects(ownerUserId) {
  const { data, error } = await client()
    .from('crm_projects')
    .select('*')
    .eq('owner_user_id', ownerUserId);
  if (error) throw error;
  return data || [];
}

export async function createProject(ownerUserId, values) {
  const { data, error } = await client()
    .from('crm_projects')
    .insert({ owner_user_id: ownerUserId, ...values })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(ownerUserId, id, values) {
  const { data, error } = await client()
    .from('crm_projects')
    .update(values)
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteProject(ownerUserId, id) {
  const { data, error } = await client()
    .from('crm_projects')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateClient(ownerUserId, id, values) {
  const { data, error } = await client()
    .from('crm_clients')
    .update(values)
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteClient(ownerUserId, id) {
  const { data, error } = await client()
    .from('crm_clients')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOwnedUnconvertedLead(ownerUserId, id) {
  const { data, error } = await client()
    .from('crm_leads')
    .select('id, contact_id')
    .eq('id', id)
    .eq('owner_user_id', ownerUserId)
    .is('client_id', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listClientContacts(ownerUserId, clientId) {
  const { data, error } = await client()
    .from('contacts')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createClientContact(ownerUserId, clientId, values) {
  const { data, error } = await client()
    .from('contacts')
    .insert({ owner_user_id: ownerUserId, client_id: clientId, ...values })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClientContact(ownerUserId, clientId, contactId, values) {
  const { data, error } = await client()
    .from('contacts')
    .update(values)
    .eq('id', contactId)
    .eq('owner_user_id', ownerUserId)
    .eq('client_id', clientId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function detachClientContact(ownerUserId, clientId, contactId) {
  const { data, error } = await client()
    .from('contacts')
    .update({ client_id: null })
    .eq('id', contactId)
    .eq('owner_user_id', ownerUserId)
    .eq('client_id', clientId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function ownedCompanyExists(ownerUserId, id) {
  return ownedRecordExists('companies', ownerUserId, id);
}

export function ownedContactExists(ownerUserId, id) {
  return ownedRecordExists('contacts', ownerUserId, id);
}

export function ownedClientExists(ownerUserId, id) {
  return ownedRecordExists('crm_clients', ownerUserId, id);
}

export function ownedProjectExists(ownerUserId, id) {
  return ownedRecordExists('crm_projects', ownerUserId, id);
}

export async function listTasks(ownerUserId, projectId) {
  const { data, error } = await client()
    .from('crm_tasks')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .eq('project_id', projectId);
  if (error) throw error;
  return data || [];
}

export async function createTask(ownerUserId, projectId, values) {
  const { data, error } = await client()
    .from('crm_tasks')
    .insert({ owner_user_id: ownerUserId, project_id: projectId, ...values })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(ownerUserId, projectId, taskId, values) {
  const { data, error } = await client()
    .from('crm_tasks')
    .update(values)
    .eq('id', taskId)
    .eq('owner_user_id', ownerUserId)
    .eq('project_id', projectId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteTask(ownerUserId, projectId, taskId) {
  const { data, error } = await client()
    .from('crm_tasks')
    .delete()
    .eq('id', taskId)
    .eq('owner_user_id', ownerUserId)
    .eq('project_id', projectId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getActiveEmployeeById(employeeUserId, ownerUserId = null) {
  let query = client()
    .from('users')
    .select('id, role, status, portal_owner_user_id')
    .eq('id', employeeUserId)
    .eq('role', 'employee')
    .eq('status', 'active');
  if (ownerUserId) query = query.eq('portal_owner_user_id', ownerUserId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function listAssignedTasks(ownerUserId, assignedUserId) {
  const { data, error } = await client()
    .from('crm_tasks')
    .select('id, project_id, name, completed')
    .eq('owner_user_id', ownerUserId)
    .eq('assigned_user_id', assignedUserId);
  if (error) throw error;
  return data || [];
}

export async function listEmployeeProjects(ownerUserId, projectIds) {
  if (projectIds.length === 0) return [];
  const { data, error } = await client()
    .from('crm_projects')
    .select('id, client_id, name')
    .eq('owner_user_id', ownerUserId)
    .in('id', projectIds);
  if (error) throw error;
  return data || [];
}

export async function listEmployeeClients(ownerUserId) {
  const { data, error } = await client()
    .from('crm_clients')
    .select('id, name, created_at')
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listEmployeeLeads(ownerUserId) {
  const { data, error } = await client()
    .from('crm_leads')
    .select('id, contact_id, created_at')
    .eq('owner_user_id', ownerUserId)
    .is('client_id', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function completeTask(employeeUserId, taskId, completed, justification) {
  const { data, error } = await client().rpc('complete_employee_portal_task', {
    p_employee_user_id: employeeUserId,
    p_task_id: taskId,
    p_completed: completed,
    p_justification: justification,
  });
  if (error) throw error;
  return data;
}

export async function listActiveClientPortalMemberships(userId) {
  const { data, error } = await client()
    .from('client_portal_memberships')
    .select('id, crm_client_id, user_id, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(2);
  if (error) throw error;
  return data || [];
}

export async function getClientPortalSnapshot(clientId) {
  const [clientResult, projectsResult, documentsResult] = await Promise.all([
    client().from('crm_clients').select('id, name').eq('id', clientId).maybeSingle(),
    client().from('crm_projects').select('id, name').eq('client_id', clientId),
    client()
      .from('client_portal_documents')
      .select('id, project_id, title, document_type, created_at')
      .eq('crm_client_id', clientId)
      .eq('client_visible', true)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
  ]);
  if (clientResult.error) throw clientResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (documentsResult.error) throw documentsResult.error;

  const projects = projectsResult.data || [];
  const projectIds = projects.map((project) => project.id);
  let tasks = [];
  if (projectIds.length > 0) {
    const { data, error } = await client()
      .from('crm_tasks')
      .select('id, project_id, name, completed')
      .in('project_id', projectIds);
    if (error) throw error;
    tasks = data || [];
  }

  return {
    client: clientResult.data,
    projects,
    tasks,
    documents: documentsResult.data || [],
  };
}

export async function getClientPortalDocument(clientId, documentId) {
  const { data, error } = await client()
    .from('client_portal_documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .eq('crm_client_id', clientId)
    .eq('client_visible', true)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getClientPortalMembership(clientId, membershipId) {
  const { data, error } = await client()
    .from('client_portal_memberships')
    .select('id, contact_id, email_normalized')
    .eq('id', membershipId)
    .eq('crm_client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function reissueClientPortalInvitation(ownerUserId, clientId, contactId, tokenHash, expiresAt) {
  const { data, error } = await client().rpc('reissue_client_portal_invitation', {
    p_owner_user_id: ownerUserId,
    p_client_id: clientId,
    p_contact_id: contactId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
  return data;
}

export async function activateClientPortalInvitation(userId, tokenHash) {
  const { data, error } = await client().rpc('activate_client_portal_invitation', {
    p_user_id: userId,
    p_token_hash: tokenHash,
  });
  if (error) throw error;
  return data;
}

export async function revokeClientPortalMembership(ownerUserId, clientId, membershipId) {
  const { data, error } = await client().rpc('revoke_client_portal_membership', {
    p_owner_user_id: ownerUserId,
    p_client_id: clientId,
    p_membership_id: membershipId,
  });
  if (error) throw error;
  return data;
}

export async function uploadClientPortalDocument(path, file) {
  const { error } = await client().storage
    .from('client-portal-private')
    .upload(path, file.buffer, { contentType: file.mimeType, upsert: false });
  if (error) throw error;
}

export async function removeClientPortalDocument(path) {
  const { error } = await client().storage.from('client-portal-private').remove([path]);
  if (error) throw error;
}

export async function publishClientPortalDocument(ownerUserId, clientId, projectId, path, title, documentType) {
  const { data, error } = await client().rpc('publish_client_portal_document', {
    p_owner_user_id: ownerUserId,
    p_client_id: clientId,
    p_project_id: projectId,
    p_storage_bucket: 'client-portal-private',
    p_storage_path: path,
    p_title: title,
    p_document_type: documentType,
  });
  if (error) throw error;
  return data;
}

export async function revokeClientPortalDocument(clientId, documentId) {
  const { data, error } = await client()
    .from('client_portal_documents')
    .update({ client_visible: false, revoked_at: new Date().toISOString() })
    .eq('id', documentId)
    .eq('crm_client_id', clientId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createClientPortalDownload(path, expiresIn = 60) {
  const { data, error } = await client().storage
    .from('client-portal-private')
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data;
}

export async function recordClientPortalAudit(userId, action, resourceType, resourceId, success) {
  const { error } = await client().from('audit_logs').insert({
    user_id: userId,
    event_type: 'client_portal_access',
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    success,
    details: { portal: 'client' },
  });
  if (error) throw error;
}
