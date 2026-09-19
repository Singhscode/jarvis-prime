// Analytics Repository
// Aggregate queries for dashboard, revenue, clients, projects, tasks, communications, automation.
// Scoped queries filtered by owner_user_id + RLS.

import { getDb } from '../../database/db.js';

function client() {
  const { client: db } = getDb();
  return db;
}

/**
 * Get daily metrics for date range
 * @param {string} ownerUserId - Owner UUID
 * @param {string} startDate - ISO date string (YYYY-MM-DD or full ISO)
 * @param {string} endDate - ISO date string
 * @param {number} limit - Maximum rows to return (default: 100, max: 365)
 * @returns {Promise<Array>} Array of daily metric records
 */
export async function getDailyMetrics(ownerUserId, startDate, endDate, limit = 100) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 365);
  
  const { data, error } = await client()
    .from('analytics_daily_metrics')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .gte('metric_date', startDate)
    .lte('metric_date', endDate)
    .order('metric_date', { ascending: false })
    .limit(safeLimit);

  if (error) throw error;
  return data || [];
}

/**
 * Get revenue metrics for period.
 * Both the total and the per-invoice breakdown are scoped to the SAME
 * [startDate, endDate] window — there is exactly one query, so the total
 * can never drift out of sync with the invoice list it's derived from.
 * @param {string} ownerUserId - Owner UUID
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<{totalRevenueMinor: number, monthlyData: Array}>}
 */
export async function getRevenueStats(ownerUserId, startDate, endDate) {
  // Total revenue (all time, paid invoices only) - database-side aggregation via RPC
  const { data: totalRevenueResult, error: totalError } = await client()
    .rpc('get_revenue_by_owner', { 
      p_owner_user_id: ownerUserId,
      p_status: 'paid'
    });

  if (totalError) throw new Error(`getRevenueStats total: ${totalError.message}`);

  const totalRevenueMinor = (totalRevenueResult || [])[0]?.total_amount_minor || 0;

  // Monthly revenue (for date range) - also use aggregation via RPC
  const { data: monthlyData, error: monthlyError } = await client()
    .rpc('get_monthly_revenue', { 
      p_owner_user_id: ownerUserId,
      p_start_date: startDate,
      p_end_date: endDate
    });

  if (monthlyError) throw new Error(`getRevenueStats monthly: ${monthlyError.message}`);

  return {
    totalRevenueMinor,
    monthlyData: monthlyData || [],
  };
}

/**
 * Get client metrics
 * @param {string} ownerUserId - Owner UUID
 * @returns {Promise<{totalClients: number, activeClients: number, newClientsMonth: number}>}
 */
export async function getClientStats(ownerUserId) {
  // Total clients
  const { count: totalClients, error: totalError } = await client()
    .from('crm_clients')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId);

  if (totalError) throw totalError;

  // Active clients (updated in last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  const { count: activeClients, error: activeError } = await client()
    .from('crm_clients')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId)
    .gte('updated_at', ninetyDaysAgo);

  if (activeError) throw activeError;

  // New clients this month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count: newClientsMonth, error: newError } = await client()
    .from('crm_clients')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId)
    .gte('created_at', monthStart.toISOString());

  if (newError) throw newError;

  return {
    totalClients: totalClients || 0,
    activeClients: activeClients || 0,
    newClientsMonth: newClientsMonth || 0,
  };
}

/**
 * Get project metrics
 * @param {string} ownerUserId - Owner UUID
 * @returns {Promise<{totalProjects: number, activeProjects: number}>}
 */
export async function getProjectStats(ownerUserId) {
  // Total projects
  const { count: totalProjects, error: totalError } = await client()
    .from('crm_projects')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId);

  if (totalError) throw totalError;

  return {
    totalProjects: totalProjects || 0,
  };
}

/**
 * Get task metrics
 * @param {string} ownerUserId - Owner UUID
 * @returns {Promise<{totalTasks: number, completedTasks: number, completionRate: number}>}
 */
export async function getTaskStats(ownerUserId) {
  // Total tasks
  const { count: totalTasks, error: totalError } = await client()
    .from('crm_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId);

  if (totalError) throw totalError;

  // Completed tasks
  const { count: completedTasks, error: completedError } = await client()
    .from('crm_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId)
    .eq('completed', true);

  if (completedError) throw completedError;

  const completionRate = (totalTasks || 0) > 0
    ? (((completedTasks || 0) / totalTasks) * 100).toFixed(1)
    : 0;

  return {
    totalTasks: totalTasks || 0,
    completedTasks: completedTasks || 0,
    completionRate: parseFloat(completionRate),
  };
}

/**
 * Get CRM lead metrics
 * @param {string} ownerUserId - Owner UUID
 * @returns {Promise<{totalLeads: number}>}
 */
export async function getLeadStats(ownerUserId) {
  const { count: totalLeads, error } = await client()
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId);

  if (error) throw error;

  return {
    totalLeads: totalLeads || 0,
  };
}

/**
 * Get communication metrics (last 24 hours)
 * @param {string} ownerUserId - Owner UUID
 * @returns {Promise<{messagesSent: number, threadsCreated: number}>}
 */
export async function getCommunicationStats(ownerUserId) {
  const last24h = new Date(Date.now() - 86400000).toISOString();

  // Messages sent in last 24h
  const { count: messagesSent, error: msgError } = await client()
    .from('communication_messages')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId)
    .gte('created_at', last24h);

  if (msgError) throw msgError;

  // Threads created in last 24h
  const { count: threadsCreated, error: threadError } = await client()
    .from('communication_threads')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId)
    .gte('created_at', last24h);

  if (threadError) throw threadError;

  return {
    messagesSent: messagesSent || 0,
    threadsCreated: threadsCreated || 0,
  };
}

/**
 * Get automation metrics (last 24 hours)
 * @param {string} ownerUserId - Owner UUID
 * @returns {Promise<{runsCompleted: number, runsFailed: number}>}
 */
export async function getAutomationStats(ownerUserId) {
  const last24h = new Date(Date.now() - 86400000).toISOString();

  // Completed runs in last 24h
  const { count: runsCompleted, error: completedError } = await client()
    .from('automation_runs')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId)
    .eq('state', 'COMPLETED')
    .gte('completed_at', last24h);

  if (completedError) throw completedError;

  // Failed runs in last 24h
  const { count: runsFailed, error: failedError } = await client()
    .from('automation_runs')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId)
    .eq('state', 'FAILED')
    .gte('completed_at', last24h);

  if (failedError) throw failedError;

  return {
    runsCompleted: runsCompleted || 0,
    runsFailed: runsFailed || 0,
  };
}

/**
 * List owners eligible for analytics (mirrors the authorization predicate in
 * analytics.service.js `scope()`, but for all owners rather than one).
 * Used by the daily-snapshot job to know which accounts to aggregate.
 * @returns {Promise<Array<{id: string}>>}
 */
export async function listAnalyticsEligibleOwners() {
  const { data: owners, error } = await client()
    .from('users')
    .select('id')
    .eq('role', 'client')
    .eq('status', 'active');

  if (error) throw error;
  if (!owners || owners.length === 0) return [];

  const { data: memberships, error: membershipError } = await client()
    .from('client_portal_memberships')
    .select('user_id');

  if (membershipError) throw membershipError;

  const memberIds = new Set((memberships || []).map((m) => m.user_id));
  return owners.filter((owner) => !memberIds.has(owner.id));
}

/**
 * Compute one owner's activity for a single UTC calendar day and upsert it
 * into analytics_daily_metrics. This is the data source for GET /daily.
 *
 * Two columns (crm_leads_qualified, crm_leads_converted) have no
 * corresponding concept in the current schema (crm_leads has no
 * qualification/conversion status) and are intentionally left at their
 * column default of 0 rather than approximated from unrelated data.
 *
 * @param {string} ownerUserId - Owner UUID
 * @param {string} dateStr - UTC calendar date, YYYY-MM-DD
 * @returns {Promise<object>} The upserted row
 */
export async function computeAndStoreDailySnapshot(ownerUserId, dateStr) {
  const dayStart = `${dateStr}T00:00:00.000Z`;
  const dayEnd = `${dateStr}T23:59:59.999Z`;
  const db = client();

  const countBetween = async (table, column, extraFilters = (q) => q) => {
    let query = db.from(table).select('id', { count: 'exact', head: true }).eq('owner_user_id', ownerUserId)
      .gte(column, dayStart).lte(column, dayEnd);
    query = extraFilters(query);
    const { count: value, error } = await query;
    if (error) throw error;
    return value || 0;
  };

  const [
    crmLeadsCreated,
    paidInvoicesInDay,
    financeInvoicesIssued,
    paymentsInDay,
    financeExpensesSubmitted,
    communicationThreadsCreated,
    communicationMessagesSent,
    communicationDeliveryFailed,
    automationRunsCompleted,
    automationRunsFailed,
    automationWorkItemsCompleted,
  ] = await Promise.all([
    countBetween('crm_leads', 'created_at'),
    db.from('finance_invoices').select('total_amount_minor').eq('owner_user_id', ownerUserId).eq('status', 'paid').gte('issued_at', dayStart).lte('issued_at', dayEnd),
    countBetween('finance_invoices', 'issued_at'),
    db.from('finance_payments').select('amount_minor').eq('owner_user_id', ownerUserId).gte('received_at', dayStart).lte('received_at', dayEnd),
    countBetween('finance_expenses', 'created_at'),
    countBetween('communication_threads', 'created_at'),
    countBetween('communication_messages', 'created_at'),
    countBetween('communication_deliveries', 'updated_at', (q) => q.in('status', ['failed_retryable', 'failed_permanent'])),
    countBetween('automation_runs', 'completed_at', (q) => q.eq('state', 'COMPLETED')),
    countBetween('automation_runs', 'completed_at', (q) => q.eq('state', 'FAILED')),
    countBetween('automation_work_items', 'completed_at', (q) => q.eq('state', 'COMPLETED')),
  ]);

  if (paidInvoicesInDay.error) throw paidInvoicesInDay.error;
  if (paymentsInDay.error) throw paymentsInDay.error;

  const financeRevenueMinor = (paidInvoicesInDay.data || []).reduce((sum, inv) => sum + (inv.total_amount_minor || 0), 0);
  const financePaymentsReceivedMinor = (paymentsInDay.data || []).reduce((sum, p) => sum + (p.amount_minor || 0), 0);

  const row = {
    owner_user_id: ownerUserId,
    metric_date: dateStr,
    crm_leads_created: crmLeadsCreated,
    crm_leads_qualified: 0,
    crm_leads_converted: 0,
    finance_revenue_minor: financeRevenueMinor,
    finance_invoices_issued: financeInvoicesIssued,
    finance_payments_received_minor: financePaymentsReceivedMinor,
    finance_expenses_submitted: financeExpensesSubmitted,
    communication_threads_created: communicationThreadsCreated,
    communication_messages_sent: communicationMessagesSent,
    communication_delivery_failed: communicationDeliveryFailed,
    automation_runs_completed: automationRunsCompleted,
    automation_runs_failed: automationRunsFailed,
    automation_work_items_completed: automationWorkItemsCompleted,
  };

  const { data, error } = await db
    .from('analytics_daily_metrics')
    .upsert(row, { onConflict: 'owner_user_id,metric_date' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get finance expense metrics
 * @param {string} ownerUserId - Owner UUID
 * @returns {Promise<{totalExpenses: number, approvedExpenses: number, totalExpensesMinor: number}>}
 */
export async function getExpenseStats(ownerUserId) {
  // Total expenses count
  const { count: totalExpenses, error: totalError } = await client()
    .from('finance_expenses')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId);

  if (totalError) throw totalError;

  // Approved expenses count
  const { count: approvedExpenses, error: approvedError } = await client()
    .from('finance_expenses')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'approved');

  if (approvedError) throw approvedError;

  // Total amount (cents/paise) - use database-side SUM aggregation via RPC
  const { data: sumResult, error: sumError } = await client()
    .rpc('get_expenses_by_owner', { 
      p_owner_user_id: ownerUserId,
      p_status: 'approved'
    });

  if (sumError) throw new Error(`getExpenseStats total: ${sumError.message}`);

  const totalExpensesMinor = (sumResult || [])[0]?.total_amount_minor || 0;

  return {
    totalExpenses: totalExpenses || 0,
    approvedExpenses: approvedExpenses || 0,
    totalExpensesMinor,
  };
}
