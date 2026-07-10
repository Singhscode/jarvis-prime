// Email sending via configurable provider, with a hard safety gate.
//
// - In dry-run mode, emails are NEVER sent. They're logged and recorded with
//   status "dry_run" so you can review exactly what would have gone out.
// - Every email gets a compliant footer (physical address + unsubscribe),
//   which is legally required for cold outreach (CAN-SPAM / India DPDP).
// - Now uses provider abstraction — swap Resend for SendGrid by setting
//   EMAIL_PROVIDER=sendgrid in .env.

import { config } from '../config.js';
import { log } from '../lib/logger.js';
import { getEmailProvider } from '../providers/email/index.js';

// Cache the provider instance (lazy initialized)
let _provider = null;

async function getProvider() {
  if (!_provider) {
    _provider = await getEmailProvider();
  }
  return _provider;
}

function withFooter(body, prospectEmail) {
  const unsub = `${config.unsubscribeUrl}?email=${encodeURIComponent(prospectEmail || '')}`;
  return (
    `${body}\n\n` +
    `—\n` +
    `${config.fromName} · ${config.postalAddress}\n` +
    `Don't want these emails? Unsubscribe: ${unsub}`
  );
}

/**
 * Send (or simulate sending) one email.
 * Uses the configured email provider (Resend by default, switchable via config).
 * @returns {Promise<{status:'sent'|'dry_run'|'failed', providerId?:string, error?:string, finalBody:string}>}
 */
export async function sendEmail({ to, subject, body }) {
  const finalBody = withFooter(body, to);

  if (config.dryRun) {
    log.dry(`Would email ${to} | subject: "${subject}"`);
    return { status: 'dry_run', finalBody };
  }

  const provider = await getProvider();

  if (!provider.isConfigured()) {
    return { status: 'failed', error: `${provider.name} is not configured`, finalBody };
  }

  try {
    const result = await provider.send(to, subject, finalBody);
    return { ...result, finalBody };
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
