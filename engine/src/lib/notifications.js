// Multi-channel notification hub.
// Unified interface for Telegram, Slack, WhatsApp, and Email alerts.
// Replaces the Telegram-only alerting from sender.js.

import { config } from '../config.js';
import { log } from './logger.js';

/**
 * Send a notification across one or more channels.
 * @param {string|string[]} channels  'telegram' | 'slack' | 'whatsapp' | 'email' | 'all'
 * @param {string} message            The notification message
 * @param {object} options            { subject, html, priority }
 */
export async function notify(channels, message, options = {}) {
  if (channels === 'all') channels = ['telegram', 'slack', 'whatsapp'];
  if (typeof channels === 'string') channels = [channels];

  const results = {};
  for (const ch of channels) {
    try {
      switch (ch) {
        case 'telegram':
          results.telegram = await sendTelegram(message);
          break;
        case 'slack':
          results.slack = await sendSlack(message, options);
          break;
        case 'whatsapp':
          results.whatsapp = await sendWhatsApp(message);
          break;
        case 'email':
          results.email = await sendNotificationEmail(message, options);
          break;
        default:
          log.warn(`Unknown notification channel: ${ch}`);
      }
    } catch (err) {
      log.warn(`Notification to ${ch} failed: ${err.message}`);
      results[ch] = { status: 'failed', error: err.message };
    }
  }
  return results;
}

/**
 * Smart notification routing based on event type.
 */
export async function alertEvent(type, data = {}) {
  const message = formatEventMessage(type, data);

  switch (type) {
    case 'hot_lead':
    case 'meeting_booked':
      // High priority — send to all channels
      return notify(['telegram', 'slack', 'whatsapp'], message);

    case 'positive_reply':
    case 'needs_review':
      // Medium priority — Telegram + Slack
      return notify(['telegram', 'slack'], message);

    case 'daily_report':
    case 'weekly_report':
      // Reports — Slack + Email
      return notify(['slack', 'email'], message, { subject: `JARVIS PRIME — ${type.replace('_', ' ')}` });

    case 'campaign_complete':
    case 'error':
      return notify(['telegram', 'slack'], message);

    default:
      return notify('telegram', message);
  }
}

function formatEventMessage(type, data) {
  switch (type) {
    case 'hot_lead':
      return `🔥 *Hot Lead Detected*\n${data.name || 'Unknown'} — ${data.title || ''} @ ${data.company || ''}\nScore: ${data.score || '?'}\nClient: ${data.client || ''}`;

    case 'meeting_booked':
      return `✅ *Meeting Booked!*\n${data.name || 'Unknown'} — ${data.title || ''} @ ${data.company || ''}\nTime: ${data.time || 'TBD'}\nClient: ${data.client || ''}`;

    case 'positive_reply':
      return `📨 *Positive Reply*\n${data.name || 'Unknown'} — ${data.title || ''} @ ${data.company || ''}\nClient: ${data.client || ''}\n\n"${(data.text || '').slice(0, 200)}"`;

    case 'needs_review':
      return `⚠️ *Reply Needs Review*\n${data.name || 'Unknown'} — ${data.email || ''}\n\n"${(data.text || '').slice(0, 200)}"`;

    case 'daily_report':
      return `📊 *Daily Report — ${data.date || new Date().toLocaleDateString()}*\n` +
        `✉️ Emails sent: ${data.emailsSent || 0}\n` +
        `🔗 LinkedIn actions: ${data.linkedinActions || 0}\n` +
        `💬 Replies: ${data.replies || 0} (${data.replyRate || '0'}%)\n` +
        `📅 Meetings booked: ${data.meetingsBooked || 0}\n` +
        `🎯 Pipeline value: ${data.pipelineValue || '₹0'}`;

    case 'weekly_report':
      return `📈 *Weekly Report — ${data.week || ''}*\n` +
        `Total emails: ${data.totalEmails || 0}\n` +
        `Total replies: ${data.totalReplies || 0} (${data.replyRate || '0'}%)\n` +
        `Meetings booked: ${data.meetingsBooked || 0}\n` +
        `Top performer: ${data.topPerformer || 'N/A'}`;

    case 'campaign_complete':
      return `🏁 *Campaign Complete*\n"${data.campaignName || 'Unnamed'}"\nSent: ${data.sent || 0} | Replies: ${data.replies || 0} | Meetings: ${data.meetings || 0}`;

    case 'error':
      return `🚨 *Engine Error*\n${data.message || 'Unknown error'}\n\n${data.stack || ''}`.slice(0, 500);

    default:
      return JSON.stringify(data, null, 2).slice(0, 500);
  }
}

// ---- Channel implementations ----

async function sendTelegram(text) {
  if (!config.telegramBotToken || !config.telegramChatId) {
    return { status: 'skipped', reason: 'not configured' };
  }
  if (config.dryRun) {
    log.dry(`[Telegram] ${text.split('\n')[0]}`);
    return { status: 'dry_run' };
  }
  const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.telegramChatId, text, parse_mode: 'Markdown' }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}`);
  return { status: 'sent' };
}

async function sendSlack(text, options = {}) {
  if (!config.slackWebhookUrl) {
    return { status: 'skipped', reason: 'not configured' };
  }
  if (config.dryRun) {
    log.dry(`[Slack] ${text.split('\n')[0]}`);
    return { status: 'dry_run' };
  }
  // Convert Markdown bold (*text*) to Slack bold (*text*)
  const slackText = text.replace(/\*([^*]+)\*/g, '*$1*');
  const res = await fetch(config.slackWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: config.slackChannel,
      text: slackText,
      username: 'JARVIS PRIME',
      icon_emoji: ':robot_face:',
    }),
  });
  if (!res.ok) throw new Error(`Slack ${res.status}`);
  return { status: 'sent' };
}

async function sendWhatsApp(text) {
  if (!config.twilioAccountSid || !config.twilioWhatsappFrom || !config.whatsappAlertTo) {
    return { status: 'skipped', reason: 'not configured' };
  }
  if (config.dryRun) {
    log.dry(`[WhatsApp] ${text.split('\n')[0]}`);
    return { status: 'dry_run' };
  }
  // Strip markdown formatting for WhatsApp
  const cleanText = text.replace(/\*/g, '');
  const authHeader = 'Basic ' + Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
  const body = new URLSearchParams({
    From: config.twilioWhatsappFrom,
    To: config.whatsappAlertTo,
    Body: cleanText,
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
    {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  );
  if (!res.ok) throw new Error(`Twilio ${res.status}`);
  return { status: 'sent' };
}

async function sendNotificationEmail(text, options = {}) {
  if (!config.resendApiKey) {
    return { status: 'skipped', reason: 'not configured' };
  }
  if (config.dryRun) {
    log.dry(`[Email notification] ${options.subject || text.split('\n')[0]}`);
    return { status: 'dry_run' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.resendApiKey}`,
    },
    body: JSON.stringify({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: [config.replyToEmail],
      subject: options.subject || 'JARVIS PRIME Alert',
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend notification ${res.status}`);
  return { status: 'sent' };
}
