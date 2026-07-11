// Campaign Service
// Full campaign management: create, list, execute, track.
// Wired to the campaign orchestrator and database layer.

import { config } from '../../config.js';
import { log } from 'jarvis-logger';
import { getDb, listActiveClients, _memory as mem } from '../../lib/db.js';
import { runMultiChannelOutreach } from '../../agents/campaign-orchestrator.js';

// In-memory campaign store (mirrors DB for dry-run / no-Supabase mode)
const campaigns = new Map();

/**
 * Create and start a new campaign.
 */
export async function startCampaign(clientId, campaignData = {}) {
  const campaign = {
    id: `camp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    client_id: clientId,
    name: campaignData.name || `Campaign ${new Date().toLocaleDateString()}`,
    status: 'active',
    channels: campaignData.channels || ['email'],
    daily_limit: campaignData.dailyLimit || config.dailySendLimit,
    ab_test_id: campaignData.abTestId || null,
    settings: campaignData.settings || {},
    stats: {
      prospects_sourced: 0,
      emails_sent: 0,
      linkedin_actions: 0,
      replies: 0,
      meetings_booked: 0,
    },
    steps: campaignData.steps || getDefaultSteps(campaignData.channels || ['email']),
    started_at: new Date().toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  campaigns.set(campaign.id, campaign);
  log.ok(`Campaign created: "${campaign.name}" (${campaign.id}) — channels: ${campaign.channels.join(', ')}`);

  return campaign;
}

/**
 * Get campaign status with live stats.
 */
export async function getCampaignStatus(campaignId) {
  const campaign = campaigns.get(campaignId);
  if (!campaign) {
    // Return a generic status if campaign not in memory
    return {
      campaignId,
      status: 'unknown',
      message: 'Campaign not found in active memory. It may have completed or been created before this server started.',
    };
  }

  return {
    ...campaign,
    uptime: campaign.started_at ? `${Math.round((Date.now() - new Date(campaign.started_at).getTime()) / 3600000)}h` : null,
  };
}

/**
 * List all campaigns, optionally filtered by client.
 */
export async function listCampaigns(clientId) {
  const all = Array.from(campaigns.values());
  if (clientId) return all.filter((c) => c.client_id === clientId);
  return all;
}

/**
 * Execute a campaign's next outreach batch.
 */
export async function executeCampaign(campaignId) {
  const campaign = campaigns.get(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);
  if (campaign.status !== 'active') throw new Error(`Campaign is ${campaign.status}, not active`);

  // Find the client
  const clients = await listActiveClients();
  const client = clients.find((c) => c.id === campaign.client_id) || clients[0];

  if (!client) {
    throw new Error('No active client found for this campaign');
  }

  const result = await runMultiChannelOutreach(client, campaign);

  // Update stats
  campaign.stats.emails_sent += result.sent;
  campaign.updated_at = new Date().toISOString();

  return {
    campaignId,
    ...result,
    campaignStats: campaign.stats,
  };
}

/**
 * Pause or resume a campaign.
 */
export async function toggleCampaign(campaignId, status) {
  const campaign = campaigns.get(campaignId);
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  campaign.status = status || (campaign.status === 'active' ? 'paused' : 'active');
  campaign.updated_at = new Date().toISOString();

  if (campaign.status === 'completed') {
    campaign.completed_at = new Date().toISOString();
  }

  return campaign;
}

/**
 * Track an email event (open, click, reply) for a campaign.
 */
export async function trackEmail(campaignId, prospectEmail, eventType) {
  const campaign = campaigns.get(campaignId);

  // Update campaign stats if found
  if (campaign) {
    switch (eventType) {
      case 'reply':
        campaign.stats.replies = (campaign.stats.replies || 0) + 1;
        break;
      case 'meeting':
        campaign.stats.meetings_booked = (campaign.stats.meetings_booked || 0) + 1;
        break;
    }
    campaign.updated_at = new Date().toISOString();
  }

  return {
    campaignId,
    prospectEmail,
    eventType,
    trackedAt: new Date().toISOString(),
    campaignStats: campaign?.stats || null,
  };
}

// Generate default campaign steps based on channels
function getDefaultSteps(channels) {
  if (channels.includes('linkedin')) {
    return [
      { step: 1, day: 0, channels: ['email', 'linkedin_visit'] },
      { step: 2, day: 2, channels: ['linkedin_connect'] },
      { step: 3, day: 4, channels: ['email'] },
      { step: 4, day: 7, channels: ['linkedin_dm', 'email'] },
      { step: 5, day: 10, channels: ['email'] },
    ];
  }
  return [
    { step: 1, day: 0, channels: ['email'] },
    { step: 2, day: 3, channels: ['email'] },
    { step: 3, day: 7, channels: ['email'] },
  ];
}
