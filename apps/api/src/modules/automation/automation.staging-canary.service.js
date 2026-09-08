import { config } from '../../config/config.js';
import * as repository from './automation.execution.repository.js';

export const STAGING_CANARY_RECIPE_CODE = 'RCP_STAGING_CANARY';
export const STAGING_CANARY_PROJECT_REF = 'ygflbvplksgljlamhbju';
const STAGING_CANARY_HOSTNAME = `${STAGING_CANARY_PROJECT_REF}.supabase.co`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_EVENT = /^CANARY_[A-Z0-9][A-Z0-9_-]{7,110}$/;

function invalid() { throw new Error('AUTOMATION_CANARY_INVALID'); }
function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) invalid();
  return value;
}
function uuid(value) { if (typeof value !== 'string' || !UUID.test(value)) invalid(); return value; }
function sourceEvent(value) { if (typeof value !== 'string' || !SOURCE_EVENT.test(value)) invalid(); return value; }
function dueAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) invalid();
  return date.toISOString();
}

export function resolveStagingCanaryRuntimeConfig(values = {
  runtimeTarget: config.phase11RuntimeTarget,
  supabaseUrl: config.supabaseUrl,
  supabaseKey: config.supabaseKey,
}) {
  if (values?.runtimeTarget !== 'staging') throw new Error('AUTOMATION_CANARY_STAGING_RUNTIME_REQUIRED');
  if (typeof values.supabaseUrl !== 'string' || !values.supabaseUrl || typeof values.supabaseKey !== 'string' || !values.supabaseKey) {
    throw new Error('AUTOMATION_CANARY_STAGING_CONFIG_REQUIRED');
  }
  let target;
  try { target = new URL(values.supabaseUrl); } catch { throw new Error('AUTOMATION_CANARY_STAGING_TARGET_INVALID'); }
  const projectRef = target.hostname.endsWith('.supabase.co')
    ? target.hostname.slice(0, -'.supabase.co'.length)
    : '';
  if (target.protocol !== 'https:' || target.hostname !== STAGING_CANARY_HOSTNAME || projectRef !== STAGING_CANARY_PROJECT_REF || target.username || target.password) {
    throw new Error('AUTOMATION_CANARY_STAGING_TARGET_INVALID');
  }
  return Object.freeze({
    runtimeTarget: 'staging',
    projectRef,
    supabaseUrl: values.supabaseUrl,
    supabaseKey: values.supabaseKey,
  });
}

export function buildStagingCanaryRequest(values) {
  const request = exact(values, ['ownerUserId', 'actorUserId', 'sourceEventId', 'dueAt']);
  return Object.freeze({
    ownerUserId: uuid(request.ownerUserId),
    actorUserId: uuid(request.actorUserId),
    sourceEventId: sourceEvent(request.sourceEventId),
    dueAt: dueAt(request.dueAt),
  });
}

export function assertStagingCanaryLineage(history) {
  const work = history?.workItems;
  const eventCodes = new Set((history?.events || []).map((event) => event.code));
  if (!Array.isArray(work) || work.length !== 1 || work[0].actionCode !== 'ACT_INTERNAL_FAKE' || work[0].state !== 'COMPLETED'
      || work[0]?.result?.mode !== 'INTERNAL_FAKE_CANARY'
      || !eventCodes.has('RECIPE_ADMITTED') || !eventCodes.has('FUTURE_TRIGGER_RESOLVED')) {
    throw new Error('AUTOMATION_CANARY_LINEAGE_INVALID');
  }
  return Object.freeze({ runId: history.run?.id, workItemId: work[0].id, state: work[0].state });
}

export function createStagingCanary({ runCanary = repository.runStagingCanary, getRunHistory = repository.getRunHistory, runtimeConfig, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const assertRuntime = () => resolveStagingCanaryRuntimeConfig(runtimeConfig);
  return Object.freeze({
    async admit(values) { assertRuntime(); return runCanary(buildStagingCanaryRequest(values)); },
    async awaitCompletion({ ownerUserId, runId, timeoutMs = 90_000, pollMs = 1_000 }) {
      assertRuntime();
      const owner = uuid(ownerUserId);
      if (typeof runId !== 'string' || !UUID.test(runId) || !Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000 || !Number.isInteger(pollMs) || pollMs < 250 || pollMs > 5_000) invalid();
      const deadline = Date.now() + timeoutMs;
      while (Date.now() <= deadline) {
        const history = await getRunHistory(owner, runId);
        try { return assertStagingCanaryLineage({ ...history, run: { id: runId } }); } catch (error) {
          if (error.message !== 'AUTOMATION_CANARY_LINEAGE_INVALID') throw error;
        }
        await sleep(pollMs);
      }
      throw new Error('AUTOMATION_CANARY_TIMEOUT');
    },
  });
}
