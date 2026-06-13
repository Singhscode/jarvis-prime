/**
 * AI client — uses Groq (free, 14,400 req/day) by default.
 * Falls back to OpenAI if GROQ_API_KEY is not set.
 */

const provider = process.env.AI_PROVIDER || "groq";

async function callAI(messages, { maxTokens = 500, temperature = 0.7 } = {}) {
  if (provider === "groq") {
    return callGroq(messages, { maxTokens, temperature });
  }
  return callOpenAI(messages, { maxTokens, temperature });
}

async function callGroq(messages, { maxTokens, temperature }) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Groq] API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function callOpenAI(messages, { maxTokens, temperature }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[OpenAI] API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

export { callAI };
