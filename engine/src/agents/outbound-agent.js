// Outbound agent — the core delivery loop for a client:
//   1. Source new prospects matching their ICP.
//   2. Score each; queue qualified ones, disqualify the rest.
//   3. Send the next email in the sequence to prospects that are due,
//      respecting the daily send cap, suppression list, and follow-up timing.

import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { findProspects } from '../sources/prospect-finder.js';
import { scoreProspect } from '../scoring/icp-scorer.js';
import { writeEmail } from '../ai/personalizer.js';
import { sendEmail, telegramAlert } from '../email/sender.js';
import {
  insertProspects,
  getProspectsByStage,
  getDueProspects,
  updateProspect,
  insertMessage,
  insertEvent,
  isSuppressed,
  countMessagesSentToday,
} from '../lib/db.js';

const MAX_STEPS = 3; // first email + 2 follow-ups
const FOLLOWUP_DAYS = [0, 3, 4]; // wait before step 2 (3d) and step 3 (4d)

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// 1 + 2: source and score
export async function sourceAndScore(client) {
  const raw = await findProspects(client, config.dailyProspectLimit);

  const rows = raw.map((p) => {
    const { score, qualified, hot, reasons } = scoreProspect(p, client);
    return {
      client_id: client.id,
      full_name: p.full_name,
      first_name: p.first_name,
      title: p.title,
      company: p.company,
      email: p.email,
      linkedin_url: p.linkedin_url,
      industry: p.industry,
      location: p.location,
      source: p.source,
      icp_score: score,
      qualified,
      hot,
      score_reasons: reasons,
      stage: qualified ? 'queued' : 'disqualified',
      step: 0,
      next_action_at: qualified ? new Date().toISOString() : null,
    };
  });

  const inserted = await insertProspects(rows);
  const qualified = inserted.filter((r) => r.qualified).length;
  log.ok(
    `Sourced ${inserted.length} new prospects for "${client.name}" — ${qualified} qualified, ${inserted.length - qualified} disqualified.`
  );
  return inserted;
}

// 3: send the next sequence step to one prospect
async function advanceProspect(prospect, client) {
  if (await isSuppressed(prospect.email)) {
    await updateProspect(prospect.id, { stage: 'unsubscribed', next_action_at: null });
    log.warn(`Skipping suppressed/unsubscribed contact: ${prospect.email}`);
    return false;
  }

  const nextStep = (prospect.step || 0) + 1;
  if (nextStep > MAX_STEPS) {
    await updateProspect(prospect.id, { next_action_at: null });
    return false;
  }

  const { subject, body } = await writeEmail(nextStep, prospect, client);
  const result = await sendEmail({ to: prospect.email, subject, body });

  await insertMessage({
    prospect_id: prospect.id,
    client_id: client.id,
    channel: 'email',
    step: nextStep,
    subject,
    body: result.finalBody,
    status: result.status,
    provider_id: result.providerId || null,
    error: result.error || null,
    sent_at: result.status === 'failed' ? null : new Date().toISOString(),
  });

  if (result.status === 'failed') {
    log.error(`Send failed for ${prospect.email}: ${result.error}`);
    return false;
  }

  await insertEvent({ prospect_id: prospect.id, type: 'sent', meta: { step: nextStep } });

  const isLast = nextStep >= MAX_STEPS;
  await updateProspect(prospect.id, {
    stage: 'contacted',
    step: nextStep,
    next_action_at: isLast ? null : daysFromNow(FOLLOWUP_DAYS[nextStep] || 3),
  });

  if (prospect.hot) {
    await telegramAlert(`🔥 *Hot prospect contacted*\n${prospect.full_name} — ${prospect.title} @ ${prospect.company}\nClient: ${client.name} · Step ${nextStep}`);
  }
  return true;
}

// Run outreach across all due prospects, respecting the daily cap.
export async function runOutreach(client) {
  const alreadySent = await countMessagesSentToday();
  let budget = Math.max(config.dailySendLimit - alreadySent, 0);
  if (budget === 0) {
    log.warn(`Daily send cap (${config.dailySendLimit}) reached — no more emails today.`);
    return 0;
  }

  // New queued prospects first, then due follow-ups.
  const queued = await getProspectsByStage('queued', budget);
  const due = await getDueProspects(budget);
  const seen = new Set();
  const pipeline = [...queued, ...due].filter((p) => {
    if (seen.has(p.id) || p.client_id !== client.id) return false;
    seen.add(p.id);
    return true;
  });

  let sent = 0;
  for (const prospect of pipeline) {
    if (budget <= 0) break;
    const ok = await advanceProspect(prospect, client);
    if (ok) {
      sent++;
      budget--;
    }
  }
  log.ok(`Outreach complete for "${client.name}": ${sent} email(s) ${config.dryRun ? 'simulated' : 'sent'}.`);
  return sent;
}
