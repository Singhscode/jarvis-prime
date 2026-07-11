// LinkedIn automation agent.
// Handles profile visits, connection requests with personalized notes,
// and direct messages to existing connections.
//
// IMPORTANT: LinkedIn's ToS restricts automation. This module uses
// API-simulation patterns. In dry-run mode (default), no LinkedIn
// requests are made — actions are logged for review.
//
// Rate limits are enforced to stay under LinkedIn's radar:
//   - Max 20 connection requests/day
//   - Max 50 profile views/day
//   - Max 30 DMs/day
//   - Random delays between actions (2-8 seconds)

import { config } from '../config.js';
import { log } from 'jarvis-logger';

// In-memory counters for daily limits (reset at midnight)
const dailyCounters = { views: 0, connects: 0, dms: 0, resetDate: todayStr() };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function checkReset() {
  if (dailyCounters.resetDate !== todayStr()) {
    dailyCounters.views = 0;
    dailyCounters.connects = 0;
    dailyCounters.dms = 0;
    dailyCounters.resetDate = todayStr();
  }
}

function randomDelay(min = 2000, max = 8000) {
  return new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
}

// ---- LinkedIn API simulation layer ----

const LINKEDIN_API = 'https://www.linkedin.com/voyager/api';

function linkedinHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-li-lang': 'en_US',
    'x-restli-protocol-version': '2.0.0',
    Cookie: `li_at=${config.linkedinCookie}`,
    'csrf-token': config.linkedinCsrf,
  };
}

function extractProfileId(linkedinUrl) {
  if (!linkedinUrl) return null;
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?]+)/);
  return match ? match[1] : null;
}

// ---- Public API ----

/**
 * Visit a prospect's LinkedIn profile.
 * This creates a notification on their end, warming them up before outreach.
 */
export async function visitProfile(prospect) {
  checkReset();

  if (dailyCounters.views >= config.linkedinDailyViews) {
    log.warn(`LinkedIn daily view limit reached (${config.linkedinDailyViews})`);
    return { status: 'limit_reached', action: 'profile_visit' };
  }

  const profileId = extractProfileId(prospect.linkedin_url);
  if (!profileId) {
    return { status: 'skipped', reason: 'no_linkedin_url' };
  }

  dailyCounters.views++;

  if (config.dryRun || !config.linkedinCookie) {
    log.dry(`[LinkedIn] Would visit profile: ${prospect.full_name} (${profileId})`);
    return { status: 'dry_run', action: 'profile_visit', profileId };
  }

  try {
    await randomDelay();
    const res = await fetch(`${LINKEDIN_API}/identity/profiles/${profileId}`, {
      method: 'GET',
      headers: linkedinHeaders(),
    });

    if (!res.ok) throw new Error(`LinkedIn profile visit failed: ${res.status}`);

    log.ok(`[LinkedIn] Visited profile: ${prospect.full_name}`);
    return { status: 'sent', action: 'profile_visit', profileId };
  } catch (err) {
    log.error(`[LinkedIn] Profile visit failed for ${prospect.full_name}: ${err.message}`);
    return { status: 'failed', action: 'profile_visit', error: err.message };
  }
}

/**
 * Send a connection request with a personalized note.
 */
export async function sendConnectionRequest(prospect, note) {
  checkReset();

  if (dailyCounters.connects >= config.linkedinDailyConnects) {
    log.warn(`LinkedIn daily connect limit reached (${config.linkedinDailyConnects})`);
    return { status: 'limit_reached', action: 'connection_request' };
  }

  const profileId = extractProfileId(prospect.linkedin_url);
  if (!profileId) {
    return { status: 'skipped', reason: 'no_linkedin_url' };
  }

  // Truncate note to LinkedIn's 300 char limit
  const truncatedNote = (note || '').slice(0, 300);
  dailyCounters.connects++;

  if (config.dryRun || !config.linkedinCookie) {
    log.dry(`[LinkedIn] Would send connection request to ${prospect.full_name}: "${truncatedNote.slice(0, 60)}..."`);
    return { status: 'dry_run', action: 'connection_request', profileId, note: truncatedNote };
  }

  try {
    await randomDelay(3000, 10000); // Longer delay for connection requests
    const res = await fetch(`${LINKEDIN_API}/growth/normInvitations`, {
      method: 'POST',
      headers: linkedinHeaders(),
      body: JSON.stringify({
        emberEntityName: 'growth/invitation/norm-invitation',
        invitee: {
          'com.linkedin.voyager.growth.invitation.InviteeProfile': {
            profileId,
          },
        },
        message: truncatedNote,
      }),
    });

    if (!res.ok) throw new Error(`LinkedIn connect failed: ${res.status}`);

    log.ok(`[LinkedIn] Connection request sent to ${prospect.full_name}`);
    return { status: 'sent', action: 'connection_request', profileId };
  } catch (err) {
    log.error(`[LinkedIn] Connection request failed for ${prospect.full_name}: ${err.message}`);
    return { status: 'failed', action: 'connection_request', error: err.message };
  }
}

/**
 * Send a direct message to an existing LinkedIn connection.
 */
export async function sendDirectMessage(prospect, message) {
  checkReset();

  if (dailyCounters.dms >= config.linkedinDailyDMs) {
    log.warn(`LinkedIn daily DM limit reached (${config.linkedinDailyDMs})`);
    return { status: 'limit_reached', action: 'direct_message' };
  }

  const profileId = extractProfileId(prospect.linkedin_url);
  if (!profileId) {
    return { status: 'skipped', reason: 'no_linkedin_url' };
  }

  dailyCounters.dms++;

  if (config.dryRun || !config.linkedinCookie) {
    log.dry(`[LinkedIn] Would DM ${prospect.full_name}: "${(message || '').slice(0, 60)}..."`);
    return { status: 'dry_run', action: 'direct_message', profileId, message };
  }

  try {
    await randomDelay(2000, 6000);
    const res = await fetch(`${LINKEDIN_API}/messaging/conversations`, {
      method: 'POST',
      headers: linkedinHeaders(),
      body: JSON.stringify({
        recipients: [profileId],
        body: message,
        subject: '',
      }),
    });

    if (!res.ok) throw new Error(`LinkedIn DM failed: ${res.status}`);

    log.ok(`[LinkedIn] DM sent to ${prospect.full_name}`);
    return { status: 'sent', action: 'direct_message', profileId };
  } catch (err) {
    log.error(`[LinkedIn] DM failed for ${prospect.full_name}: ${err.message}`);
    return { status: 'failed', action: 'direct_message', error: err.message };
  }
}

/**
 * Generate a personalized LinkedIn connection note using AI.
 */
export function generateConnectionNote(prospect, client) {
  const first = prospect.first_name || (prospect.full_name || 'there').split(' ')[0];
  const company = prospect.company || 'your company';
  const clientName = client?.name || 'our team';

  // Template-based for dry-run / no AI
  const templates = [
    `Hi ${first}, I noticed your work at ${company} — really impressive. I help ${client?.icp_industries?.[0] || 'B2B'} teams scale their pipeline. Would love to connect!`,
    `Hey ${first}! Came across ${company} and thought there could be a good synergy. I work with ${client?.icp_industries?.[0] || 'B2B'} companies on growth. Let's connect?`,
    `Hi ${first}, I'm building something for teams like ${company} to book more qualified meetings. Would be great to connect and share ideas!`,
  ];

  const idx = Math.abs(hashCode(prospect.email || prospect.full_name || '')) % templates.length;
  return templates[idx];
}

/**
 * Generate a LinkedIn DM for follow-up after connection is accepted.
 */
export function generateFollowUpDM(prospect, client) {
  const first = prospect.first_name || (prospect.full_name || 'there').split(' ')[0];
  return (
    `Thanks for connecting, ${first}! I work with ${client?.icp_industries?.[0] || 'B2B'} teams ` +
    `to automate their outbound and book qualified meetings without adding headcount.\n\n` +
    `Would a quick 15-min call make sense to see if there's a fit? No pressure either way.\n\n` +
    `Best,\n${config.fromName}`
  );
}

/**
 * Get current daily LinkedIn usage stats.
 */
export function getDailyStats() {
  checkReset();
  return {
    date: dailyCounters.resetDate,
    views: { used: dailyCounters.views, limit: config.linkedinDailyViews },
    connects: { used: dailyCounters.connects, limit: config.linkedinDailyConnects },
    dms: { used: dailyCounters.dms, limit: config.linkedinDailyDMs },
  };
}

// Simple hash for deterministic template selection
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}
