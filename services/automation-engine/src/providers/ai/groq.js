// Groq AI provider — implements the AI provider interface.
// Extracted from ai/personalizer.js for provider abstraction.

import { config } from '../../config.js';
import { BaseAIProvider, chatCompletion } from './index.js';

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
    const { model = config.groqModel, ...rest } = opts;
    return chatCompletion({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: config.groqApiKey,
      model,
      prompt,
      opts: rest,
      errorLabel: 'Groq',
    });
  }
}
