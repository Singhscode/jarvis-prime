// OpenAI provider — alternative AI provider.
// Ready to use when you want to switch from Groq to OpenAI.
//
// To activate:
//   1. Set AI_PROVIDER=openai in .env
//   2. Set OPENAI_API_KEY=sk-xxx in .env
//   3. Optionally set OPENAI_MODEL=gpt-4o-mini (default)

import { config } from '../../config.js';
import { BaseAIProvider, chatCompletion } from './index.js';

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
    const { model = config.openaiModel, ...rest } = opts;
    return chatCompletion({
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey: config.openaiApiKey,
      model,
      prompt,
      opts: rest,
      errorLabel: 'OpenAI',
    });
  }
}
