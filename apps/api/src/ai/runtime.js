import { log } from '../utils/logger.js';
import { AIProviderError } from './providers/ai/index.js';

function isOpaqueRequestId(value) {
  return typeof value === 'string' &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

export const AIExecutionContextSchema = {
  safeParse(value) {
    const valid = value &&
      isOpaqueRequestId(value.requestId) &&
      ['user', 'system'].includes(value.actorType) &&
      typeof value.actorId === 'string' && value.actorId.trim().length > 0 && value.actorId.length <= 128 &&
      typeof value.clientId === 'string' && value.clientId.trim().length > 0 && value.clientId.length <= 128 &&
      value.authorized === true &&
      Object.keys(value).every((key) => ['requestId', 'actorType', 'actorId', 'clientId', 'authorized'].includes(key));
    return valid ? { success: true, data: Object.freeze({ ...value }) } : { success: false };
  },
};

export class AIExecutionError extends Error {
  constructor(code, message, { retryable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AIExecutionError';
    this.code = code;
    this.retryable = retryable;
  }
}

const SAFE_DEGRADATION_CODES = new Set([
  'rate_limited',
  'provider_timeout',
  'provider_unavailable',
  'provider_rejected',
  'invalid_provider_response',
  'invalid_output',
  'unsafe_output',
  'low_confidence',
  'policy_violation',
]);

export function canUseAIFallback(error) {
  return error instanceof AIExecutionError && SAFE_DEGRADATION_CODES.has(error.code);
}

function normalizeError(error) {
  if (error instanceof AIExecutionError) return error;
  if (error instanceof AIProviderError) {
    return new AIExecutionError(error.code, error.message, {
      retryable: error.retryable,
      cause: error,
    });
  }
  if (error instanceof SyntaxError) {
    return new AIExecutionError('invalid_output', 'AI output was not valid JSON.', { cause: error });
  }
  return new AIExecutionError('generation_failed', 'AI generation failed.', { cause: error });
}

function estimateCost(usage, pricing) {
  if (!pricing || usage?.inputTokens === null || usage?.outputTokens === null || !usage) return null;
  const input = (usage.inputTokens / 1_000_000) * pricing.inputPerMillion;
  const output = (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Number((input + output).toFixed(8));
}

function defaultTelemetry(event) {
  log.info(`AI generation ${JSON.stringify(event)}`);
}

function emitSafely(emit, event) {
  try {
    emit(event);
  } catch {
    log.warn('AI telemetry emission failed.');
  }
}

export function validateAIExecutionBoundary({ contract, input, context }) {
  if (context?.authorized !== true) {
    throw new AIExecutionError('authorization_denied', 'AI execution is not authorized.');
  }

  const contextResult = AIExecutionContextSchema.safeParse(context);
  if (!contextResult.success) {
    throw new AIExecutionError('invalid_context', 'AI execution context is invalid.');
  }

  const inputResult = contract.inputSchema.safeParse(input);
  if (!inputResult.success) {
    throw new AIExecutionError('invalid_input', 'AI input failed schema validation.');
  }

  const safeContext = contextResult.data;
  const safeInput = inputResult.data;
  if (safeInput.client?.id !== safeContext.clientId ||
      safeInput.prospect?.clientId !== safeContext.clientId) {
    throw new AIExecutionError('scope_mismatch', 'AI execution scope does not match the client.');
  }

  return Object.freeze({ context: safeContext, input: safeInput });
}

export async function executeStructuredAI({
  provider,
  contract,
  input,
  context,
  model,
  temperature = 0.2,
  maxTokens = 500,
  minimumConfidence = 0.65,
  pricing = null,
  telemetry = defaultTelemetry,
}) {
  const startedAt = Date.now();
  let safeContext;
  let providerResult;

  try {
    const boundary = validateAIExecutionBoundary({ contract, input, context });
    safeContext = boundary.context;
    const safeInput = boundary.input;

    const messages = contract.buildMessages(safeInput);

    providerResult = await provider.generate({
      messages,
      model,
      temperature,
      maxTokens,
      json: true,
    });

    let rawOutput;
    try {
      rawOutput = JSON.parse(providerResult.content);
    } catch (error) {
      throw new AIExecutionError('invalid_output', 'AI output was not valid JSON.', { cause: error });
    }

    const outputResult = contract.outputSchema.safeParse(rawOutput);
    if (!outputResult.success) {
      throw new AIExecutionError('invalid_output', 'AI output failed schema validation.');
    }
    const output = outputResult.data;

    if (!output.safe) {
      throw new AIExecutionError('unsafe_output', 'AI output was rejected by the safety contract.');
    }
    if (output.confidence < minimumConfidence) {
      throw new AIExecutionError('low_confidence', 'AI output was below the confidence threshold.');
    }

    const policy = contract.validateOutput?.(output, safeInput);
    if (policy && !policy.accepted) {
      throw new AIExecutionError('policy_violation', 'AI output failed deterministic policy checks.');
    }

    const usage = providerResult.usage;
    emitSafely(telemetry, {
      event: 'ai_generation',
      outcome: 'accepted',
      requestId: safeContext.requestId,
      provider: provider.name,
      model: providerResult.model,
      promptId: contract.id,
      promptVersion: contract.version,
      latencyMs: Date.now() - startedAt,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: estimateCost(usage, pricing),
      errorCode: null,
      retryable: false,
    });

    return Object.freeze({ data: output, model: providerResult.model, usage });
  } catch (error) {
    const normalized = normalizeError(error);
    const usage = providerResult?.usage;
    emitSafely(telemetry, {
      event: 'ai_generation',
      outcome: 'rejected',
      requestId: safeContext?.requestId || 'unavailable',
      provider: provider?.name || 'unavailable',
      model: providerResult?.model || model || provider?.model || 'unavailable',
      promptId: contract?.id || 'unavailable',
      promptVersion: contract?.version || 'unavailable',
      latencyMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens ?? null,
      outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
      estimatedCostUsd: usage ? estimateCost(usage, pricing) : null,
      errorCode: normalized.code,
      retryable: normalized.retryable,
    });
    throw normalized;
  }
}
