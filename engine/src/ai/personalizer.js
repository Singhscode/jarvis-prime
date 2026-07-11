// AI personalization. Uses the configured AI provider (Groq by default) to
// write a short, human-sounding cold email tailored to each prospect.
// Falls back to a solid template when AI isn't configured or in dry-run mode,
// so the pipeline always produces a sendable message.
//
// Now uses provider abstraction — swap Groq for OpenAI by setting
// AI_PROVIDER=openai in .env.

import { config } from '../config.js';
import { log } from 'jarvis-logger';
import { getAIProvider } from '../providers/ai/index.js';

// Cache the provider instance (lazy initialized)
let _aiProvider = null;

async function getProvider() {
  if (!_aiProvider) {
    _aiProvider = await getAIProvider();
  }
  return _aiProvider;
}

// Step-based fallback templates (used when AI is off). Kept short, honest,
// and non-spammy — first email opens a conversation, follow-ups add value.
function templateFor(step, prospect, client) {
  const first = prospect.first_name || (prospect.full_name || 'there').split(' ')[0];
  const company = prospect.company || 'your team';
  const clientName = client?.name || 'JARVIS PRIME';

  if (step <= 1) {
    return {
      subject: `quick question about ${company}'s pipeline`,
      body:
        `Hi ${first},\n\n` +
        `I help ${client?.icp_industries?.[0] || 'B2B'} teams like ${company} book more qualified sales meetings without adding headcount.\n\n` +
        `Worth a short chat to see if it's a fit? Happy to share how it works — no pressure either way.\n\n` +
        `Best,\n${config.fromName}`,
    };
  }
  if (step === 2) {
    return {
      subject: `re: ${company}'s pipeline`,
      body:
        `Hi ${first},\n\n` +
        `Following up on my note. Most teams I work with were spending hours prospecting manually before — I take that off your plate and just deliver booked meetings.\n\n` +
        `Open to a 15-min call this week?\n\n` +
        `Best,\n${config.fromName}`,
    };
  }
  return {
    subject: `last one, ${first}`,
    body:
      `Hi ${first},\n\n` +
      `I'll close the loop here so I'm not crowding your inbox. If booking more qualified meetings becomes a priority for ${company}, just reply and I'll pick it back up.\n\n` +
      `Wishing you a strong quarter,\n${config.fromName}`,
  };
}

async function aiWrite(step, prospect, client) {
  const first = prospect.first_name || (prospect.full_name || 'there').split(' ')[0];
  const stepGuidance = {
    1: 'This is the FIRST cold email. Open a conversation, be specific to their role/company, one clear ask for a short call.',
    2: 'This is a FOLLOW-UP. Briefly add value or social proof, gentle nudge to a 15-min call.',
    3: 'This is the FINAL break-up email. Polite, low-pressure, leave the door open.',
  };

  const prompt =
    `You write short, human, non-spammy B2B cold emails for ${client?.name || 'an outbound agency'}.\n` +
    `Recipient: ${prospect.full_name} — ${prospect.title || 'unknown title'} at ${prospect.company || 'unknown company'} (${prospect.industry || ''}).\n` +
    `${stepGuidance[step] || stepGuidance[1]}\n` +
    `Rules: under 90 words, no buzzwords, no fake flattery, plain text, address them as ${first}, sign as "${config.fromName}". ` +
    `Return strict JSON: {"subject": "...", "body": "..."}.`;

  const provider = await getProvider();
  const result = await provider.generate(prompt, { json: true, temperature: 0.7 });
  const parsed = JSON.parse(result.content);

  if (!parsed.subject || !parsed.body) throw new Error('AI returned incomplete email');
  return { subject: parsed.subject, body: parsed.body };
}

/**
 * Produce a personalized {subject, body} for a prospect at a given sequence step.
 */
export async function writeEmail(step, prospect, client) {
  const provider = await getProvider();

  if (config.dryRun || !provider.isConfigured()) {
    return templateFor(step, prospect, client);
  }

  try {
    return await aiWrite(step, prospect, client);
  } catch (err) {
    log.warn(`AI personalization failed (${err.message}); using template instead.`);
    return templateFor(step, prospect, client);
  }
}
