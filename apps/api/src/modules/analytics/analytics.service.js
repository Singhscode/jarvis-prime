// Analytics Service
// Aggregates metrics across all modules. Enforces authorization, date ranges, and tenant isolation.

import * as repo from './analytics.repository.js';

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Derive analytics scope (Owner-only for MVP)
 * @param {string} userId - User ID from JWT
 * @returns {Promise<{ownerUserId: string, isOwner: boolean}>}
 * @throws AppError if access denied
 */
async function scope(userId) {
  // For MVP, only Owners can access analytics
  // Future: could check for analytics.read permission on employees
  
  // Import here to avoid circular dependency
  const { getDb } = await import('../../database/db.js');
  const { client: db } = getDb();

  try {
    // Check if user is Owner (role='client', active status, no client portal membership)
    const { data: [user], error: userError } = await db
      .from('users')
      .select('id, role, status')
      .eq('id', userId);

    if (userError || !user) {
      throw new AppError('Access denied.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    if (user.role !== 'client' || user.status !== 'active') {
      throw new AppError('Access denied.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    // Ensure user is NOT a client portal member (owners don't have memberships)
    const { count: memberCount } = await db
      .from('client_portal_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (memberCount && memberCount > 0) {
      throw new AppError('Access denied.', 403, 'INSUFFICIENT_PERMISSIONS');
    }

    return { ownerUserId: userId, isOwner: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Access denied.', 403, 'INSUFFICIENT_PERMISSIONS');
  }
}

/**
 * Parse date string to ISO date (YYYY-MM-DD)
 * @param {string} dateStr - Date string (ISO or partial)
 * @returns {string} ISO date string (YYYY-MM-DD)
 * @throws AppError if invalid
 */
function parseDate(dateStr) {
  if (!dateStr) throw new AppError('Date is required.', 400, 'VALIDATION_ERROR');

  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) throw new Error();
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
  } catch (error) {
    throw new AppError('Invalid date format.', 400, 'VALIDATION_ERROR');
  }
}

/**
 * Get analytics dashboard overview
 * @param {string} userId - User ID from JWT
 * @returns {Promise<{overview: Object, activity24h: Object}>}
 */
export async function getDashboard(userId) {
  const { ownerUserId } = await scope(userId);

  // Parallel queries for performance
  const [revenue, clients, projects, tasks, leads, comms, automation, expenses] = await Promise.all([
    repo.getRevenueStats(ownerUserId, new Date(Date.now() - 90 * 86400000).toISOString(), new Date().toISOString()),
    repo.getClientStats(ownerUserId),
    repo.getProjectStats(ownerUserId),
    repo.getTaskStats(ownerUserId),
    repo.getLeadStats(ownerUserId),
    repo.getCommunicationStats(ownerUserId),
    repo.getAutomationStats(ownerUserId),
    repo.getExpenseStats(ownerUserId),
  ]);

  return {
    overview: {
      revenue: {
        totalMinor: revenue.totalRevenueMinor,
        totalMajor: revenue.totalRevenueMinor / 100,
        currencyCode: 'INR',
      },
      clients: clients.totalClients,
      activeClients: clients.activeClients,
      newClientsThisMonth: clients.newClientsMonth,
      projects: projects.totalProjects,
      tasks: {
        total: tasks.totalTasks,
        completed: tasks.completedTasks,
        completionRate: tasks.completionRate,
      },
      leads: leads.totalLeads,
      expenses: {
        total: expenses.totalExpenses,
        approved: expenses.approvedExpenses,
        totalMinor: expenses.totalExpensesMinor,
        totalMajor: expenses.totalExpensesMinor / 100,
      },
    },
    activity24h: {
      messagesSent: comms.messagesSent,
      threadsCreated: comms.threadsCreated,
      automationRuns: {
        completed: automation.runsCompleted,
        failed: automation.runsFailed,
      },
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get revenue report for date range
 * @param {string} userId - User ID from JWT
 * @param {string} startDateStr - Start date (YYYY-MM-DD or ISO)
 * @param {string} endDateStr - End date (YYYY-MM-DD or ISO)
 * @returns {Promise<{period: Object, totalRevenueMinor: number, ...}>}
 */
export async function getRevenueReport(userId, startDateStr, endDateStr) {
  const { ownerUserId } = await scope(userId);

  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  if (startDate >= endDate) {
    throw new AppError('Start date must be before end date.', 400, 'VALIDATION_ERROR');
  }

  // Add 24h to end date to include entire day
  const endDateInclusive = new Date(endDate);
  endDateInclusive.setDate(endDateInclusive.getDate() + 1);

  const stats = await repo.getRevenueStats(
    ownerUserId,
    startDate,
    endDateInclusive.toISOString().split('T')[0]
  );

  const avgPerInvoice = stats.monthlyData.length > 0
    ? Math.round(stats.totalRevenueMinor / stats.monthlyData.length)
    : 0;

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    revenue: {
      totalMinor: stats.totalRevenueMinor,
      totalMajor: stats.totalRevenueMinor / 100,
      currencyCode: 'INR',
      averagePerInvoiceMinor: avgPerInvoice,
      averagePerInvoiceMajor: avgPerInvoice / 100,
    },
    invoiceCount: stats.monthlyData.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get daily metrics for date range
 * @param {string} userId - User ID from JWT
 * @param {string} startDateStr - Start date
 * @param {string} endDateStr - End date
 * @returns {Promise<{period: Object, metrics: Array}>}
 */
export async function getDailyMetrics(userId, startDateStr, endDateStr, limit = 100) {
  const { ownerUserId } = await scope(userId);

  const startDate = parseDate(startDateStr);
  const endDate = parseDate(endDateStr);

  if (startDate >= endDate) {
    throw new AppError('Start date must be before end date.', 400, 'VALIDATION_ERROR');
  }

  // Add 24h to end date to include entire day
  const endDateInclusive = new Date(endDate);
  endDateInclusive.setDate(endDateInclusive.getDate() + 1);

  const metrics = await repo.getDailyMetrics(ownerUserId, startDate, endDateInclusive.toISOString().split('T')[0], limit);

  // Format metrics for API response
  const formatted = metrics.map(m => ({
    date: m.metric_date,
    crm: {
      leadsCreated: m.crm_leads_created,
      leadsQualified: m.crm_leads_qualified,
      leadsConverted: m.crm_leads_converted,
    },
    finance: {
      revenueMinor: m.finance_revenue_minor,
      revenueMajor: m.finance_revenue_minor / 100,
      invoicesIssued: m.finance_invoices_issued,
      paymentsReceivedMinor: m.finance_payments_received_minor,
      paymentsReceivedMajor: m.finance_payments_received_minor / 100,
      expensesSubmitted: m.finance_expenses_submitted,
    },
    communication: {
      threadsCreated: m.communication_threads_created,
      messagesSent: m.communication_messages_sent,
      deliveriesFailed: m.communication_delivery_failed,
    },
    automation: {
      runsCompleted: m.automation_runs_completed,
      runsFailed: m.automation_runs_failed,
      workItemsCompleted: m.automation_work_items_completed,
    },
  }));

  return {
    period: {
      start: startDate,
      end: endDate,
    },
    metrics: formatted,
    count: formatted.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get client metrics report
 * @param {string} userId - User ID from JWT
 * @returns {Promise<{total: number, active: number, newThisMonth: number}>}
 */
export async function getClientsReport(userId) {
  const { ownerUserId } = await scope(userId);
  const stats = await repo.getClientStats(ownerUserId);

  return {
    total: stats.totalClients,
    active: stats.activeClients,
    newThisMonth: stats.newClientsMonth,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get project metrics report
 * @param {string} userId - User ID from JWT
 * @returns {Promise<{total: number}>}
 */
export async function getProjectsReport(userId) {
  const { ownerUserId } = await scope(userId);
  const stats = await repo.getProjectStats(ownerUserId);

  return {
    total: stats.totalProjects,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get task metrics report
 * @param {string} userId - User ID from JWT
 * @returns {Promise<{total: number, completed: number, completionRate: number}>}
 */
export async function getTasksReport(userId) {
  const { ownerUserId } = await scope(userId);
  const stats = await repo.getTaskStats(ownerUserId);

  return {
    total: stats.totalTasks,
    completed: stats.completedTasks,
    completionRate: stats.completionRate,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get leads report
 * @param {string} userId - User ID from JWT
 * @returns {Promise<{total: number}>}
 */
export async function getLeadsReport(userId) {
  const { ownerUserId } = await scope(userId);
  const stats = await repo.getLeadStats(ownerUserId);

  return {
    total: stats.totalLeads,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get communication metrics report
 * @param {string} userId - User ID from JWT
 * @returns {Promise<{messagesSent24h: number, threadsCreated24h: number}>}
 */
export async function getCommunicationReport(userId) {
  const { ownerUserId } = await scope(userId);
  const stats = await repo.getCommunicationStats(ownerUserId);

  return {
    messagesSent24h: stats.messagesSent,
    threadsCreated24h: stats.threadsCreated,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get automation metrics report
 * @param {string} userId - User ID from JWT
 * @returns {Promise<{runsCompleted24h: number, runsFailed24h: number}>}
 */
export async function getAutomationReport(userId) {
  const { ownerUserId } = await scope(userId);
  const stats = await repo.getAutomationStats(ownerUserId);

  return {
    runsCompleted24h: stats.runsCompleted,
    runsFailed24h: stats.runsFailed,
    successRate: stats.runsCompleted + stats.runsFailed > 0
      ? ((stats.runsCompleted / (stats.runsCompleted + stats.runsFailed)) * 100).toFixed(1)
      : null,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Compute and persist yesterday's (UTC) daily snapshot for every analytics-
 * eligible owner. Intended to be run once per day by the scheduler
 * (see jobs/scheduler.js — job id 'analytics-daily-snapshot').
 *
 * This is the data source for GET /analytics/daily: without this job (or an
 * equivalent one-time backfill), analytics_daily_metrics stays empty and
 * that endpoint always returns an empty list.
 *
 * @param {string} [dateStr] - UTC calendar date YYYY-MM-DD. Defaults to yesterday.
 * @returns {Promise<{ownersProcessed: number, ownersFailed: number, date: string}>}
 */
export async function runDailySnapshotForAllOwners(dateStr) {
  const targetDate = dateStr || new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const owners = await repo.listAnalyticsEligibleOwners();

  let ownersProcessed = 0;
  let ownersFailed = 0;

  for (const owner of owners) {
    try {
      await repo.computeAndStoreDailySnapshot(owner.id, targetDate);
      ownersProcessed += 1;
    } catch {
      // One owner's failure must not block the rest of the batch.
      ownersFailed += 1;
    }
  }

  return { date: targetDate, ownersProcessed, ownersFailed };
}

/**
 * Get expense metrics report
 * @param {string} userId - User ID from JWT
 * @returns {Promise<{total: number, approved: number, totalMinor: number, totalMajor: number}>}
 */
export async function getExpensesReport(userId) {
  const { ownerUserId } = await scope(userId);
  const stats = await repo.getExpenseStats(ownerUserId);

  return {
    total: stats.totalExpenses,
    approved: stats.approvedExpenses,
    totalMinor: stats.totalExpensesMinor,
    totalMajor: stats.totalExpensesMinor / 100,
    currencyCode: 'INR',
    generatedAt: new Date().toISOString(),
  };
}
