// Resend email provider — implements the email provider interface.
// Extracted from email/sender.js for provider abstraction.

import { config } from '../../config.js';
import { log } from '../../lib/logger.js';
import { BaseEmailProvider } from './index.js';

export class ResendProvider extends BaseEmailProvider {
  get name() { return 'resend'; }

  isConfigured() {
    return Boolean(config.resendApiKey);
  }

  /**
   * Send an email via Resend API.
   * @param {string} to        Recipient email
   * @param {string} subject   Email subject
   * @param {string} body      Plain text body (HTML is auto-generated)
   * @param {object} [opts]    { html, headers, replyTo }
   * @returns {Promise<{ status, providerId?, error? }>}
   */
  async send(to, subject, body, opts = {}) {
    if (config.dryRun) {
      log.dry(`Would email ${to} | subject: "${subject}"`);
      return { status: 'dry_run' };
    }

    if (!this.isConfigured()) {
      return { status: 'failed', error: 'RESEND_API_KEY not set' };
    }

    try {
      const html = opts.html || this._toHtml(body);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.resendApiKey}`,
        },
        body: JSON.stringify({
          from: `${config.fromName} <${config.fromEmail}>`,
          to: [to],
          reply_to: opts.replyTo || config.replyToEmail,
          subject,
          text: body,
          html,
          headers: {
            'List-Unsubscribe': `<${config.unsubscribeUrl}?email=${encodeURIComponent(to)}>`,
            ...(opts.headers || {}),
          },
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        return { status: 'failed', error: `Resend ${res.status}: ${txt}` };
      }

      const json = await res.json();
      log.ok(`Sent email to ${to} (id: ${json.id})`);
      return { status: 'sent', providerId: json.id };
    } catch (err) {
      return { status: 'failed', error: err.message };
    }
  }

  _toHtml(text) {
    return text
      .split('\n')
      .map((line) => (line.trim() === '' ? '<br/>' : `<p style="margin:0 0 10px">${this._escapeHtml(line)}</p>`))
      .join('');
  }

  _escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
