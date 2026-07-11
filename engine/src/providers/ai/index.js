// AI provider abstraction — swap LLM services without editing core code.
//
// Interface:
//   { name, isConfigured(), generate(prompt, opts) }
//
// Usage:
//   import { getAIProvider } from '../providers/ai/index.js';
//   const ai = await getAIProvider();
//   const result = await ai.generate('Write a cold email...', { json: true });

import { config } from '../../config.js';

/**
 * Get the configured AI provider.
 * Defaults to 'groq', but can be switched via AI_PROVIDER env var.
 * @returns {Promise<object>} AI provider implementing { name, isConfigured(), generate() }
 */
export async function getAIProvider() {
  const providerName = config.aiProvider || 'groq';

  switch (providerName) {
    case 'openai': {
      const { OpenAIProvider } = await import('./openai.js');
      return new OpenAIProvider();
    }
    case 'groq':
    default: {
      const { GroqProvider } = await import('./groq.js');
      return new GroqProvider();
    }
  }
}

/**
 * Base interface contract for AI providers.
 */
export class BaseAIProvider {
  get name() { return 'base'; }
  isConfigured() { return false; }

  /**
   * Generate text from a prompt.
   * @param {string} prompt    The prompt to send to the LLM
   * @param {object} [opts]    { temperature, maxTokens, json }
   * @returns {Promise<{ content: string, usage?: object }>}
   */
  async generate(prompt, opts = {}) {
    throw new Error(`${this.name}: generate() not implemented`);
  }
}

/**
 * Shared helper for OpenAI-compatible chat completion APIs (Groq, OpenAI).
 * Both providers use the same request/response shape, differing only in
 * endpoint URL, API key, and default model.
 * @param {object} params
 * @param {string} params.url        Chat completions endpoint
 * @param {string} params.apiKey     Bearer token
 * @param {string} params.model      Model name
 * @param {string} params.prompt     User prompt
 * @param {object} [params.opts]     { temperature, maxTokens, json }
 * @param {string} params.errorLabel Label used in thrown error messages
 * @returns {Promise<{ content: string, usage?: object }>}
 */
export async function chatCompletion({ url, apiKey, model, prompt, opts = {}, errorLabel }) {
  const { temperature = 0.7, maxTokens, json = false } = opts;

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
  };

  if (maxTokens) body.max_tokens = maxTokens;
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`${errorLabel} failed: ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  return {
    content,
    usage: data.usage || undefined,
  };
}
