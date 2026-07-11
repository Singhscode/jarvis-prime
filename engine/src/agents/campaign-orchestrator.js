// Multi-channel campaign orchestrator.
// Coordinates email + LinkedIn in unified sequences with timing logic,
// A/B test variant selection, and per-channel daily limits.
//
// Default sequence:
//   Day 0:  Email #1 + LinkedIn profile visit
//   Day 2:  LinkedIn connection request (with personalized note)
//   Day 4:  Email #2 (follow-up)
//   Day 7:  LinkedIn DM (if connected) OR Email #3
//   Day 10: Final break-up email

import { config } from '../config.js';
import { log } from 'jarvis-logger';
import { writeEmail } from '../ai/personalizer.js';
import { sendEmail } from '../email/sender.js';
import {
  visitProfile,
  sendConnectionRequest,
  sendDirectMessage,
  generateConnectionNote,
  generateFollowUpDM,
} from './linkedin-agent.js';
import {
  updateProspect,
  insertMessage,
  insertEvent,
  insertLinkedInAction,
  isSuppressed,
} from '../lib/db.js';
import { getVariantContent, recordResult } from '../lib/ab-testing.js';
import { alertEvent } from '../lib/notifications.js';

// Default multi-channel sequence definition
const DEFAULT_SEQUENCE = [
  { step: 1, day: 0, channels: ['email', 'linkedin_visit'] },
  { step: 2, day: 2, channels: ['linkedin_connect'] },
  { step: 3, day: 4, channels: ['email'] },
  { step: 4, day: 7, channels: ['linkedin_dm', 'email'] }, // DM preferred, email fallback
  { step: 5, day: 10, channels: ['email'] }, // break-up email
];

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Execute the next step in a multi-channel campaign for a prospect.
 * @param {object} prospect  The prospect record
 * @param {object} client    The client this prospect belongs to
 * @param {object} [campaign]  Optional campaign override
 * @returns {object} { executed: boolean, actions: [] }
 */
export async function executeNextStep(prospect, client, campaign = null) {
  // Check suppression
  if (await isSuppressed(prospect.email)) {
    await updateProspect(prospect.id, { stage: 'unsubscribed', next_action_at: null });
    log.warn(`Skipping suppressed contact: ${prospect.email}`);
    return { executed: false, reason: 'suppressed' };
  }

  const currentStep = (prospect.step || 0) + 1;
  const sequence = campaign?.steps || DEFAULT_SEQUENCE;
  const stepDef = sequence.find((s) => s.step === currentStep);

  if (!stepDef) {
    // Sequence complete
    await updateProspect(prospect.id, { next_action_at: null });
    return { executed: false, reason: 'sequence_complete' };
  }

  const actions = [];

  for (const channel of stepDef.channels) {
    try {
      switch (channel) {
        case 'email': {
          const result = await executeEmail(prospect, client, currentStep, campaign);
          actions.push({ channel: 'email', ...result });
          break;
        }
        case 'linkedin_visit': {
          const result = await executeLinkedInVisit(prospect, client);
          actions.push({ channel: 'linkedin_visit', ...result });
          break;
        }
        case 'linkedin_connect': {
          const result = await executeLinkedInConnect(prospect, client);
          actions.push({ channel: 'linkedin_connect', ...result });
          break;
        }
        case 'linkedin_dm': {
          const result = await executeLinkedInDM(prospect, client);
          actions.push({ channel: 'linkedin_dm', ...result });
          // If DM failed (not connected), this step's email fallback will run next
          if (result.status === 'failed' || result.status === 'skipped') continue;
          break;
        }
      }
    } catch (err) {
      log.error(`Step ${currentStep} ${channel} failed for ${prospect.email}: ${err.message}`);
      actions.push({ channel, status: 'failed', error: err.message });
    }
  }

  // Check if any action succeeded
  const anySuccess = actions.some((a) => ['sent', 'dry_run'].includes(a.status));

  if (anySuccess) {
    // Calculate next action time
    const nextStepDef = sequence.find((s) => s.step === currentStep + 1);
    const daysUntilNext = nextStepDef ? nextStepDef.day - stepDef.day : 0;

    await updateProspect(prospect.id, {
      stage: 'contacted',
      step: currentStep,
      next_action_at: nextStepDef ? daysFromNow(daysUntilNext) : null,
    });

    // Alert on hot prospects
    if (prospect.hot) {
      await alertEvent('hot_lead', {
        name: prospect.full_name,
        title: prospect.title,
        company: prospect.company,
        score: prospect.icp_score,
        client: client?.name,
      });
    }
  }

  return { executed: anySuccess, step: currentStep, actions };
}

// ---- Channel execution functions ----

async function executeEmail(prospect, client, step, campaign) {
  // Check for A/B test variant
  let emailContent;
  if (campaign?.ab_test_id) {
    const variant = getVariantContent(prospect.id, campaign.ab_test_id);
    if (variant?.content) {
      emailContent = variant.content;
      recordResult(campaign.ab_test_id, variant.variant, 'sent');
    }
  }

  if (!emailContent) {
    emailContent = await writeEmail(step, prospect, client);
  }

  const result = await sendEmail({
    to: prospect.email,
    subject: emailContent.subject,
    body: emailContent.body,
  });

  await insertMessage({
    prospect_id: prospect.id,
    client_id: client.id,
    channel: 'email',
    step,
    subject: emailContent.subject,
    body: result.finalBody,
    status: result.status,
    provider_id: result.providerId || null,
    error: result.error || null,
    sent_at: result.status === 'failed' ? null : new Date().toISOString(),
  });

  if (result.status !== 'failed') {
    await insertEvent({ prospect_id: prospect.id, type: 'sent', meta: { step, channel: 'email' } });
  }

  return { status: result.status, subject: emailContent.subject };
}

async function executeLinkedInVisit(prospect, client) {
  const result = await visitProfile(prospect);
  await insertLinkedInAction({
    prospect_id: prospect.id,
    action_type: 'profile_visit',
    status: result.status,
  });
  return result;
}

async function executeLinkedInConnect(prospect, client) {
  const note = generateConnectionNote(prospect, client);
  const result = await sendConnectionRequest(prospect, note);
  await insertLinkedInAction({
    prospect_id: prospect.id,
    action_type: 'connection_request',
    status: result.status,
    message: note,
  });
  return result;
}

async function executeLinkedInDM(prospect, client) {
  if (!prospect.linkedin_url) {
    return { status: 'skipped', reason: 'no_linkedin_url' };
  }
  const message = generateFollowUpDM(prospect, client);
  const result = await sendDirectMessage(prospect, message);
  await insertLinkedInAction({
    prospect_id: prospect.id,
    action_type: 'direct_message',
    status: result.status,
    message,
  });
  return result;
}

/**
 * Run multi-channel outreach for all due prospects of a client.
 * Replaces the email-only runOutreach when multi-channel is enabled.
 */
export async function runMultiChannelOutreach(client, campaign = null) {
  const { getDueProspects, getProspectsByStage, countMessagesSentToday } = await import('../lib/db.js');

  const alreadySent = await countMessagesSentToday();
  let budget = Math.max(config.dailySendLimit - alreadySent, 0);

  if (budget === 0) {
    log.warn(`Daily send cap (${config.dailySendLimit}) reached.`);
    return { sent: 0 };
  }

  const queued = await getProspectsByStage('queued', budget);
  const due = await getDueProspects(budget);
  const seen = new Set();
  const pipeline = [...queued, ...due].filter((p) => {
    if (seen.has(p.id) || p.client_id !== client.id) return false;
    seen.add(p.id);
    return true;
  });

  let completed = 0;
  const results = [];

  for (const prospect of pipeline) {
    if (budget <= 0) break;
    const result = await executeNextStep(prospect, client, campaign);
    if (result.executed) {
      completed++;
      budget--;
    }
    results.push({ prospect_id: prospect.id, ...result });
  }

  log.ok(
    `Multi-channel outreach for "${client.name}": ${completed}/${pipeline.length} prospects processed ` +
      `${config.dryRun ? '(dry-run)' : '(live)'}`
  );

  return { sent: completed, total: pipeline.length, results };
}
