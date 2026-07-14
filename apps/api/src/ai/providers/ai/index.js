// AI provider abstraction — swap LLM services without editing core code.
//
// Interface:
//   { name, isConfigured(), generate(prompt, opts) }
//
// Usage:
//   import { getAIProvider } from '../source/index.js';
//   const ai = await getAIProvider();
//   const result = await ai.generate('Write a cold email...', { json: true });

import { config } from '../../../config/config.js';

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
