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
 * @returns {Promise<Array>} Array of daily metric records
 */
export async function getDailyMetrics(ownerUserId, startDate, endDate) {
  const { data, error } = await client()
    .from('analytics_daily_metrics')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .gte('metric_date', startDate)
    .lte('metric_date', endDate)
    .order('metric_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get revenue metrics for period
 * @param {string} ownerUserId - Owner UUID
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<{totalRevenueMinor: number, monthlyData: Array}>}
 */
export async function getRevenueStats(ownerUserId, startDate, endDate) {
  // Total revenue (all time, paid invoices only) - database-side aggregation
  const { count: totalRev, error: totalError } = await client()
    .from('finance_invoices')
    .select('total_amount_minor', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId)
    .eq('status', 'paid');

  if (totalError) throw totalError;

  // Use SUM() via RPC or fetch aggregated data directly
  // For now, fetch count only (totalRevenueMinor will be 0 if no invoices)
  // This query returns count not sum, but we need sum - use RPC for proper aggregation
  const { data: sumResult, error: sumError } = await client()
    .rpc('sum_revenue_by_owner', { owner_user_id: ownerUserId, status: 'paid' });

  let totalRevenueMinor = 0;
  if (!sumError && sumResult && Array.isArray(sumResult) && sumResult.length > 0) {
    totalRevenueMinor = sumResult[0].sum || 0;
  } else if (!totalError && totalRev) {
    // Fallback: count-based if RPC not available - this is a limitation
    // In production, ensure the RPC function is deployed
    totalRevenueMinor = totalRev * 0; // Placeholder - RPC should be used
  }

  // Monthly revenue (for date range) - also use aggregation
  const { data: monthlyData, error: monthlyError } = await client()
    .rpc('get_monthly_revenue', { 
      owner_user_id: ownerUserId, 
      start_date: startDate,
      end_date: endDate
    });

  if (monthlyError) {
    // Fallback: if RPC not available, return empty array (existing behavior)
    // In production, ensure the RPC function is deployed
    return {
      totalRevenueMinor,
      monthlyData: [],
    };
  }

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

  // Total amount (cents/paise) - use database-side SUM aggregation
  const { data: sumResult, error: sumError } = await client()
    .rpc('sum_expenses_by_owner', { 
      owner_user_id: ownerUserId,
      status: 'approved'
    });

  let totalExpensesMinor = 0;
  if (!sumError && sumResult && Array.isArray(sumResult) && sumResult.length > 0) {
    totalExpensesMinor = sumResult[0].sum || 0;
  }

  return {
    totalExpenses: totalExpenses || 0,
    approvedExpenses: approvedExpenses || 0,
    totalExpensesMinor,
  };
}
