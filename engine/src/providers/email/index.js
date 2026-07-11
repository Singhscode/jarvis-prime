// Email provider abstraction — swap email services without editing core code.
//
// Interface:
//   { name, isConfigured(), send(to, subject, body, opts) }
//
// Usage:
//   import { getEmailProvider } from '../providers/email/index.js';
//   const provider = getEmailProvider();
//   const result = await provider.send(to, subject, body);

import { config } from '../../config.js';
import { log } from 'jarvis-logger';

/**
 * Get the configured email provider.
 * Defaults to 'resend', but can be switched via EMAIL_PROVIDER env var.
 * @returns {object} Email provider implementing { name, isConfigured(), send() }
 */
export async function getEmailProvider() {
  const providerName = config.emailProvider || 'resend';

  switch (providerName) {
    case 'sendgrid': {
      const { SendGridProvider } = await import('./sendgrid.js');
      return new SendGridProvider();
    }
    case 'resend':
    default: {
      const { ResendProvider } = await import('./resend.js');
      return new ResendProvider();
    }
  }
}

/**
 * Base interface contract for email providers.
 * All providers should implement these methods.
 */
export class BaseEmailProvider {
  get name() { return 'base'; }
  isConfigured() { return false; }

  /**
   * Send an email.
   * @param {string} to        Recipient email
   * @param {string} subject   Email subject
   * @param {string} body      Plain text body
   * @param {object} [opts]    Provider-specific options (html, headers, etc.)
   * @returns {Promise<{ status: 'sent'|'dry_run'|'failed', providerId?: string, error?: string }>}
   */
  async send(to, subject, body, opts = {}) {
    throw new Error(`${this.name}: send() not implemented`);
  }
}
