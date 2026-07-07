// Groq AI provider — implements the AI provider interface.
// Extracted from ai/personalizer.js for provider abstraction.

import { config } from '../../config.js';
import { log } from '../../lib/logger.js';
import { BaseAIProvider } from './index.js';

export class GroqProvider extends BaseAIProvider {
  get name() { return 'groq'; }

  isConfigured() {
    return Boolean(config.groqApiKey);
  }

  /**
   * Generate text using Groq API.
   * @param {string} prompt       The prompt to send
   * @param {object} [opts]       { temperature, maxTokens, json, model }
   * @returns {Promise<{ content: string, usage?: object }>}
   */
  async generate(prompt, opts = {}) {
    const {
      temperature = 0.7,
      maxTokens,
      json = false,
      model = config.groqModel,
    } = opts;

    const body = {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
    };

    if (maxTokens) body.max_tokens = maxTokens;
    if (json) body.response_format = { type: 'json_object' };

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.groqApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Groq failed: ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    return {
      content,
      usage: data.usage || undefined,
    };
  }
}
