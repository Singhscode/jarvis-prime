// OpenAI provider — alternative AI provider.
// Ready to use when you want to switch from Groq to OpenAI.
//
// To activate:
//   1. Set AI_PROVIDER=openai in .env
//   2. Set OPENAI_API_KEY=sk-xxx in .env
//   3. Optionally set OPENAI_MODEL=gpt-4o-mini (default)

import { config } from '../../../config/config.js';
import { log } from '../../../utils/logger.js';
import { BaseAIProvider } from './index.js';

export class OpenAIProvider extends BaseAIProvider {
  get name() { return 'openai'; }

  isConfigured() {
    return Boolean(config.openaiApiKey);
  }

  /**
   * Generate text using OpenAI API.
   * @param {string} prompt       The prompt to send
   * @param {object} [opts]       { temperature, maxTokens, json, model }
   * @returns {Promise<{ content: string, usage?: object }>}
   */
  async generate(prompt, opts = {}) {
    const {
      temperature = 0.7,
      maxTokens,
      json = false,
      model = config.openaiModel,
    } = opts;

    const body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
    };

    if (maxTokens) body.max_tokens = maxTokens;
    if (json) body.response_format = { type: 'json_object' };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenAI failed: ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    return {
      content,
      usage: data.usage || undefined,
    };
  }
}
