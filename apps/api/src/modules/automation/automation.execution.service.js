import { AppError } from '../../middleware/error-handler.js';
import * as workspace from '../owner-workspace/owner-workspace.service.js';
import * as repository from './automation.execution.repository.js';
import * as recipePolicy from './automation.recipe-policy.service.js';
import { ACTION_CODES, assertObject, TERMINAL_STATES } from './automation.execution.validation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY = /^[A-Za-z0-9._:-]{16,200}$/;
const REASON = /^[A-Z0-9_]{3,100}$/;
function invalid() { throw new AppError('Automation request is invalid.', 400, 'VALIDATION_ERROR'); }
function denied() { throw new AppError('Automation access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS'); }
function unavailable() { throw new AppError('Automation is temporarily unavailable.', 503, 'AUTOMATION_UNAVAILABLE', false); }
function uuid(value) { if (typeof value !== 'string' || !UUID.test(value)) invalid(); return value; }
function idempotency(value) { if (typeof value !== 'string' || !IDEMPOTENCY.test(value)) invalid(); return value; }
function reason(value, fallback) { const valueToCheck = value || fallback; if (typeof valueToCheck !== 'string' || !REASON.test(valueToCheck)) invalid(); return valueToCheck; }
function exact(value, fields) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) invalid(); return value; }
function mapError(error) {
  if (error instanceof AppError) throw error;
  const message = error?.message || '';
  if (/DENIED|ACCESS|OWNER_SCOPE|REVIEW_DENIED|RETRY_DENIED|EMPLOYEE_RUN/.test(message)) denied();
  if (/RUN_TERMINAL/.test(message)) throw new AppError('Automation request conflicts with its current state.', 409, 'AUTOMATION_CONFLICT');
  if (/EMERGENCY_STOP/.test(message)) throw new AppError('Automation request is blocked by an emergency stop.', 409, 'AUTOMATION_EMERGENCY_STOP');
  if (/NOT_FOUND/.test(message)) throw new AppError('Automation record not found.', 404, 'AUTOMATION_NOT_FOUND');
  if (/CONFLICT|STATE_INVALID|IDEMPOTENCY/.test(message)) throw new AppError('Automation request conflicts with its current state.', 409, 'AUTOMATION_CONFLICT');
  if (/VALIDATION|VERSION_INVALID|RECIPE_ACTION_INVALID/.test(message)) invalid();
  unavailable();
}
async function scope(userId, { ownerOnly = false } = {}) {
  try { await workspace.assertOwnerWorkspaceAccess(userId); return { ownerUserId: userId, actorUserId: userId, actorKind: 'owner', isOwner: true }; }
  catch (error) { if (error?.code !== 'INSUFFICIENT_PERMISSIONS') throw error; }
  if (ownerOnly) denied();
  try {
    const employee = await repository.getActiveEmployeeActor(userId);
    if (!employee || employee.role !== 'employee' || employee.status !== 'active' || !employee.portal_owner_user_id) denied();
    return { ownerUserId: employee.portal_owner_user_id, actorUserId: userId, actorKind: 'employee', isOwner: false };
  } catch (error) { if (error instanceof AppError) throw error; unavailable(); }
}
export function getPermittedRunActions(actor, run) {
  if (TERMINAL_STATES.has(run.state) || run.cancelled_at) return Object.freeze({ pause: false, resume: false, cancel: false, retry: false });
  if (actor.isOwner) return Object.freeze({ pause: true, resume: true, cancel: true, retry: true });
  const ownEmployeeRun = run.requested_by_kind === 'employee' && run.requested_by_user_id === actor.actorUserId;
  return Object.freeze({ pause: ownEmployeeRun, resume: ownEmployeeRun, cancel: false, retry: ownEmployeeRun });
}
function runView(run, actor = null) {
  const view = { id: run.id, recipeVersionId: run.recipe_version_id, correlationId: run.correlation_id, state: run.state, requestedByKind: run.requested_by_kind, createdAt: run.created_at, startedAt: run.started_at, completedAt: run.completed_at, updatedAt: run.updated_at };
  if (actor) view.permittedActions = getPermittedRunActions(actor, run);
  return view;
}
async function assertRunVisible(actor, runId) {
  const run = await repository.getRun(actor.ownerUserId, uuid(runId));
  if (!run || (!actor.isOwner && run.requested_by_user_id !== actor.actorUserId)) denied();
  return run;
}

export async function getAccess(userId, claims) {
  const actor = await scope(userId);
  return { identity: { email: claims?.email || 'Authenticated user' }, capabilities: actor.isOwner ? { controls: 'manage', reviews: 'resolve', schedules: 'manage' } : { controls: 'assigned-only', retries: 'assigned-only' } };
}
export async function createManualRun(userId, values, rawIdempotency) {
  // Kept as the legacy service entrypoint for route stability. The raw Step 2 version/hash/action
  // contract is intentionally unavailable to browsers; admission resolves the active Recipe server-side.
  return recipePolicy.admitManualRun(userId, values, rawIdempotency);
}
export async function createDailySchedule(userId, values) {
  const actor = await scope(userId, { ownerOnly: true }); const body = exact(values, ['recipeVersionId', 'configurationSha256', 'actionCode', 'input', 'timezone', 'localTime']);
  if (!ACTION_CODES.includes(body.actionCode) || typeof body.configurationSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(body.configurationSha256)
    || typeof body.timezone !== 'string' || body.timezone.length > 80 || typeof body.localTime !== 'string' || !/^\d{2}:\d{2}(:\d{2})?$/.test(body.localTime)) invalid();
  try { return await repository.createDailySchedule({ ownerUserId: actor.ownerUserId, actorUserId: actor.actorUserId, recipeVersionId: uuid(body.recipeVersionId), configurationSha256: body.configurationSha256, actionCode: body.actionCode, input: assertObject(body.input, 'SCHEDULE_INPUT'), timezone: body.timezone, localTime: body.localTime }); }
  catch (error) { mapError(error); }
}
export async function listRuns(userId, query = {}) {
  const actor = await scope(userId); const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid();
  try { return (await repository.listRuns(actor.ownerUserId, { actorUserId: actor.isOwner ? null : actor.actorUserId, limit })).map((run) => runView(run, actor)); }
  catch (error) { mapError(error); }
}
export async function getRunHistory(userId, runId) {
  const actor = await scope(userId);
  try {
    const run = await assertRunVisible(actor, runId); const history = await repository.getRunHistory(actor.ownerUserId, run.id);
    return { run: runView(run, actor), workItems: history.workItems.map((work) => ({ id: work.id, sequence: work.sequence, dependencyWorkItemId: work.dependency_work_item_id, actionCode: work.action_code, state: work.state, dueAt: work.due_at, attemptCount: work.attempt_count, maxAttempts: work.max_attempts, reasonCode: work.last_reason_code, result: work.result_metadata, createdAt: work.created_at, startedAt: work.started_at, completedAt: work.completed_at })), events: history.events.map((event) => ({ sequence: event.event_sequence, code: event.event_code, actionCode: event.action_code, actorSource: event.actor_source, previousState: event.previous_state, newState: event.new_state, reasonCode: event.reason_code, metadata: event.safe_metadata, createdAt: event.created_at })), decisions: history.decisions.map((decision) => ({ policyCode: decision.policy_code, policyVersion: decision.policy_version, decision: decision.decision, reasonCode: decision.reason_code, createdAt: decision.created_at })) };
  } catch (error) { mapError(error); }
}
export async function setOwnerControl(userId, values) {
  const actor = await scope(userId, { ownerOnly: true }); const body = exact(values, ['scopeType', 'scopeId', 'paused', 'emergencyStop', 'reasonCode']);
  if (!['OWNER', 'RECIPE', 'RUN', 'PROVIDER'].includes(body.scopeType) || typeof body.scopeId !== 'string' || typeof body.paused !== 'boolean' || typeof body.emergencyStop !== 'boolean') invalid();
  const scopeId = body.scopeType === 'OWNER' ? actor.ownerUserId : body.scopeId;
  if (body.scopeType === 'OWNER' && scopeId !== actor.ownerUserId) denied();
  if (body.scopeType === 'PROVIDER' && scopeId !== 'INTERNAL') invalid();
  if (['RECIPE', 'RUN'].includes(body.scopeType) && !(await repository.getOwnedResource(actor.ownerUserId, body.scopeType, uuid(scopeId)))) denied();
  try { await repository.setControl({ ownerUserId: actor.ownerUserId, scopeType: body.scopeType, scopeId, paused: body.paused, emergencyStop: body.emergencyStop, reasonCode: reason(body.reasonCode, 'OWNER_CONTROL'), actorUserId: actor.actorUserId }); return { scopeType: body.scopeType, scopeId, paused: body.paused, emergencyStop: body.emergencyStop }; }
  catch (error) { mapError(error); }
}
export async function cancelRun(userId, runId, values = {}) {
  const actor = await scope(userId, { ownerOnly: true });
  try { await assertRunVisible(actor, runId); return await repository.cancelRun(actor.ownerUserId, uuid(runId), actor.actorUserId, reason(values.reasonCode, 'OWNER_CANCELLED')); }
  catch (error) { mapError(error); }
}
export async function resolveHumanReview(userId, workItemId, values, rawIdempotency) {
  const actor = await scope(userId, { ownerOnly: true }); const body = exact(values, ['decision', 'reasonCode']);
  if (!['RESUME', 'FAIL', 'CANCEL'].includes(body.decision)) invalid();
  try { return await repository.resolveHumanReview(actor.ownerUserId, uuid(workItemId), actor.actorUserId, body.decision, reason(body.reasonCode, 'HUMAN_REVIEW_RESOLVED'), idempotency(rawIdempotency)); }
  catch (error) { mapError(error); }
}
export async function resumeRetry(userId, workItemId, values, rawIdempotency) {
  const actor = await scope(userId); const body = exact(values, ['reasonCode']);
  try {
    const work = await repository.getWork(actor.ownerUserId, uuid(workItemId));
    if (!work) denied(); const run = await assertRunVisible(actor, work.run_id);
    if (!actor.isOwner && run.requested_by_user_id !== actor.actorUserId) denied();
    return await repository.resumeRetry(actor.ownerUserId, work.id, actor.actorUserId, idempotency(rawIdempotency), reason(body.reasonCode, 'RETRY_RESUMED'));
  } catch (error) { mapError(error); }
}
export async function pauseEmployeeRun(userId, runId) {
  const actor = await scope(userId);
  if (actor.isOwner) denied();
  try { return await repository.setEmployeeRunPause(actor.actorUserId, uuid(runId), 'PAUSE'); }
  catch (error) { mapError(error); }
}
export async function resumeEmployeeRun(userId, runId) {
  const actor = await scope(userId);
  if (actor.isOwner) denied();
  try { return await repository.setEmployeeRunPause(actor.actorUserId, uuid(runId), 'RESUME'); }
  catch (error) { mapError(error); }
}
export async function getReadiness() {
  try { return await repository.checkReady(); } catch (error) { mapError(error); }
}
