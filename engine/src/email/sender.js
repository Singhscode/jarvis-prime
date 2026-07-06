// Email sending via Resend, with a hard safety gate.
//
// - In dry-run mode, emails are NEVER sent. They're logged and recorded with
//   status "dry_run" so you can review exactly what would have gone out.
// - Every email gets a compliant footer (physical address + unsubscribe),
//   which is legally required for cold outreach (CAN-SPAM / India DPDP).

import { config } from '../config.js';
import { log } from '../lib/logger.js';

function withFooter(body, prospectEmail) {
  const unsub = `${config.unsubscribeUrl}?email=${encodeURIComponent(prospectEmail || '')}`;
  return (
    `${body}\n\n` +
    `—\n` +
    `${config.fromName} · ${config.postalAddress}\n` +
    `Don't want these emails? Unsubscribe: ${unsub}`
  );
}

function toHtml(text) {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '<br/>' : `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`))
    .join('');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Send (or simulate sending) one email.
 * @returns {Promise<{status:'sent'|'dry_run'|'failed', providerId?:string, error?:string, finalBody:string}>}
 */
export async function sendEmail({ to, subject, body }) {
  const finalBody = withFooter(body, to);

  if (config.dryRun) {
    log.dry(`Would email ${to} | subject: "${subject}"`);
    return { status: 'dry_run', finalBody };
  }

  if (!config.resendApiKey) {
    return { status: 'failed', error: 'RESEND_API_KEY not set', finalBody };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${config.fromName} <${config.fromEmail}>`,
        to: [to],
        reply_to: config.replyToEmail,
        subject,
        text: finalBody,
        html: toHtml(finalBody),
        headers: {
          'List-Unsubscribe': `<${config.unsubscribeUrl}?email=${encodeURIComponent(to)}>`,
        },
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { status: 'failed', error: `Resend ${res.status}: ${txt}`, finalBody };
    }
    const json = await res.json();
    log.ok(`Sent email to ${to} (id: ${json.id})`);
    return { status: 'sent', providerId: json.id, finalBody };
  } catch (err) {
    return { status: 'failed', error: err.message, finalBody };
  }
}

// Optional founder alert via Telegram (redirected to unified notifications hub for backward compatibility).
export async function telegramAlert(text) {
  try {
    const { notify } = await import('../lib/notifications.js');
    await notify('telegram', text);
  } catch (err) {
    log.warn(`telegramAlert wrapper failed: ${err.message}`);
  }
}
