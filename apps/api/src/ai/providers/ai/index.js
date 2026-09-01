import { z } from 'zod';
import { config } from '../../../config/config.js';

const optionalCost = z.preprocess(
  (value) => value === '' || value === undefined || value === null ? null : Number(value),
  z.number().nonnegative().nullable()
);

const aiConfigurationSchema = z.object({
  provider: z.enum(['groq', 'openai']),
  groqApiKey: z.string(),
  groqModel: z.string().trim().min(1).max(200),
  openaiApiKey: z.string(),
  openaiModel: z.string().trim().min(1).max(200),
  timeoutMs: z.coerce.number().int().min(1_000).max(120_000),
  maxTokens: z.coerce.number().int().min(1).max(8_192),
  minimumConfidence: z.coerce.number().min(0).max(1),
  inputCostPerMillion: optionalCost,
  outputCostPerMillion: optionalCost,
}).strict();

export const AIMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().trim().min(1).max(50_000),
}).strict();

export const AIRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(50_000).optional(),
  messages: z.array(AIMessageSchema).min(1).max(20).optional(),
  model: z.string().trim().min(1).max(200).optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().min(1).max(8_192).default(500),
  json: z.boolean().default(true),
}).strict().refine(
  (value) => Boolean(value.prompt) !== Boolean(value.messages),
  { message: 'Provide exactly one of prompt or messages.' }
).refine(
  (value) => !value.messages ||
    value.messages.reduce((length, message) => length + message.content.length, 0) <= 50_000,
  { message: 'Combined AI message content exceeds 50000 characters.', path: ['messages'] }
);

export const AIResultSchema = z.object({
  content: z.string().min(1),
  model: z.string().min(1),
  finishReason: z.string().nullable(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    totalTokens: z.number().int().nonnegative().nullable(),
  }).strict(),
}).strict();

const providerResponseSchema = z.object({
  model: z.string().optional(),
  choices: z.array(z.object({
    message: z.object({ content: z.string().trim().min(1) }).passthrough(),
    finish_reason: z.string().nullable().optional(),
  }).passthrough()).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
}).passthrough();

export class AIProviderError extends Error {
  constructor(code, message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = 'AIProviderError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function validateAIConfig(source = {}, { requireCredentials = true } = {}) {
  const result = aiConfigurationSchema.safeParse({
    provider: source.provider ?? source.aiProvider ?? config.aiProvider,
    groqApiKey: source.groqApiKey ?? config.groqApiKey ?? '',
    groqModel: source.groqModel ?? config.groqModel,
    openaiApiKey: source.openaiApiKey ?? config.openaiApiKey ?? '',
    openaiModel: source.openaiModel ?? config.openaiModel,
    timeoutMs: source.timeoutMs ?? process.env.AI_TIMEOUT_MS ?? 15_000,
    maxTokens: source.maxTokens ?? process.env.AI_MAX_TOKENS ?? 500,
    minimumConfidence: source.minimumConfidence ?? process.env.AI_MIN_CONFIDENCE ?? 0.65,
    inputCostPerMillion: source.inputCostPerMillion ?? process.env.AI_INPUT_COST_PER_MILLION,
    outputCostPerMillion: source.outputCostPerMillion ?? process.env.AI_OUTPUT_COST_PER_MILLION,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    const error = new Error(`Invalid AI configuration: ${details}`);
    error.code = 'AI_CONFIG_INVALID';
    throw error;
  }

  const values = result.data;
  const apiKey = values.provider === 'groq' ? values.groqApiKey : values.openaiApiKey;
  if (requireCredentials && !apiKey) {
    const variable = values.provider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY';
    const error = new Error(`Missing required AI environment variable: ${variable}.`);
    error.code = 'AI_CONFIG_MISSING_CREDENTIALS';
    throw error;
  }

  const hasPricing = values.inputCostPerMillion !== null && values.outputCostPerMillion !== null;
  return Object.freeze({
    provider: values.provider,
    apiKey,
    model: values.provider === 'groq' ? values.groqModel : values.openaiModel,
    timeoutMs: values.timeoutMs,
    maxTokens: values.maxTokens,
    minimumConfidence: values.minimumConfidence,
    pricing: hasPricing ? Object.freeze({
      inputPerMillion: values.inputCostPerMillion,
      outputPerMillion: values.outputCostPerMillion,
    }) : null,
  });
}

export class BaseAIProvider {
  constructor({
    name,
    endpoint,
    apiKey,
    model,
    timeoutMs,
    maxTokens = 500,
    minimumConfidence = 0.65,
    pricing = null,
    fetchImpl = globalThis.fetch,
  }) {
    if (typeof fetchImpl !== 'function') {
      throw new AIProviderError('provider_unavailable', 'AI transport is unavailable.');
    }

    this.name = name;
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.settings = Object.freeze({ model, maxTokens, minimumConfidence, pricing });
  }

  isConfigured() {
    return Boolean(this.apiKey && this.model);
  }

  async generate(rawRequest) {
    const request = AIRequestSchema.parse(rawRequest);
    if (!this.isConfigured()) {
      throw new AIProviderError('provider_not_configured', `${this.name} is not configured.`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;

    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model || this.model,
          messages: request.messages || [{ role: 'user', content: request.prompt }],
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          ...(request.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new AIProviderError('provider_timeout', `${this.name} request timed out.`, {
          retryable: true,
        });
      }
      throw new AIProviderError('provider_unavailable', `${this.name} is unavailable.`, {
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        throw new AIProviderError('rate_limited', `${this.name} rate limit reached.`, {
          status,
          retryable: true,
        });
      }
      if (status === 401 || status === 403) {
        throw new AIProviderError('provider_auth_failed', `${this.name} credentials were rejected.`, {
          status,
        });
      }
      if (status >= 500) {
        throw new AIProviderError('provider_unavailable', `${this.name} is unavailable.`, {
          status,
          retryable: true,
        });
      }
      throw new AIProviderError('provider_rejected', `${this.name} rejected the request.`, { status });
    }

    let payload;
    try {
      payload = providerResponseSchema.parse(await response.json());
    } catch {
      throw new AIProviderError('invalid_provider_response', `${this.name} returned an invalid response.`);
    }

    const choice = payload.choices[0];
    const usage = payload.usage || {};
    return AIResultSchema.parse({
      content: choice.message.content,
      model: payload.model || request.model || this.model,
      finishReason: choice.finish_reason ?? null,
      usage: {
        inputTokens: usage.prompt_tokens ?? null,
        outputTokens: usage.completion_tokens ?? null,
        totalTokens: usage.total_tokens ?? null,
      },
    });
  }
}

export async function getAIProvider({ providerName, fetchImpl } = {}) {
  const aiConfig = validateAIConfig(providerName ? { provider: providerName } : {});

  if (aiConfig.provider === 'openai') {
    const { OpenAIProvider } = await import('./openai.js');
    return new OpenAIProvider({ ...aiConfig, fetchImpl });
  }

  const { GroqProvider } = await import('./groq.js');
  return new GroqProvider({ ...aiConfig, fetchImpl });
}
