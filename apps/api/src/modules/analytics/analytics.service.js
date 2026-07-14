// Analytics Service
// Computes dashboard metrics, funnels, channel breakdowns, and report data.
// Works with both Supabase and in-memory store.

import {
  getDb,
  listActiveClients,
  getProspectsByStage,
  _memory as mem,
} from '../../database/db.js';

/**
 * Get the full dashboard overview for a client (or all clients).
 */
export async function getDashboard(clientId) {
  const { usingMemory } = getDb();

  if (usingMemory) {
    return buildMemoryDashboard(clientId);
  }

  return buildSupabaseDashboard(clientId);
}

function buildMemoryDashboard(clientId) {
  const prospects = clientId
    ? mem.prospects.filter((p) => p.client_id === clientId)
    : mem.prospects;
  const messages = mem.messages;
  const events = mem.events;

  const today = new Date().toISOString().slice(0, 10);
  const todayMessages = messages.filter((m) => m.created_at?.startsWith(today));
  const todayEvents = events.filter((e) => e.created_at?.startsWith(today));

  return {
    overview: {
      totalProspects: prospects.length,
      qualified: prospects.filter((p) => p.qualified).length,
      contacted: prospects.filter((p) => p.stage === 'contacted').length,
      replied: prospects.filter((p) => p.stage === 'replied').length,
      booked: prospects.filter((p) => p.stage === 'booked').length,
      disqualified: prospects.filter((p) => p.stage === 'disqualified').length,
    },
    today: {
      emailsSent: todayMessages.filter((m) => ['sent', 'dry_run'].includes(m.status)).length,
      replies: todayEvents.filter((e) => e.type === 'reply').length,
      replyRate: todayMessages.length > 0
        ? ((todayEvents.filter((e) => e.type === 'reply').length / todayMessages.length) * 100).toFixed(1)
        : '0.0',
      meetingsBooked: prospects.filter(
        (p) => p.stage === 'booked' && p.updated_at?.startsWith(today)
      ).length,
    },
    channels: {
      email: {
        sent: messages.filter((m) => m.channel === 'email' || !m.channel).length,
        replies: events.filter((e) => e.type === 'reply').length,
      },
      linkedin: {
        actions: 0, // Will be populated when LinkedIn data exists
        connections: 0,
      },
    },
    recentActivity: buildRecentActivity(prospects, messages, events),
  };
}

async function buildSupabaseDashboard(clientId) {
  const { client: db } = getDb();

  // Parallel queries for speed
  const [prospectStats, todayMessages, todayReplies, recentProspects] = await Promise.all([
    getProspectStats(db, clientId),
    getTodayMessages(db, clientId),
    getTodayReplies(db, clientId),
    getRecentProspects(db, clientId),
  ]);

  return {
    overview: prospectStats,
    today: {
      emailsSent: todayMessages,
      replies: todayReplies,
      replyRate: todayMessages > 0 ? ((todayReplies / todayMessages) * 100).toFixed(1) : '0.0',
      meetingsBooked: 0, // TODO: query from events
    },
    channels: { email: { sent: todayMessages, replies: todayReplies }, linkedin: { actions: 0, connections: 0 } },
    recentActivity: recentProspects,
  };
}

async function getProspectStats(db, clientId) {
  let query = db.from('prospects').select('stage', { count: 'exact', head: false });
  if (clientId) query = query.eq('client_id', clientId);
  const { data } = await query;

  const stages = { new: 0, queued: 0, contacted: 0, replied: 0, booked: 0, disqualified: 0, unsubscribed: 0 };
  for (const row of data || []) {
    stages[row.stage] = (stages[row.stage] || 0) + 1;
  }
  return { totalProspects: (data || []).length, ...stages };
}

async function getTodayMessages(db, clientId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  let query = db.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', startOfDay.toISOString()).in('status', ['sent', 'dry_run']);
  if (clientId) query = query.eq('client_id', clientId);
  const { count } = await query;
  return count || 0;
}

async function getTodayReplies(db, clientId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count } = await db.from('events').select('id', { count: 'exact', head: true }).eq('type', 'reply').gte('created_at', startOfDay.toISOString());
  return count || 0;
}

async function getRecentProspects(db, clientId) {
  let query = db.from('prospects').select('id, full_name, company, title, stage, icp_score, updated_at').order('updated_at', { ascending: false }).limit(10);
  if (clientId) query = query.eq('client_id', clientId);
  const { data } = await query;
  return data || [];
}

/**
 * Get daily metrics for a date range.
 */
export async function getDailyMetrics(clientId, startDate, endDate) {
  const { usingMemory } = getDb();

  if (usingMemory) {
    return buildMemoryDailyMetrics(clientId, startDate, endDate);
  }

  // Supabase implementation would aggregate by date
  return buildMemoryDailyMetrics(clientId, startDate, endDate);
}

function buildMemoryDailyMetrics(clientId, startDate, endDate) {
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 86400000);
  const end = endDate ? new Date(endDate) : new Date();

  const days = [];
  const current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    const dayMessages = mem.messages.filter((m) => m.created_at?.startsWith(dateStr));
    const dayEvents = mem.events.filter((e) => e.created_at?.startsWith(dateStr));

    days.push({
      date: dateStr,
      emailsSent: dayMessages.filter((m) => ['sent', 'dry_run'].includes(m.status)).length,
      replies: dayEvents.filter((e) => e.type === 'reply').length,
      opens: dayEvents.filter((e) => e.type === 'open').length,
      clicks: dayEvents.filter((e) => e.type === 'click').length,
      meetings: dayEvents.filter((e) => e.meta?.intent === 'booked').length,
    });

    current.setDate(current.getDate() + 1);
  }

  return { period: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }, days };
}

/**
 * Get funnel conversion metrics.
 */
export async function getFunnelMetrics(clientId) {
  const { usingMemory } = getDb();

  const prospects = usingMemory
    ? (clientId ? mem.prospects.filter((p) => p.client_id === clientId) : mem.prospects)
    : [];

  const total = prospects.length || 1;
  const stages = {
    sourced: total,
    qualified: prospects.filter((p) => p.qualified).length,
    contacted: prospects.filter((p) => ['contacted', 'replied', 'booked'].includes(p.stage)).length,
    replied: prospects.filter((p) => ['replied', 'booked'].includes(p.stage)).length,
    booked: prospects.filter((p) => p.stage === 'booked').length,
  };

  return {
    funnel: [
      { stage: 'Sourced', count: stages.sourced, rate: '100%' },
      { stage: 'Qualified', count: stages.qualified, rate: `${((stages.qualified / total) * 100).toFixed(1)}%` },
      { stage: 'Contacted', count: stages.contacted, rate: `${((stages.contacted / total) * 100).toFixed(1)}%` },
      { stage: 'Replied', count: stages.replied, rate: `${((stages.replied / total) * 100).toFixed(1)}%` },
      { stage: 'Booked', count: stages.booked, rate: `${((stages.booked / total) * 100).toFixed(1)}%` },
    ],
  };
}

/**
 * Get channel comparison (email vs LinkedIn).
 */
export async function getChannelBreakdown(clientId) {
  return {
    email: {
      sent: mem.messages.filter((m) => m.channel === 'email' || !m.channel).length,
      delivered: mem.messages.filter((m) => m.status === 'sent').length,
      opens: mem.events.filter((e) => e.type === 'open').length,
      replies: mem.events.filter((e) => e.type === 'reply').length,
    },
    linkedin: {
      profileViews: 0,
      connectionsSent: 0,
      connectionsAccepted: 0,
      messagesSent: 0,
      replies: 0,
    },
  };
}

// Build recent activity feed
function buildRecentActivity(prospects, messages, events) {
  const activity = [];

  // Recent stage changes
  for (const p of prospects.slice(-5)) {
    activity.push({
      type: 'prospect',
      description: `${p.full_name} (${p.company}) → ${p.stage}`,
      timestamp: p.updated_at || p.created_at,
    });
  }

  // Recent messages
  for (const m of messages.slice(-5)) {
    activity.push({
      type: 'message',
      description: `Email ${m.status} to prospect ${m.prospect_id}`,
      timestamp: m.created_at,
    });
  }

  return activity
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);
}
