import { BaseAIProvider } from './index.js';

export class OpenAIProvider extends BaseAIProvider {
  constructor(options = {}) {
    super({
      ...options,
      name: 'openai',
      endpoint: 'https://api.openai.com/v1/chat/completions',
    });
  }
}
