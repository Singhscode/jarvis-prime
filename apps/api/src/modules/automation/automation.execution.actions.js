import * as crm from '../crm/crm.service.js';
import * as communications from '../communications/communications.service.js';
import { communicationEmailDeliveryEnabled } from '../communications/communications.delivery.js';
import { assertActionCode, assertObject, byteLength, MAX } from './automation.execution.validation.js';
import { config } from '../../config/config.js';
import { APOLLO_ACTION_CODE, APOLLO_PROVIDER_CODE, createApolloReadOnlyAdapterRegistry } from './automation.apollo-read.adapter.js';

const OUTCOME_FIELDS = Object.freeze(['safeMetadata']);
const RESULT_KEY = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;
const SENSITIVE_RESULT_KEY = /pass(word)?|token|secret|authorization|cookie|header|credential|api_?key|payload|input|email|name/i;

function outcomeInvalid() {
  const error = new Error('AUTOMATION_ACTION_OUTCOME_INVALID');
  error.code = 'AUTOMATION_ACTION_OUTCOME_INVALID';
  error.automationOutcome = 'HUMAN_REVIEW';
  error.knownOutcome = true;
  return error;
}
function plainObject(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw outcomeInvalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw outcomeInvalid();
  return value;
}
function normalizeMetadataValue(value, depth = 0) {
  if (depth > 4) throw outcomeInvalid();
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw outcomeInvalid();
    return value;
  }
  if (typeof value === 'string') return value.length <= 256 ? value : '[REDACTED]';
  if (Array.isArray(value)) {
    if (value.length > 20) throw outcomeInvalid();
    return value.map((entry) => normalizeMetadataValue(entry, depth + 1));
  }
  const object = plainObject(value);
  const entries = Object.entries(object);
  if (entries.length > 100) throw outcomeInvalid();
  return Object.fromEntries(entries.map(([key, entry]) => {
    if (!RESULT_KEY.test(key)) throw outcomeInvalid();
    return [key, SENSITIVE_RESULT_KEY.test(key) ? '[REDACTED]' : normalizeMetadataValue(entry, depth + 1)];
  }));
}

/** Normalizes the only result shape that can enter durable work history. */
export function normalizeActionMetadata(value) {
  const metadata = normalizeMetadataValue(plainObject(value));
  try {
    if (byteLength(metadata) > MAX.metadataBytes) throw outcomeInvalid();
  } catch (error) {
    if (error?.code === 'AUTOMATION_ACTION_OUTCOME_INVALID') throw error;
    throw outcomeInvalid();
  }
  return Object.freeze(metadata);
}
export function normalizeActionOutcome(value) {
  const outcome = plainObject(value);
  if (Object.keys(outcome).some((key) => !OUTCOME_FIELDS.includes(key)) || !Object.hasOwn(outcome, 'safeMetadata')) throw outcomeInvalid();
  return Object.freeze({ safeMetadata: normalizeActionMetadata(outcome.safeMetadata) });
}

function context(value) {
  if (!value?.ownerUserId || !value?.actorUserId || !value?.workItemId) throw new Error('AUTOMATION_INVALID_ACTION_CONTEXT');
  return value;
}
function executionKey(workItemId) { return `automation:${workItemId}`; }
function exact(input, fields, code) {
  if (Object.keys(input).some((key) => !fields.includes(key))) throw new Error(code);
  return input;
}
function knownConflict() {
  const error = new Error('AUTOMATION_RECONCILIATION_CONFLICT');
  error.code = 'CONFLICT'; error.knownOutcome = true;
  return error;
}
function matchesTask(task, desired) {
  return task && Object.entries(desired).every(([key, value]) => task[key] === value);
}
async function updateWithReconciliation(crmApi, execution, projectId, taskId, desired) {
  try {
    await crmApi.updateTask(execution.ownerUserId, projectId, taskId, desired);
  } catch (error) {
    let task;
    try { task = (await crmApi.listTasks(execution.ownerUserId, projectId)).find((candidate) => candidate.id === taskId); } catch { throw error; }
    if (matchesTask(task, desired)) return { reconciled: true };
    if (task) throw knownConflict();
    throw error;
  }
  return { reconciled: false };
}

export function createActionRegistry({ crmApi = crm, communicationsApi = communications, emailDeliveryEnabled = communicationEmailDeliveryEnabled } = {}) {
  async function assign(value) {
    const execution = context(value);
    const input = exact(assertObject(execution.input, 'ASSIGN_INPUT'), ['projectId', 'taskId', 'employeeUserId'], 'AUTOMATION_INVALID_ASSIGN_INPUT');
    if (!input.projectId || !input.taskId || !input.employeeUserId) throw new Error('AUTOMATION_INVALID_ASSIGN_INPUT');
    const reconciliation = await updateWithReconciliation(crmApi, execution, input.projectId, input.taskId, { assigned_user_id: input.employeeUserId });
    return { safeMetadata: { mode: 'ASSIGN', reconciled: reconciliation.reconciled } };
  }
  async function task(value) {
    const execution = context(value);
    const input = assertObject(execution.input, 'TASK_INPUT');
    if (input.mode === 'UPDATE') {
      exact(input, ['mode', 'projectId', 'taskId', 'patch'], 'AUTOMATION_INVALID_TASK_INPUT');
      if (!input.projectId || !input.taskId || !input.patch || typeof input.patch !== 'object' || Array.isArray(input.patch)) throw new Error('AUTOMATION_INVALID_TASK_INPUT');
      const reconciliation = await updateWithReconciliation(crmApi, execution, input.projectId, input.taskId, input.patch);
      return { safeMetadata: { mode: 'UPDATE', reconciled: reconciliation.reconciled } };
    }
    if (input.mode === 'CREATE') {
      exact(input, ['mode', 'projectId', 'name'], 'AUTOMATION_INVALID_TASK_INPUT');
      if (!input.projectId || !input.name) throw new Error('AUTOMATION_INVALID_TASK_INPUT');
      // CRM create has no durable locator; uncertain post-dispatch outcomes remain HUMAN_REVIEW.
      await crmApi.createTask(execution.ownerUserId, input.projectId, { name: input.name });
      return { safeMetadata: { mode: 'CREATE', reconciled: false } };
    }
    throw new Error('AUTOMATION_INVALID_TASK_MODE');
  }
  async function notify(value) {
    const execution = context(value);
    const input = assertObject(execution.input, 'NOTIFY_INPUT');
    if (emailDeliveryEnabled) throw new Error('AUTOMATION_NOTIFY_EMAIL_DISABLED');
    const key = executionKey(execution.workItemId);
    if (input.mode === 'CREATE_THREAD') {
      exact(input, ['mode', 'subject', 'body', 'participants'], 'AUTOMATION_INVALID_NOTIFY_INPUT');
      if (execution.actorKind !== 'owner' || !input.subject || !input.body || !Array.isArray(input.participants)) throw new Error('AUTOMATION_NOTIFY_OWNER_REQUIRED');
      await communicationsApi.createThread(execution.actorUserId, { subject: input.subject, body: input.body, participants: input.participants }, key);
      return { safeMetadata: { mode: 'CREATE_THREAD' } };
    }
    if (input.mode === 'SEND_MESSAGE') {
      exact(input, ['mode', 'threadId', 'body'], 'AUTOMATION_INVALID_NOTIFY_INPUT');
      if (!input.threadId || !input.body) throw new Error('AUTOMATION_INVALID_NOTIFY_INPUT');
      await communicationsApi.sendMessage(execution.actorUserId, input.threadId, { body: input.body }, [], key);
      return { safeMetadata: { mode: 'SEND_MESSAGE' } };
    }
    throw new Error('AUTOMATION_INVALID_NOTIFY_MODE');
  }
  return Object.freeze({ ACT_ASSIGN: assign, ACT_TASK: task, ACT_NOTIFY: notify });
}

const registry = createActionRegistry();
const externalRegistry = createApolloReadOnlyAdapterRegistry();

/**
 * Resolves only server-composed, fixed action/provider pairs. Apollo is read-only
 * and delegates to the Step 6A adapter; all other external providers remain disabled.
 */
export function createActionResolver({ internalRegistry = registry, providerRegistry = externalRegistry, enableApolloReadOnly = config.phase11ApolloReadEnabled } = {}) {
  return (actionCode, providerCode = 'INTERNAL') => {
    assertActionCode(actionCode);
    if (providerCode === 'INTERNAL' && Object.hasOwn(internalRegistry, actionCode)) return internalRegistry[actionCode];
    if (enableApolloReadOnly === true && providerCode === APOLLO_PROVIDER_CODE && actionCode === APOLLO_ACTION_CODE) {
      const action = async (context) => providerRegistry.execute({
        providerCode: APOLLO_PROVIDER_CODE,
        actionCode: APOLLO_ACTION_CODE,
        ownerUserId: context.ownerUserId,
        runId: context.runId,
        workItemId: context.workItemId,
        correlationId: context.correlationId,
        input: context.input,
      });
      action.rateConcurrencyGroup = 'APOLLO_READ';
      return action;
    }
    throw new Error('AUTOMATION_ACTION_DISABLED');
  };
}

const actionResolver = createActionResolver();
export function getAction(code, providerCode = 'INTERNAL') { return actionResolver(code, providerCode); }
