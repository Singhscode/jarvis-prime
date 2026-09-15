import { BaseAIProvider } from './index.js';

export class GroqProvider extends BaseAIProvider {
  constructor(options = {}) {
    super({
      ...options,
      name: 'groq',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    });
  }
}
