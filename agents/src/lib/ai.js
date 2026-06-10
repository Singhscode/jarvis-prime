/**
 * JARVIS PRIME — AI Client (OpenAI)
 * 
 * Handles all AI operations: intent classification, email drafting, etc.
 * 
 * SETUP:
 * 1. Get API key from https://platform.openai.com
 * 2. Add OPENAI_API_KEY to .env
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Call OpenAI with messages
 * @param {Array} messages - Chat messages array
 * @param {Object} options - maxTokens, temperature, model
 * @returns {string} - AI response text
 */
export async function callAI(messages, options = {}) {
  const {
    maxTokens = 500,
    temperature = 0.7,
    model = "gpt-4o-mini"
  } = options;

  if (!process.env.OPENAI_API_KEY) {
    console.warn("[AI] Missing OPENAI_API_KEY — returning fallback");
    return "Unable to process with AI. Please check API key.";
  }

  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    });

    return response.choices[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("[AI] OpenAI error:", error.message);
    throw error;
  }
}

/**
 * Classify lead intent
 * @param {Object} lead - Lead object with company, revenue, message
 * @returns {string} - Intent label (3-5 words)
 */
export async function classifyLeadIntent(lead) {
  const prompt = `You are a B2B sales classifier. Classify this lead's intent in 3-5 words.

Lead info:
- Company: ${lead.company}
- Revenue: ${lead.revenue || "unknown"}
- Message: "${lead.message || "no message"}"

Respond with ONLY a short intent label like:
"Wants lead generation", "Exploring outbound automation", "Ready to buy", "Just browsing", "Needs more info"`;

  try {
    return await callAI([{ role: "user", content: prompt }], { 
      maxTokens: 20, 
      temperature: 0.3 
    });
  } catch {
    return "Intent unclear";
  }
}

/**
 * Generate personalized email
 * @param {Object} lead - Lead data
 * @param {Object} icpResult - ICP scoring result
 * @param {string} intent - Classified intent
 * @returns {string} - Email HTML body
 */
export async function generateEmail(lead, icpResult, intent) {
  const founderName = process.env.FOUNDER_NAME || "Anuj";
  const calendly = process.env.FOUNDER_CALENDLY || "https://calendly.com/jarvis-prime";

  const prompt = `You are ${founderName}, founder of JARVIS PRIME — an AI outbound agency for Indian B2B companies.

Write a warm, conversational reply email to ${lead.name} from ${lead.company}.

Context:
- Their revenue: ${lead.revenue || "not shared"}
- Their message: "${lead.message || "no message — they just submitted the form"}"
- Their intent: ${intent}
- ICP score: ${icpResult.score}/25 (${icpResult.hot ? "hot lead" : "qualified lead"})

Rules:
- Be direct and human — no corporate fluff
- 3–4 short paragraphs max
- Acknowledge their specific situation
- Mention 1 relevant result (e.g., "we helped a Mumbai agency book 18 calls/month")
- End with a clear CTA: book a free 30-min call via this link: ${calendly}
- Sign off as ${founderName}, JARVIS PRIME
- Output ONLY the email HTML body (no subject line, no markdown)`;

  return await callAI([{ role: "user", content: prompt }], { 
    maxTokens: 400, 
    temperature: 0.75 
  });
}

/**
 * Generate LinkedIn message
 * @param {Object} prospect - Prospect data
 * @returns {string} - LinkedIn message
 */
export async function generateLinkedInMessage(prospect) {
  const founderName = process.env.FOUNDER_NAME || "Anuj";

  const prompt = `Write a short LinkedIn connection request message (under 280 chars) from ${founderName} to ${prospect.name}, ${prospect.title} at ${prospect.company}.

Context: We help B2B companies automate outbound and book 15-20 qualified calls/month.

Rules:
- Super casual and human
- Reference their role or company specifically
- No selling, just open a conversation
- End with a soft question
- Output ONLY the message text`;

  return await callAI([{ role: "user", content: prompt }], { 
    maxTokens: 100, 
    temperature: 0.8 
  });
}
