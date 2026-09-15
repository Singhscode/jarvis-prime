import { randomUUID } from 'node:crypto';
import { config } from '../../config/config.js';
import { log } from '../../utils/logger.js';
import {
  canUseAIFallback,
  executeStructuredAI,
  validateAIExecutionBoundary,
} from '../runtime.js';
import { getAIProvider, validateAIConfig } from '../providers/ai/index.js';
import { PERSONALIZATION_PROMPT_V1 } from './personalization-v1.js';

let cachedProvider = null;

async function resolveProvider(injectedProvider) {
  if (injectedProvider) return injectedProvider;
  const liveConfig = validateAIConfig(config);
  if (!liveConfig.apiKey.trim()) {
    const error = new Error('Selected AI credentials are missing.');
    error.code = 'AI_CONFIG_MISSING_CREDENTIALS';
    throw error;
  }
  if (!cachedProvider) cachedProvider = await getAIProvider();
  return cachedProvider;
}

function templateFor(step, prospect, client) {
  const first = prospect.first_name || (prospect.full_name || 'there').split(' ')[0];
  const company = prospect.company || 'your team';

  if (step <= 1) {
    return {
      subject: `quick question about ${company}'s pipeline`,
      body:
        `Hi ${first},\n\n` +
        `I help ${client?.icp_industries?.[0] || 'B2B'} teams like ${company} book more qualified sales meetings without adding headcount.\n\n` +
        `Worth a short chat to see if it's a fit? Happy to share how it works — no pressure either way.\n\n` +
        `Best,\n${config.fromName}`,
    };
  }

  if (step === 2) {
    return {
      subject: `re: ${company}'s pipeline`,
      body:
        `Hi ${first},\n\n` +
        `Following up on my note. Most teams I work with were spending hours prospecting manually before — I take that off your plate and just deliver booked meetings.\n\n` +
        `Open to a 15-min call this week?\n\n` +
        `Best,\n${config.fromName}`,
    };
  }

  return {
    subject: `last one, ${first}`,
    body:
      `Hi ${first},\n\n` +
      `I'll close the loop here so I'm not crowding your inbox. If booking more qualified meetings becomes a priority for ${company}, just reply and I'll pick it back up.\n\n` +
      `Wishing you a strong quarter,\n${config.fromName}`,
  };
}

function buildInput(step, prospect, client) {
  const firstName = prospect.first_name || (prospect.full_name || '').split(' ')[0];
  return {
    step,
    prospect: {
      clientId: prospect.client_id,
      fullName: prospect.full_name || firstName,
      firstName,
      title: prospect.title || '',
      company: prospect.company || '',
      industry: prospect.industry || '',
    },
    client: {
      id: client.id,
      name: client.name || 'JARVIS PRIME',
      primaryIndustry: client.icp_industries?.[0] || 'B2B',
    },
    fromName: config.fromName,
  };
}

/**
 * Produce an AI-assisted draft or a deterministic safe template.
 * Authorization, client scope, and input contracts are enforced before either path.
 * This function does not send messages or write data.
 */
export async function writeEmail(step, prospect, client, options = {}) {
  const fallback = () => templateFor(step, prospect, client);
  const clientId = client?.id;
  const prospectClientId = prospect?.client_id;
  const authorized = Boolean(clientId && prospectClientId && prospectClientId === clientId);
  const context = options.context || {
    requestId: options.requestId || randomUUID(),
    actorType: 'system',
    actorId: 'personalization-service',
    clientId: clientId || 'unavailable',
    authorized,
  };

  try {
    const contractStep = step === 4 || step === 5 ? 3 : step;
    const input = buildInput(contractStep, prospect, client);
    validateAIExecutionBoundary({ contract: PERSONALIZATION_PROMPT_V1, input, context });

    if (config.dryRun || options.dryRun === true) return fallback();

    const aiConfig = validateAIConfig(config, { requireCredentials: !options.provider });
    const provider = await resolveProvider(options.provider);
    if (!provider.isConfigured()) {
      const error = new Error('Selected AI provider is not configured.');
      error.code = 'provider_not_configured';
      throw error;
    }

    const result = await executeStructuredAI({
      provider,
      contract: PERSONALIZATION_PROMPT_V1,
      input,
      context,
      model: aiConfig.model,
      maxTokens: aiConfig.maxTokens,
      minimumConfidence: aiConfig.minimumConfidence,
      pricing: aiConfig.pricing,
      telemetry: options.telemetry,
    });

    return { subject: result.data.subject, body: result.data.body };
  } catch (error) {
    const code = error?.code || 'generation_failed';
    if (!canUseAIFallback(error)) {
      log.error(`AI personalization blocked code=${code}.`);
      throw error;
    }
    log.warn(`AI personalization degraded code=${code}; using reviewed template.`);
    return fallback();
  }
}
