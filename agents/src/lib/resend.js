/**
 * JARVIS PRIME — Resend Email Client
 * 
 * Sends transactional emails via Resend (great deliverability for cold email).
 * 
 * SETUP:
 * 1. Create account at https://resend.com
 * 2. Verify your domain (e.g., jarvisprime.me)
 * 3. Create API key
 * 4. Add RESEND_API_KEY and RESEND_FROM_EMAIL to .env
 */

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send an email via Resend
 * @param {Object} options - to, subject, html, from (optional)
 * @returns {string|null} - Email ID if successful, null if failed
 */
export async function sendEmail({ to, subject, html, from }) {
  const fromEmail = from || process.env.RESEND_FROM_EMAIL || "hello@jarvisprime.me";

  if (!process.env.RESEND_API_KEY) {
    console.warn("[Resend] Missing RESEND_API_KEY — email not sent");
    return null;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `JARVIS PRIME <${fromEmail}>`,
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("[Resend] Error:", error.message);
      return null;
    }

    console.log(`[Resend] Email sent to ${to} — ID: ${data.id}`);
    return data.id;
  } catch (error) {
    console.error("[Resend] Failed:", error.message);
    return null;
  }
}

/**
 * Send bulk emails (with rate limiting)
 * @param {Array} emails - Array of { to, subject, html }
 * @param {number} delayMs - Delay between emails (default: 1000ms)
 */
export async function sendBulkEmails(emails, delayMs = 1000) {
  const results = [];
  
  for (const email of emails) {
    const id = await sendEmail(email);
    results.push({ to: email.to, success: !!id, id });
    await new Promise(r => setTimeout(r, delayMs));
  }
  
  return results;
}

/**
 * Send follow-up email (different subject line pattern)
 * @param {Object} lead - Lead data
 * @param {number} followUpNumber - Which follow-up (1, 2, 3, etc.)
 * @param {string} html - Email body
 */
export async function sendFollowUp(lead, followUpNumber, html) {
  const subjects = [
    `Quick follow-up, ${lead.name.split(" ")[0]}`,
    `Did you see my last note?`,
    `One more thing — ${lead.company}`,
    `Last try — worth a quick chat?`,
  ];

  const subject = subjects[Math.min(followUpNumber - 1, subjects.length - 1)];

  return sendEmail({
    to: lead.email,
    subject,
    html,
  });
}
