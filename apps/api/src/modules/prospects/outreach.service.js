// Outreach Service
// Wired to real email sender, AI personalizer, and notification hub.

import { config } from '../../config/config.js';
import { writeEmail } from '../../ai/prompts/personalizer.js';
import { sendEmail as resendEmail } from '../../integrations/email-sender.js';
import { alertEvent } from '../../integrations/notifications.js';
import { insertMessage, insertEvent } from '../../database/db.js';

/**
 * Send a personalized cold email to a prospect.
 */
export async function sendEmail(prospect, step = 1, options = {}) {
  const { dryRun = config.dryRun } = options;

  if (!prospect?.email) {
    throw new Error('Prospect email is required');
  }

  // Generate personalized email via AI
  const client = options.client || { name: config.fromName, icp_industries: ['B2B'] };
  const emailContent = await writeEmail(step, prospect, client);

  // Send via Resend
  const result = await resendEmail({
    to: prospect.email,
    subject: emailContent.subject,
    body: emailContent.body,
  });

  // Log the message
  await insertMessage({
    prospect_id: prospect.id || null,
    client_id: client.id || null,
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
    await insertEvent({ prospect_id: prospect.id || null, type: 'sent', meta: { step, channel: 'email' } });
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

/**
 * Send a follow-up email.
 */
export async function sendFollowup(prospect, step = 2, options = {}) {
  // Follow-ups use the same pipeline, just with a higher step number
  return sendEmail(prospect, step, options);
}

/**
 * Send an alert via the notification hub.
 */
export async function sendAlert(prospect, options = {}) {
  const { dryRun = config.dryRun } = options;

  const alertData = {
    name: prospect?.full_name || prospect?.name || 'Unknown',
    title: prospect?.title || '',
    company: prospect?.company || '',
    email: prospect?.email || '',
    score: prospect?.icp_score || 0,
    client: options.client?.name || '',
  };

  const type = prospect?.hot ? 'hot_lead' : 'positive_reply';
  const result = await alertEvent(type, alertData);

  return {
    prospect: prospect?.full_name || prospect?.name,
    alertType: type,
    channels: result,
    sentAt: new Date().toISOString(),
  };
}
