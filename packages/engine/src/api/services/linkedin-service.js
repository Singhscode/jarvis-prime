// LinkedIn Service
// Business logic for LinkedIn outreach operations via HTTP API.

import { config } from '../../config.js';
import {
  visitProfile,
  sendConnectionRequest,
  sendDirectMessage,
  generateConnectionNote,
  generateFollowUpDM,
  getDailyStats,
} from '../../agents/linkedin-agent.js';

/**
 * Execute a LinkedIn action for a prospect.
 */
export async function executeAction(action, prospect, client, options = {}) {
  switch (action) {
    case 'visit':
      return visitProfile(prospect);

    case 'connect': {
      const note = options.note || generateConnectionNote(prospect, client || {});
      return sendConnectionRequest(prospect, note);
    }

    case 'message': {
      const message = options.message || generateFollowUpDM(prospect, client || {});
      return sendDirectMessage(prospect, message);
    }

    default:
      throw new Error(`Unknown LinkedIn action: ${action}`);
  }
}

/**
 * Get LinkedIn daily usage limits and current counts.
 */
export function getStatus() {
  return {
    configured: Boolean(config.linkedinCookie),
    dryRun: config.dryRun,
    dailyStats: getDailyStats(),
    limits: {
      connectsPerDay: config.linkedinDailyConnects,
      dmsPerDay: config.linkedinDailyDMs,
      viewsPerDay: config.linkedinDailyViews,
    },
  };
}

/**
 * Bulk LinkedIn outreach — visit + connect for a list of prospects.
 */
export async function bulkOutreach(prospects, client, options = {}) {
  const results = [];
  for (const prospect of prospects) {
    // Visit first, then connect
    const visitResult = await visitProfile(prospect);
    results.push({ prospect_id: prospect.id, action: 'visit', ...visitResult });

    if (visitResult.status !== 'limit_reached') {
      const note = generateConnectionNote(prospect, client || {});
      const connectResult = await sendConnectionRequest(prospect, note);
      results.push({ prospect_id: prospect.id, action: 'connect', ...connectResult });
    }

    if (visitResult.status === 'limit_reached') break;
  }
  return { total: prospects.length, results };
}
