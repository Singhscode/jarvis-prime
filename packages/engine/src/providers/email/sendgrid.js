// SendGrid email provider — stub implementation.
// Ready to fill in when you need to switch from Resend to SendGrid.
//
// To activate:
//   1. Set EMAIL_PROVIDER=sendgrid in .env
//   2. Set SENDGRID_API_KEY=SG.xxx in .env
//   3. Fill in the send() method below

import { config } from '../../config.js';
import { log } from '../../lib/logger.js';
import { BaseEmailProvider } from './index.js';

export class SendGridProvider extends BaseEmailProvider {
  get name() { return 'sendgrid'; }

  isConfigured() {
    return Boolean(config.sendgridApiKey);
  }

  /**
   * Send an email via SendGrid API.
   * @param {string} to        Recipient email
   * @param {string} subject   Email subject
   * @param {string} body      Plain text body
   * @param {object} [opts]    { html, headers, replyTo }
   * @returns {Promise<{ status, providerId?, error? }>}
   */
  async send(to, subject, body, opts = {}) {
    if (config.dryRun) {
      log.dry(`[SendGrid] Would email ${to} | subject: "${subject}"`);
      return { status: 'dry_run' };
    }

    if (!this.isConfigured()) {
      return { status: 'failed', error: 'SENDGRID_API_KEY not set' };
    }

    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.sendgridApiKey}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: config.fromEmail, name: config.fromName },
          reply_to: { email: opts.replyTo || config.replyToEmail },
          subject,
          content: [
            { type: 'text/plain', value: body },
            ...(opts.html ? [{ type: 'text/html', value: opts.html }] : []),
          ],
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        return { status: 'failed', error: `SendGrid ${res.status}: ${txt}` };
      }

      // SendGrid returns 202 with no body on success
      const messageId = res.headers.get('x-message-id') || 'unknown';
      log.ok(`[SendGrid] Sent email to ${to} (id: ${messageId})`);
      return { status: 'sent', providerId: messageId };
    } catch (err) {
      return { status: 'failed', error: err.message };
    }
  }
}
