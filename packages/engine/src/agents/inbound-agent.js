// Inbound agent — processes replies from prospects.
//
// Classifies a reply (positive / question / negative / unsubscribe / auto-reply),
// updates the prospect's stage, stops follow-ups when appropriate, suppresses
// opt-outs, and alerts the founder when a meeting-ready reply comes in.
//
// NOTE on going live: detecting replies requires connecting an inbox — either a
// Resend/Postmark inbound webhook or IMAP polling of your mailbox. That wiring
// is environment-specific; this module exposes handleReply() which your webhook
// or poller calls per message. In dry-run we can simulate replies for testing.

import { log } from '../lib/logger.js';
import { telegramAlert } from '../email/sender.js';
import { updateProspect, insertEvent, addSuppression } from '../lib/db.js';

const UNSUB_RE = /\b(unsubscribe|opt[\s-]?out|remove me|stop emailing|take me off)\b/i;
const POSITIVE_RE = /\b(interested|sure|sounds good|let's talk|book|calendar|call|yes|keen|tell me more)\b/i;
const NEGATIVE_RE = /\b(not interested|no thanks|no thank you|not a fit|wrong person|don't|do not)\b/i;
const AUTO_RE = /\b(out of office|ooo|automatic reply|vacation|away from)\b/i;

/**
 * Classify reply text into an intent bucket.
 */
export function classifyReply(text = '') {
  if (UNSUB_RE.test(text)) return 'unsubscribe';
  if (AUTO_RE.test(text)) return 'auto_reply';
  if (NEGATIVE_RE.test(text)) return 'negative';
  if (POSITIVE_RE.test(text)) return 'positive';
  return 'question'; // human reply that isn't clearly yes/no — worth a look
}

/**
 * Handle a single inbound reply for a prospect.
 * @param {object} prospect  the prospect row
 * @param {string} text      raw reply text
 * @param {object} client    the client this prospect belongs to
 */
export async function handleReply(prospect, text, client) {
  const intent = classifyReply(text);
  await insertEvent({ prospect_id: prospect.id, type: 'reply', meta: { intent } });

  switch (intent) {
    case 'unsubscribe':
      await addSuppression(prospect.email, 'unsubscribe');
      await updateProspect(prospect.id, { stage: 'unsubscribed', next_action_at: null });
      log.warn(`Unsubscribed: ${prospect.email}`);
      break;

    case 'negative':
      await updateProspect(prospect.id, { stage: 'disqualified', next_action_at: null });
      log.info(`Negative reply — stopping follow-ups for ${prospect.email}`);
      break;

    case 'auto_reply':
      // Don't change stage; just note it. Follow-ups continue on schedule.
      log.info(`Auto-reply from ${prospect.email} — leaving in sequence.`);
      break;

    case 'positive':
    case 'question':
      await updateProspect(prospect.id, { stage: 'replied', next_action_at: null });
      await telegramAlert(
        `📨 *Reply needs you* (${intent})\n${prospect.full_name} — ${prospect.title} @ ${prospect.company}\nClient: ${client?.name || ''}\n\n"${(text || '').slice(0, 200)}"`
      );
      log.ok(`${intent === 'positive' ? '🔥 Positive' : 'Human'} reply from ${prospect.email} — flagged for you to book.`);
      break;
  }
  return intent;
}

/**
 * Mark a prospect as booked (call this when a meeting is scheduled, e.g. from a
 * Calendly webhook). Stops all outreach and alerts the founder.
 */
export async function markBooked(prospect, client) {
  await updateProspect(prospect.id, { stage: 'booked', next_action_at: null });
  await insertEvent({ prospect_id: prospect.id, type: 'reply', meta: { intent: 'booked' } });
  await telegramAlert(
    `✅ *Meeting booked!*\n${prospect.full_name} — ${prospect.title} @ ${prospect.company}\nClient: ${client?.name || ''}`
  );
  log.ok(`Meeting booked with ${prospect.email} 🎉`);
}
