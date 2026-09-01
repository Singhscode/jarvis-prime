import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { config } from '../src/config/config.js';
import {
  AIProviderError,
  validateAIConfig,
} from '../src/ai/providers/ai/index.js';
import { GroqProvider } from '../src/ai/providers/ai/groq.js';
import { OpenAIProvider } from '../src/ai/providers/ai/openai.js';
import { executeStructuredAI } from '../src/ai/runtime.js';
import {
  PERSONALIZATION_EVALUATIONS_V1,
  PERSONALIZATION_PROMPT_V1,
} from '../src/ai/prompts/personalization-v1.js';
import { writeEmail } from '../src/ai/prompts/personalizer.js';

const input = {
  step: 1,
  prospect: {
    clientId: 'client-1',
    fullName: 'Taylor Morgan',
    firstName: 'Taylor',
    title: 'Head of Sales',
    company: 'Example Systems',
    industry: 'B2B software',
  },
  client: {
    id: 'client-1',
    name: 'Example Agency',
    primaryIndustry: 'B2B software',
  },
  fromName: 'Alex',
};

const context = {
  requestId: 'request-1',
  actorType: 'system',
  actorId: 'test-runner',
  clientId: 'client-1',
  authorized: true,
};

const validDraft = {
  subject: 'A quick question',
  body: 'Hi Taylor, would a short conversation about your sales workflow be useful? Best, Alex',
  confidence: 0.9,
  safe: true,
};

function fakeProvider(content = validDraft, overrides = {}) {
  let calls = 0;
  return {
    name: 'fake',
    model: 'test-model',
    settings: {
      model: 'test-model',
      maxTokens: 500,
      minimumConfidence: 0.65,
      pricing: null,
    },
    isConfigured: () => true,
    async generate() {
      calls += 1;
      if (overrides.error) throw overrides.error;
      return {
        content: typeof content === 'string' ? content : JSON.stringify(content),
        model: 'test-model',
        finishReason: 'stop',
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      };
    },
    get calls() { return calls; },
  };
}

function successfulResponse(model = 'provider-model', content = validDraft) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        model,
        choices: [{
          message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      };
    },
  };
}

async function execute(provider, overrides = {}) {
  return executeStructuredAI({
    provider,
    contract: PERSONALIZATION_PROMPT_V1,
    input,
    context,
    model: 'test-model',
    maxTokens: 500,
    minimumConfidence: 0.65,
    ...overrides,
  });
}

describe('AI configuration', () => {
  test('rejects unsupported providers and malformed safety controls', () => {
    assert.throws(
      () => validateAIConfig({ provider: 'unsupported', timeoutMs: 10, maxTokens: 0 }),
      { code: 'AI_CONFIG_INVALID' }
    );
  });

  test('requires credentials for the selected live provider', () => {
    assert.throws(
      () => validateAIConfig({
        provider: 'openai',
        openaiApiKey: '',
        openaiModel: 'test-model',
        groqApiKey: '',
        groqModel: 'test-model',
      }),
      { code: 'AI_CONFIG_MISSING_CREDENTIALS' }
    );
  });

  test('normalizes validated server-only controls', () => {
    const value = validateAIConfig({
      provider: 'groq',
      groqApiKey: 'server-secret',
      groqModel: 'test-model',
      openaiApiKey: '',
      openaiModel: 'other-model',
      timeoutMs: '5000',
      maxTokens: '400',
      minimumConfidence: '0.75',
      inputCostPerMillion: '1',
      outputCostPerMillion: '2',
    });

    assert.equal(value.provider, 'groq');
    assert.equal(value.model, 'test-model');
    assert.equal(value.timeoutMs, 5000);
    assert.equal(value.minimumConfidence, 0.75);
    assert.deepEqual(value.pricing, { inputPerMillion: 1, outputPerMillion: 2 });
  });
});

describe('AI providers', () => {
  for (const [name, Provider] of [['groq', GroqProvider], ['openai', OpenAIProvider]]) {
    test(`${name} uses the normalized provider contract`, async () => {
      let request;
      const provider = new Provider({
        apiKey: 'server-secret',
        model: 'configured-model',
        timeoutMs: 5_000,
        fetchImpl: async (url, init) => {
          request = { url, init };
          return successfulResponse(`${name}-model`);
        },
      });

      const result = await provider.generate({ prompt: 'Return JSON.', maxTokens: 100 });
      const body = JSON.parse(request.init.body);

      assert.match(request.url, name === 'groq' ? /groq/ : /openai/);
      assert.equal(body.model, 'configured-model');
      assert.deepEqual(body.response_format, { type: 'json_object' });
      assert.equal(result.model, `${name}-model`);
      assert.deepEqual(result.usage, { inputTokens: 20, outputTokens: 10, totalTokens: 30 });
    });
  }

  test('classifies rate limiting without exposing the provider response', async () => {
    const provider = new GroqProvider({
      apiKey: 'server-secret',
      model: 'test-model',
      timeoutMs: 5_000,
      fetchImpl: async () => ({ ok: false, status: 429 }),
    });

    await assert.rejects(
      provider.generate({ prompt: 'Return JSON.' }),
      (error) => error instanceof AIProviderError &&
        error.code === 'rate_limited' &&
        error.retryable === true
    );
  });

  test('classifies transport failures as retryable provider failures', async () => {
    const provider = new OpenAIProvider({
      apiKey: 'server-secret',
      model: 'test-model',
      timeoutMs: 5_000,
      fetchImpl: async () => { throw new Error('sensitive transport detail'); },
    });

    await assert.rejects(
      provider.generate({ prompt: 'Return JSON.' }),
      (error) => error.code === 'provider_unavailable' &&
        error.retryable === true &&
        !error.message.includes('sensitive transport detail')
    );
  });
  test('classifies empty successful responses as invalid provider output', async () => {
    const provider = new GroqProvider({
      apiKey: 'server-secret',
      model: 'test-model',
      timeoutMs: 5_000,
      fetchImpl: async () => successfulResponse('test-model', ''),
    });

    await assert.rejects(
      provider.generate({ prompt: 'Return JSON.' }),
      { code: 'invalid_provider_response' }
    );
  });
});

describe('Versioned prompt contract', () => {
  test('has reviewable version metadata and deterministic evaluation inputs', () => {
    assert.equal(PERSONALIZATION_PROMPT_V1.id, 'personalization-email');
    assert.equal(PERSONALIZATION_PROMPT_V1.version, '1.0.0');
    assert.ok(PERSONALIZATION_EVALUATIONS_V1.length >= 2);

    for (const evaluation of PERSONALIZATION_EVALUATIONS_V1) {
      assert.doesNotThrow(() => PERSONALIZATION_PROMPT_V1.inputSchema.parse(evaluation.input));
      const prompt = PERSONALIZATION_PROMPT_V1.buildMessages(evaluation.input)
        .map(({ content }) => content)
        .join('\n');
      assert.match(prompt, /personalization-email@1\.0\.0/);
      assert.doesNotMatch(prompt, /undefined/);
    }
  });
});

describe('Controlled structured execution', () => {
  test('accepts schema-valid, safe, sufficiently confident output', async () => {
    const events = [];
    const result = await execute(fakeProvider(), {
      telemetry: (event) => events.push(event),
      pricing: { inputPerMillion: 1, outputPerMillion: 2 },
    });

    assert.equal(result.data.subject, validDraft.subject);
    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'accepted');
    assert.equal(events[0].promptVersion, '1.0.0');
    assert.equal(events[0].estimatedCostUsd, 0.00004);
  });

  test('preserves trusted system and untrusted user message roles', async () => {
    let request;
    const provider = fakeProvider();
    const generate = provider.generate.bind(provider);
    provider.generate = async (value) => {
      request = value;
      return generate(value);
    };

    await execute(provider);

    assert.deepEqual(request.messages.map(({ role }) => role), ['system', 'user']);
    assert.equal('prompt' in request, false);
    assert.doesNotMatch(request.messages[0].content, /Taylor Morgan|Example Systems/);
    assert.match(request.messages[1].content, /Taylor Morgan|Example Systems/);
  });

  test('rejects unauthorized execution before calling the provider', async () => {
    const provider = fakeProvider();
    await assert.rejects(
      execute(provider, { context: { ...context, authorized: false } }),
      { code: 'authorization_denied' }
    );
    assert.equal(provider.calls, 0);
  });

  test('rejects cross-client scope before calling the provider', async () => {
    const provider = fakeProvider();
    await assert.rejects(
      execute(provider, { context: { ...context, clientId: 'client-2' } }),
      { code: 'scope_mismatch' }
    );
    assert.equal(provider.calls, 0);
  });

  test('rejects invalid JSON and schema-invalid output', async () => {
    await assert.rejects(execute(fakeProvider('not-json')), { code: 'invalid_output' });
    await assert.rejects(
      execute(fakeProvider({ subject: 'Missing fields', body: 'Incomplete' })),
      { code: 'invalid_output' }
    );
  });

  test('rejects unsafe and low-confidence output', async () => {
    await assert.rejects(
      execute(fakeProvider({ ...validDraft, safe: false, safetyReason: 'Unverified claim' })),
      { code: 'unsafe_output' }
    );
    await assert.rejects(
      execute(fakeProvider({ ...validDraft, confidence: 0.4 })),
      { code: 'low_confidence' }
    );
  });

  test('emits only allowlisted telemetry fields', async () => {
    const events = [];
    await execute(fakeProvider(), { telemetry: (event) => events.push(event) });

    const serialized = JSON.stringify(events);
    assert.doesNotMatch(serialized, /Taylor Morgan|Example Systems|server-secret|A quick question/);
    assert.deepEqual(Object.keys(events[0]).sort(), [
      'errorCode', 'estimatedCostUsd', 'event', 'inputTokens', 'latencyMs', 'model',
      'outcome', 'outputTokens', 'promptId', 'promptVersion', 'provider', 'requestId',
      'retryable', 'totalTokens',
    ].sort());
  });

  test('preserves safe provider failure classification in telemetry', async () => {
    const events = [];
    const provider = fakeProvider(validDraft, {
      error: new AIProviderError('rate_limited', 'Provider rate limit reached.', { retryable: true }),
    });

    await assert.rejects(
      execute(provider, { telemetry: (event) => events.push(event) }),
      { code: 'rate_limited' }
    );
    assert.equal(events[0].errorCode, 'rate_limited');
    assert.equal(events[0].retryable, true);
  });
});

describe('Personalization fallback boundary', () => {
  test('uses the deterministic template when structured output is invalid', async () => {
    const originalDryRun = config.dryRun;
    config.dryRun = false;
    try {
      const draft = await writeEmail(
        1,
        {
          client_id: 'client-1',
          full_name: 'Taylor Morgan',
          first_name: 'Taylor',
          company: 'Example Systems',
          title: 'Head of Sales',
          industry: 'B2B software',
        },
        { id: 'client-1', name: 'Example Agency', icp_industries: ['B2B software'] },
        { provider: fakeProvider('not-json') }
      );

      assert.match(draft.subject, /Example Systems/);
      assert.match(draft.body, /Hi Taylor/);
    } finally {
      config.dryRun = originalDryRun;
    }
  });

  test('does not call the provider when client scope is unauthorized', async () => {
    const originalDryRun = config.dryRun;
    const provider = fakeProvider();
    config.dryRun = false;
    try {
      await assert.rejects(
        writeEmail(
          1,
          {
            client_id: 'other-client',
            full_name: 'Taylor Morgan',
            first_name: 'Taylor',
            company: 'Example Systems',
          },
          { id: 'client-1', name: 'Example Agency', icp_industries: ['B2B'] },
          { provider }
        ),
        { code: 'authorization_denied' }
      );

      assert.equal(provider.calls, 0);
    } finally {
      config.dryRun = originalDryRun;
    }
  });

  test('enforces client scope before returning a dry-run template', async () => {
    const originalDryRun = config.dryRun;
    const provider = fakeProvider();
    config.dryRun = true;
    try {
      await assert.rejects(
        writeEmail(
          1,
          {
            full_name: 'Taylor Morgan',
            first_name: 'Taylor',
            company: 'Example Systems',
          },
          { id: 'client-1', name: 'Example Agency', icp_industries: ['B2B'] },
          { provider }
        ),
        { code: 'authorization_denied' }
      );
      assert.equal(provider.calls, 0);
    } finally {
      config.dryRun = originalDryRun;
    }
  });

  test('maps campaign steps four and five to the reviewed close-loop contract', async () => {
    const originalDryRun = config.dryRun;
    const provider = fakeProvider();
    config.dryRun = false;
    try {
      const draft = await writeEmail(
        5,
        {
          client_id: 'client-1',
          full_name: 'Taylor Morgan',
          first_name: 'Taylor',
          company: 'Example Systems',
        },
        { id: 'client-1', name: 'Example Agency', icp_industries: ['B2B'] },
        { provider }
      );
      assert.equal(draft.subject, validDraft.subject);
      assert.equal(provider.calls, 1);
    } finally {
      config.dryRun = originalDryRun;
    }
  });

  test('fails closed for unclassified generation errors', async () => {
    const originalDryRun = config.dryRun;
    const provider = fakeProvider(validDraft, { error: new Error('unexpected failure') });
    config.dryRun = false;
    try {
      await assert.rejects(
        writeEmail(
          1,
          {
            client_id: 'client-1',
            full_name: 'Taylor Morgan',
            first_name: 'Taylor',
            company: 'Example Systems',
          },
          { id: 'client-1', name: 'Example Agency', icp_industries: ['B2B'] },
          { provider }
        ),
        { code: 'generation_failed' }
      );
      assert.equal(provider.calls, 1);
    } finally {
      config.dryRun = originalDryRun;
    }
  });
});
