// Outreach Service
// Wired to real email sender, AI personalizer, and notification hub.

import { config } from '../../config/config.js';
import { writeEmail } from '../../ai/prompts/personalizer.js';
import { sendEmail as resendEmail } from '../../integrations/email-sender.js';
import { alertEvent } from '../../integrations/notifications.js';
import {
  getProspectWithActiveClient,
  insertMessage,
  insertEvent,
} from '../../database/db.js';

function outreachError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function resolveOutreachScope(reference) {
  const scope = await getProspectWithActiveClient(reference?.id);
  if (!scope) {
    throw outreachError('OUTREACH_SCOPE_NOT_FOUND', 'Prospect is not available for outreach.');
  }
  return scope;
}

/**
 * Send a personalized cold email using server-resolved prospect and client scope.
 */
export async function sendEmail(prospectReference, step = 1, options = {}) {
  const { dryRun = config.dryRun } = options;
  const { prospect, client } = await resolveOutreachScope(prospectReference);

  if (!prospect.email) {
    throw outreachError('OUTREACH_EMAIL_MISSING', 'Prospect email is required.');
  }

  const emailContent = await writeEmail(step, prospect, client, { dryRun });
  const result = await resendEmail({
    to: prospect.email,
    subject: emailContent.subject,
    body: emailContent.body,
    dryRun,
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

  return {
    email: prospect.email,
    step,
    status: result.status,
    subject: emailContent.subject,
    messageId: result.providerId || null,
    sentAt: result.status === 'failed' ? null : new Date().toISOString(),
  };
}

export async function sendFollowup(prospectReference, step = 2, options = {}) {
  return sendEmail(prospectReference, step, options);
}

export async function sendAlert(prospectReference) {
  const { prospect, client } = await resolveOutreachScope(prospectReference);
  const alertData = {
    name: prospect.full_name || prospect.name || 'Unknown',
    title: prospect.title || '',
    company: prospect.company || '',
    email: prospect.email || '',
    score: prospect.icp_score || 0,
    client: client.name || '',
  };

  const type = prospect.hot ? 'hot_lead' : 'positive_reply';
  const result = await alertEvent(type, alertData);

  return {
    prospect: prospect.full_name || prospect.name,
    alertType: type,
    channels: result,
    sentAt: new Date().toISOString(),
  };
}
