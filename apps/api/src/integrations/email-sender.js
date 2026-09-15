// Email rendering and transactional delivery with a hard marketing safety gate.
//
// - Phase 15A marketing outreach can only be recorded by the persisted,
//   Owner-approved dry-run release RPC; legacy callers always fail closed.
// - The renderer adds the required physical-address and unsubscribe footer.
// - Transactional account messages remain separate from marketing outreach.

import { config } from '../config/config.js';
import { log } from '../utils/logger.js';
import { getEmailProvider } from '../ai/providers/email/index.js';

// Cache the provider instance (lazy initialized)
let _provider = null;

async function getProvider() {
  if (!_provider) {
    _provider = await getEmailProvider();
  }
  return _provider;
}

export function renderOutboundEmail(body, prospectEmail) {
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
export async function sendEmail({ to, body }) {
  const finalBody = renderOutboundEmail(body, to);

  // Phase 15A routes every marketing release through the persisted approval
  // RPC. Legacy callers cannot treat either application dry-run mode or a
  // caller flag as release authority.
  return {
    status: 'failed',
    error: 'Outreach requires a persisted Owner approval and release claim.',
    errorCode: 'OUTBOUND_APPROVAL_REQUIRED',
    finalBody,
  };
}

// Optional founder alert via Telegram (redirected to unified notifications hub for backward compatibility).
export async function telegramAlert(text) {
  try {
    const { notify } = await import('../integrations/notifications.js');
    await notify('telegram', text);
  } catch (err) {
    log.warn(`telegramAlert wrapper failed: ${err.message}`);
  }
}

/**
 * Send a transactional message without outreach marketing content.
 * Invitation-bearing bodies never appear in logs or return values.
 */
export async function sendTransactionalEmail({ to, subject, body }) {
  if (config.dryRun) {
    log.dry(`Would send transactional email to ${to}`);
    return { status: 'dry_run' };
  }

  try {
    const provider = await getProvider();
    if (!provider.isConfigured()) return { status: 'failed' };
    const result = await provider.send(to, subject, body);
    return { status: result.status, providerId: result.providerId };
  } catch {
    log.warn('Transactional email delivery failed.');
    return { status: 'failed' };
  }
}
