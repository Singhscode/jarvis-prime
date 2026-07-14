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

export function ownedCompanyExists(ownerUserId, id) {
  return ownedRecordExists('companies', ownerUserId, id);
}

export function ownedContactExists(ownerUserId, id) {
  return ownedRecordExists('contacts', ownerUserId, id);
}
