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
