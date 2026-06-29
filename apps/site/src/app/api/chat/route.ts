import { NextResponse } from 'next/server';

/**
 * AI assistant endpoint for the website chat widget.
 *
 * - Uses Groq (fast LLM) when GROQ_API_KEY is set.
 * - Falls back to a helpful rule-based reply when no key is configured,
 *   so the chat always works (just less conversational).
 *
 * Env:
 *   GROQ_API_KEY   (optional) — enables real AI answers
 *   GROQ_MODEL     (optional) — defaults to llama-3.3-70b-versatile
 */

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// Everything the assistant is allowed to know about JARVIS PRIME.
const KNOWLEDGE = `
You are "JARVIS", the friendly AI assistant on the JARVIS PRIME website.
JARVIS PRIME is an AI-powered outbound system that books qualified sales meetings
for marketing agencies and B2B companies — without them hiring SDRs.

WHAT WE DO:
- Find prospects matching the client's ideal customer profile
- Write AI-personalized cold emails (no spammy templates)
- Send multi-step email sequences and follow-ups
- Qualify replies and book meetings on the client's calendar

PRICING (Indian Rupees, monthly, cancel anytime, no setup fees):
- STARTER — ₹24,999/month — for freelancers & small teams — ~3-5 meetings/month
- GROWTH (most popular) — ₹49,999/month — for agencies & consulting — ~8-15 meetings/month
- SCALE — ₹99,999/month — enterprise growth — ~15-30 meetings/month

TYPICAL RESULTS: 35-45% email open rate, 5-8% reply rate, first meetings in ~2-3 weeks.
WHY NOT AN SDR: hiring an SDR costs ₹1.5L-2L/month, takes 2-3 months to ramp, and adds
management overhead. JARVIS PRIME is done-for-you at a fraction of the cost.

HOW TO START: the best next step is a free strategy call, booked at /book-call.
CONTACT: hello@jarvisprime.me

STYLE RULES:
- Be warm, concise, and helpful. 2-4 sentences max unless asked for detail.
- Always keep prices in rupees (₹).
- Be honest: we're an early-stage company; never invent fake client names or stats
  beyond the typical ranges above.
- When someone shows buying intent (pricing, results, "how do I start"), invite them
  to book a free strategy call at /book-call.
- If you don't know something, say so and offer the strategy call or hello@jarvisprime.me.
- Never make up features we don't have.
`;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function fallbackReply(userText: string): string {
  const t = userText.toLowerCase();
  if (/price|cost|pricing|plan|how much|₹|rupee/.test(t)) {
    return "Our plans are Starter ₹24,999/mo (3-5 meetings), Growth ₹49,999/mo (8-15 meetings, most popular), and Scale ₹99,999/mo (15-30 meetings). All month-to-month, cancel anytime. Want to see which fits? Book a free strategy call: /book-call";
  }
  if (/sdr|hire|hiring|difference|vs|compare/.test(t)) {
    return "Hiring an SDR runs ₹1.5L-2L/month and takes 2-3 months to ramp. JARVIS PRIME is done-for-you at a fraction of that, with first meetings usually in 2-3 weeks. Happy to walk you through it on a free call: /book-call";
  }
  if (/result|meeting|open rate|reply|work|how does|process/.test(t)) {
    return "We find your ideal prospects, send AI-personalized cold emails, follow up, and book qualified meetings on your calendar. Typical results: 35-45% open rates, 5-8% reply rates, first meetings in ~2-3 weeks. Want specifics for your business? Book a free strategy call: /book-call";
  }
  if (/start|begin|sign up|book|demo|call|contact/.test(t)) {
    return "Great — the best first step is a free strategy call where we map out your campaign. You can book it here: /book-call. Or email us at hello@jarvisprime.me.";
  }
  return "Happy to help! JARVIS PRIME books qualified sales meetings for agencies and B2B companies using AI outbound — no SDRs needed. Ask me about pricing, how it works, or results. To get started, book a free strategy call at /book-call.";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const incoming: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];

    // Basic validation + trimming (keep last 10 turns, cap length)
    const messages = incoming
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) {
      return NextResponse.json({ error: 'No message provided.' }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;

    // No AI key configured → rule-based fallback (still useful).
    if (!apiKey) {
      return NextResponse.json({ reply: fallbackReply(lastUser.content), mode: 'fallback' });
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.6,
        max_tokens: 400,
        messages: [{ role: 'system', content: KNOWLEDGE }, ...messages],
      }),
    });

    if (!res.ok) {
      // If the AI provider errors, degrade gracefully instead of failing.
      return NextResponse.json({ reply: fallbackReply(lastUser.content), mode: 'fallback' });
    }

    const json = await res.json();
    const reply = json.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json({ reply: fallbackReply(lastUser.content), mode: 'fallback' });
    }

    return NextResponse.json({ reply, mode: 'ai' });
  } catch (err) {
    console.error('[chat] error:', err);
    return NextResponse.json(
      { reply: "Sorry, I hit a snag. You can always reach us at hello@jarvisprime.me or book a free call at /book-call.", mode: 'error' },
      { status: 200 }
    );
  }
}
