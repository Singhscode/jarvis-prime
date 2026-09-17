// Supabase data-access layer for the engine.
// When no credentials are configured, falls back to an in-memory store so the
// whole pipeline still runs end-to-end in dry-run mode (great for testing).

import { createClient } from '@supabase/supabase-js';
import { config } from '../config/config.js';
import { log } from '../utils/logger.js';

let client = null;
let usingMemory = false;

// In-memory fallback tables
const mem = {
  clients: [],
  prospects: [],
  messages: [],
  events: [],
  suppression: [],
  campaigns: [],
  campaign_steps: [],
  linkedin_actions: [],
  scheduled_jobs: [],
  ab_tests: [],
  webhook_events: [],
  notifications: [],
};

export function getDb() {
  if (client || usingMemory) return { client, usingMemory };
  if (config.supabaseUrl && config.supabaseKey) {
    client = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: false },
    });
    log.ok('Connected to Supabase database.');
  } else {
    usingMemory = true;
    seedMemory();
    log.warn('No Supabase credentials — using in-memory store (data is not saved).');
  }
  return { client, usingMemory };
}

/**
 * Verify database connectivity. Returns true if connected, false otherwise.
 * Used by deep health checks and readiness probes.
 */
export async function checkConnection() {
  const { client: db, usingMemory: isMem } = getDb();
  if (isMem) return true; // In-memory always "connected"
  try {
    const { error } = await db.from('clients').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Execute a DB operation with retry logic for transient errors.
 * @param {Function} operation  Async function to execute
 * @param {number} maxRetries   Maximum retry attempts (default: 3)
 * @param {number} baseDelay    Base delay in ms for exponential backoff (default: 500)
 */
async function withRetry(operation, maxRetries = 3, baseDelay = 500) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        log.warn(`DB operation failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms: ${err.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// Seed a sample client + prospects so dry-runs have something to chew on.
function seedMemory() {
  const clientId = 'demo-client-0001';
  mem.clients.push({
    id: clientId,
    name: 'Demo Marketing Agency',
    contact_email: 'owner@demoagency.test',
    icp_titles: ['Founder', 'CEO', 'Head of Sales'],
    icp_industries: ['Marketing', 'Advertising'],
    icp_locations: ['India'],
    icp_keywords: ['agency', 'lead gen', 'outbound', 'b2b', 'sales', 'scale'],
    status: 'active',
  });

  // Add sample prospects in various stages
  mem.prospects = [
    { id: 'p-1', client_id: clientId, email: 'john@techcorp.com', full_name: 'John Smith', title: 'CEO', company: 'TechCorp', stage: 'new', qualified: true, icp_score: 85 },
    { id: 'p-2', client_id: clientId, email: 'jane@startup.io', full_name: 'Jane Doe', title: 'Head of Sales', company: 'StartupIO', stage: 'qualified', qualified: true, icp_score: 92 },
    { id: 'p-3', client_id: clientId, email: 'bob@marketing.com', full_name: 'Bob Wilson', title: 'Marketing Manager', company: 'MarketingPro', stage: 'contacted', qualified: true, icp_score: 78 },
    { id: 'p-4', client_id: clientId, email: 'alice@enterprise.co', full_name: 'Alice Johnson', title: 'VP Sales', company: 'Enterprise Co', stage: 'contacted', qualified: true, icp_score: 88 },
    { id: 'p-5', client_id: clientId, email: 'charlie@growth.io', full_name: 'Charlie Brown', title: 'Growth Lead', company: 'GrowthIO', stage: 'replied', qualified: true, icp_score: 81 },
    { id: 'p-6', client_id: clientId, email: 'diana@digital.com', full_name: 'Diana Martinez', title: 'COO', company: 'DigitalVentures', stage: 'replied', qualified: true, icp_score: 90 },
    { id: 'p-7', client_id: clientId, email: 'evan@scale.co', full_name: 'Evan Zhang', title: 'Founder', company: 'ScaleAI', stage: 'booked', qualified: true, icp_score: 95 },
  ];

  // Add sample messages (emails sent)
  mem.messages = [
    { id: 'm-1', prospect_id: 'p-1', status: 'sent', created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 'm-2', prospect_id: 'p-2', status: 'sent', created_at: new Date(Date.now() - 2400000).toISOString() },
    { id: 'm-3', prospect_id: 'p-3', status: 'sent', created_at: new Date(Date.now() - 1800000).toISOString() },
    { id: 'm-4', prospect_id: 'p-4', status: 'sent', created_at: new Date(Date.now() - 1200000).toISOString() },
    { id: 'm-5', prospect_id: 'p-5', status: 'sent', created_at: new Date(Date.now() - 600000).toISOString() },
    { id: 'm-6', prospect_id: 'p-6', status: 'sent', created_at: new Date(Date.now() - 300000).toISOString() },
    { id: 'm-7', prospect_id: 'p-7', status: 'sent', created_at: new Date().toISOString() },
    { id: 'm-8', prospect_id: 'p-3', status: 'dry_run', created_at: new Date().toISOString() },
    { id: 'm-9', prospect_id: 'p-5', status: 'dry_run', created_at: new Date().toISOString() },
  ];
}

// ---- Generic helpers that work for both Supabase and memory ----

export async function listActiveClients() {
  const { client, usingMemory } = getDb();
  if (usingMemory) return mem.clients.filter((c) => c.status === 'active');
  const { data, error } = await client.from('clients').select('*').eq('status', 'active');
  if (error) throw new Error(`listActiveClients: ${error.message}`);
  return data || [];
}

export async function getProspectWithActiveClient(prospectId) {
  if (typeof prospectId !== 'string' || !prospectId.trim()) return null;

  const { client: dbClient, usingMemory } = getDb();
  if (usingMemory) {
    const prospect = mem.prospects.find((row) => row.id === prospectId) || null;
    if (!prospect) return null;
    const client = mem.clients.find(
      (row) => row.id === prospect.client_id && row.status === 'active'
    ) || null;
    return client ? { prospect, client } : null;
  }

  const { data: prospect, error: prospectError } = await dbClient
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .maybeSingle();
  if (prospectError) throw new Error('Unable to resolve outreach prospect.');
  if (!prospect?.client_id) return null;

  const { data: activeClient, error: clientError } = await dbClient
    .from('clients')
    .select('*')
    .eq('id', prospect.client_id)
    .eq('status', 'active')
    .maybeSingle();
  if (clientError) throw new Error('Unable to resolve outreach client.');

  return activeClient ? { prospect, client: activeClient } : null;
}

export async function insertProspects(rows) {
  if (rows.length === 0) return [];
  const { client, usingMemory } = getDb();
  if (usingMemory) {
    const inserted = [];
    for (const r of rows) {
      const exists = mem.prospects.find((p) => p.client_id === r.client_id && p.email === r.email);
      if (exists) continue;
      const row = { id: `p-${mem.prospects.length + 1}`, stage: 'new', step: 0, ...r };
      mem.prospects.push(row);
      inserted.push(row);
    }
    return inserted;
  }
  const { data, error } = await client
    .from('prospects')
    .upsert(rows, { onConflict: 'client_id,email', ignoreDuplicates: true })
    .select();
  if (error) throw new Error(`insertProspects: ${error.message}`);
  return data || [];
}

export async function getProspectsByStage(stage, limit = 100) {
  const { client, usingMemory } = getDb();
  if (usingMemory) return mem.prospects.filter((p) => p.stage === stage).slice(0, limit);
  const { data, error } = await client
    .from('prospects')
    .select('*')
    .eq('stage', stage)
    .limit(limit);
  if (error) throw new Error(`getProspectsByStage: ${error.message}`);
  return data || [];
}

// Prospects that are due for their next outreach step.
export async function getDueProspects(limit = 100) {
  const { client, usingMemory } = getDb();
  const nowIso = new Date().toISOString();
  if (usingMemory) {
    return mem.prospects
      .filter((p) => ['queued', 'contacted'].includes(p.stage))
      .filter((p) => !p.next_action_at || p.next_action_at <= nowIso)
      .slice(0, limit);
  }
  const { data, error } = await client
    .from('prospects')
    .select('*')
    .in('stage', ['queued', 'contacted'])
    .or(`next_action_at.is.null,next_action_at.lte.${nowIso}`)
    .limit(limit);
  if (error) throw new Error(`getDueProspects: ${error.message}`);
  return data || [];
}

export async function updateProspect(id, patch) {
  const { client, usingMemory } = getDb();
  if (usingMemory) {
    const row = mem.prospects.find((p) => p.id === id);
    if (row) Object.assign(row, patch);
    return row;
  }
  const { data, error } = await client.from('prospects').update(patch).eq('id', id).select().single();
  if (error) throw new Error(`updateProspect: ${error.message}`);
  return data;
}

export async function insertMessage(row) {
  const { client, usingMemory } = getDb();
  if (usingMemory) {
    const m = { id: `m-${mem.messages.length + 1}`, created_at: new Date().toISOString(), ...row };
    mem.messages.push(m);
    return m;
  }
  const { data, error } = await client.from('messages').insert(row).select().single();
  if (error) throw new Error(`insertMessage: ${error.message}`);
  return data;
}

export async function insertEvent(row) {
  const { client, usingMemory } = getDb();
  if (usingMemory) {
    mem.events.push({ id: `e-${mem.events.length + 1}`, created_at: new Date().toISOString(), ...row });
    return;
  }
  const { error } = await client.from('events').insert(row);
  if (error) log.warn(`insertEvent failed: ${error.message}`);
}

export async function isSuppressed(email) {
  if (!email) return true;
  const { client, usingMemory } = getDb();
  if (usingMemory) return mem.suppression.some((s) => s.email === email.toLowerCase());
  const { data, error } = await client
    .from('suppression')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) {
    log.warn(`isSuppressed check failed, treating as suppressed for safety: ${error.message}`);
    return true;
  }
  return Boolean(data);
}

export async function addSuppression(email, reason = 'unsubscribe') {
  if (!email) return;
  const { client, usingMemory } = getDb();
  if (usingMemory) {
    if (!mem.suppression.some((s) => s.email === email.toLowerCase())) {
      mem.suppression.push({ email: email.toLowerCase(), reason });
    }
    return;
  }
  const { error } = await client
    .from('suppression')
    .upsert({ email: email.toLowerCase(), reason }, { onConflict: 'email' });
  if (error) log.warn(`addSuppression failed: ${error.message}`);
}

// Counts messages sent today (used to respect the daily send cap).
export async function countMessagesSentToday() {
  const { client, usingMemory } = getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  if (usingMemory) {
    return mem.messages.filter(
      (m) => ['sent', 'dry_run'].includes(m.status) && new Date(m.created_at) >= startOfDay
    ).length;
  }
  const { count, error } = await client
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .in('status', ['sent', 'dry_run'])
    .gte('created_at', startOfDay.toISOString());
  if (error) {
    log.warn(`countMessagesSentToday failed: ${error.message}`);
    return 0;
  }
  return count || 0;
}

// Exposed for tests
export const _memory = mem;

// ---- LinkedIn Actions ----

export async function insertLinkedInAction(row) {
  const { client: dbClient, usingMemory } = getDb();
  if (usingMemory) {
    const action = { id: `la-${mem.linkedin_actions.length + 1}`, created_at: new Date().toISOString(), ...row };
    mem.linkedin_actions.push(action);
    return action;
  }
  const { data, error } = await dbClient.from('linkedin_actions').insert(row).select().single();
  if (error) log.warn(`insertLinkedInAction failed: ${error.message}`);
  return data;
}

export async function countLinkedInActionsToday(actionType) {
  const { client: dbClient, usingMemory } = getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  if (usingMemory) {
    return mem.linkedin_actions.filter(
      (a) => a.action_type === actionType && new Date(a.created_at) >= startOfDay
    ).length;
  }
  const { count, error } = await dbClient
    .from('linkedin_actions')
    .select('id', { count: 'exact', head: true })
    .eq('action_type', actionType)
    .gte('created_at', startOfDay.toISOString());
  if (error) return 0;
  return count || 0;
}

// ---- Campaign CRUD ----

export async function insertCampaign(row) {
  const { client: dbClient, usingMemory } = getDb();
  if (usingMemory) {
    const campaign = { id: `camp-${mem.campaigns.length + 1}`, created_at: new Date().toISOString(), ...row };
    mem.campaigns.push(campaign);
    return campaign;
  }
  const { data, error } = await dbClient.from('campaigns').insert(row).select().single();
  if (error) throw new Error(`insertCampaign: ${error.message}`);
  return data;
}

export async function listCampaigns(clientId) {
  const { client: dbClient, usingMemory } = getDb();
  if (usingMemory) {
    return clientId ? mem.campaigns.filter((c) => c.client_id === clientId) : mem.campaigns;
  }
  let query = dbClient.from('campaigns').select('*').order('created_at', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) throw new Error(`listCampaigns: ${error.message}`);
  return data || [];
}

// ---- Webhook Events ----

export async function insertWebhookEvent(row) {
  const { client: dbClient, usingMemory } = getDb();
  if (usingMemory) {
    const event = { id: `wh-${mem.webhook_events.length + 1}`, created_at: new Date().toISOString(), ...row };
    mem.webhook_events.push(event);
    return event;
  }
  const { data, error } = await dbClient.from('webhook_events').insert(row).select().single();
  if (error) log.warn(`insertWebhookEvent failed: ${error.message}`);
  return data;
}

// ---- Analytics Helpers ----

export async function getProspectCounts(clientId) {
  const { client: dbClient, usingMemory } = getDb();
  if (usingMemory) {
    const prospects = clientId ? mem.prospects.filter((p) => p.client_id === clientId) : mem.prospects;
    const stages = {};
    for (const p of prospects) {
      stages[p.stage] = (stages[p.stage] || 0) + 1;
    }
    return { total: prospects.length, stages };
  }
  // Supabase: use RPC or manual aggregation
  let query = dbClient.from('prospects').select('stage');
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) return { total: 0, stages: {} };
  const stages = {};
  for (const row of data || []) {
    stages[row.stage] = (stages[row.stage] || 0) + 1;
  }
  return { total: (data || []).length, stages };
}

// ---- Client Helpers ----

export async function getClientById(clientId) {
  const { client: dbClient, usingMemory } = getDb();
  if (usingMemory) {
    return mem.clients.find((c) => c.id === clientId) || null;
  }
  const { data, error } = await dbClient.from('clients').select('*').eq('id', clientId).maybeSingle();
  if (error) throw new Error(`getClientById: ${error.message}`);
  return data;
}
