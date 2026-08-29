import { getDb } from '../../database/db.js';
import { AUTOMATION_REGISTRY_VERSION, AUTOMATION_WORKER_VERSION } from './automation.execution.validation.js';

function client() {
  const { client: db, usingMemory } = getDb();
  if (usingMemory) throw new Error('Automation execution requires PostgreSQL/Supabase; in-memory storage is not permitted.');
  return db;
}
function result(response) { if (response.error) throw response.error; return response.data; }

export async function createTriggerRun(values) {
  return result(await client().rpc('automation_create_trigger_run', {
    p_owner: values.ownerUserId, p_actor: values.actorUserId, p_actor_kind: values.actorKind,
    p_source: 'MANUAL', p_source_event: values.sourceEventId, p_payload_hash: values.payloadSha256,
    p_metadata: values.safeMetadata, p_recipe_version: values.recipeVersionId, p_configuration_hash: values.configurationSha256,
    p_idempotency: values.idempotencyKey, p_request_hash: values.requestSha256, p_action: values.actionCode,
    p_input: values.input, p_input_hash: values.inputSha256, p_due_at: values.dueAt,
  }));
}
export async function createDailySchedule(values) {
  return result(await client().rpc('automation_create_daily_schedule', {
    p_owner: values.ownerUserId, p_actor: values.actorUserId, p_recipe_version: values.recipeVersionId,
    p_configuration_hash: values.configurationSha256, p_action: values.actionCode, p_input: values.input,
    p_timezone: values.timezone, p_local_time: values.localTime,
  }));
}
export async function materializeSchedules(limit = 25) { return result(await client().rpc('automation_materialize_schedules', { p_limit: limit })) || []; }
export async function claim(workerId, limit, leaseSeconds) { return result(await client().rpc('automation_claim_work', { p_worker: workerId, p_limit: limit, p_lease_seconds: leaseSeconds })) || []; }
export async function heartbeat(workItemId, workerId, leaseToken, leaseSeconds) { return result(await client().rpc('automation_heartbeat_work', { p_work: workItemId, p_worker: workerId, p_token: leaseToken, p_lease_seconds: leaseSeconds })); }
export async function markDispatching(workItemId, workerId, leaseToken) { return result(await client().rpc('automation_mark_dispatching', { p_work: workItemId, p_worker: workerId, p_token: leaseToken })); }
export async function transition(workItemId, workerId, leaseToken, nextState, reasonCode, metadata = {}, dueAt = null) {
  return result(await client().rpc('automation_transition_work', { p_work: workItemId, p_worker: workerId, p_token: leaseToken, p_expected: 'RUNNING', p_next: nextState, p_reason: reasonCode, p_result: metadata, p_due: dueAt }));
}
export async function createDependentWork(ownerUserId, parentWorkItemId, sequence, input, dueAt = null) {
  return result(await client().rpc('automation_create_dependent_work', { p_owner: ownerUserId, p_parent: parentWorkItemId, p_sequence: sequence, p_input: input, p_due: dueAt }));
}
export async function recoverStale(limit = 50) { return result(await client().rpc('automation_recover_stale', { p_limit: limit })) || []; }
export async function setControl({ ownerUserId, scopeType, scopeId, paused = false, emergencyStop = false, reasonCode, actorUserId }) {
  return result(await client().rpc('automation_set_control', { p_owner: ownerUserId, p_scope_type: scopeType, p_scope_id: scopeId, p_paused: paused, p_emergency: emergencyStop, p_reason: reasonCode, p_actor: actorUserId }));
}
export async function cancelRun(ownerUserId, runId, actorUserId, reasonCode = 'OWNER_CANCELLED') { return result(await client().rpc('automation_cancel_run', { p_owner: ownerUserId, p_run: runId, p_actor: actorUserId, p_reason: reasonCode })); }
export async function setEmployeeRunPause(actorUserId, runId, operation) {
  return result(await client().rpc('automation_set_employee_run_pause', { p_actor: actorUserId, p_run: runId, p_operation: operation }));
}
export async function resolveHumanReview(ownerUserId, workItemId, actorUserId, decision, reasonCode, idempotencyKey) {
  return result(await client().rpc('automation_resolve_human_review', { p_owner: ownerUserId, p_work: workItemId, p_actor: actorUserId, p_decision: decision, p_reason: reasonCode, p_idempotency: idempotencyKey }));
}
export async function resumeRetry(ownerUserId, workItemId, actorUserId, idempotencyKey, reasonCode = 'RETRY_RESUMED') {
  return result(await client().rpc('automation_resume_retry', { p_owner: ownerUserId, p_work: workItemId, p_actor: actorUserId, p_idempotency: idempotencyKey, p_reason: reasonCode }));
}
export async function checkReady(registryVersion = AUTOMATION_REGISTRY_VERSION, workerVersion = AUTOMATION_WORKER_VERSION) {
  return result(await client().rpc('automation_check_compatibility', { p_registry: registryVersion, p_worker: workerVersion }));
}
export async function getActiveEmployeeActor(userId) {
  const { data, error } = await client().from('users').select('id,role,status,portal_owner_user_id').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function getRun(ownerUserId, runId) {
  const { data, error } = await client().from('automation_runs').select('id,owner_user_id,recipe_version_id,configuration_sha256,correlation_id,state,requested_by_user_id,requested_by_kind,pause_reason_code,cancelled_at,cancel_reason_code,safe_result_summary,created_at,started_at,completed_at,updated_at').eq('owner_user_id', ownerUserId).eq('id', runId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function listRuns(ownerUserId, { actorUserId = null, limit = 50 } = {}) {
  let query = client().from('automation_runs').select('id,recipe_version_id,correlation_id,state,requested_by_user_id,requested_by_kind,created_at,started_at,completed_at,updated_at').eq('owner_user_id', ownerUserId).order('created_at', { ascending: false }).limit(limit);
  if (actorUserId) query = query.eq('requested_by_user_id', actorUserId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
export async function getRunHistory(ownerUserId, runId) {
  const [work, events, decisions] = await Promise.all([
    client().from('automation_work_items').select('id,sequence,dependency_work_item_id,recipe_action_key,action_code,state,due_at,attempt_count,max_attempts,last_reason_code,result_metadata,created_at,started_at,completed_at,updated_at').eq('owner_user_id', ownerUserId).eq('run_id', runId).order('sequence'),
    client().from('automation_run_events').select('event_sequence,event_code,action_code,actor_source,previous_state,new_state,reason_code,safe_metadata,created_at').eq('owner_user_id', ownerUserId).eq('run_id', runId).order('event_sequence'),
    client().from('automation_policy_decisions').select('policy_code,policy_version,decision,reason_code,created_at').eq('owner_user_id', ownerUserId).eq('run_id', runId).order('created_at'),
  ]);
  for (const response of [work, events, decisions]) if (response.error) throw response.error;
  return { workItems: work.data || [], events: events.data || [], decisions: decisions.data || [] };
}
export async function getWork(ownerUserId, workItemId) {
  const { data, error } = await client().from('automation_work_items').select('id,run_id,state,action_code,attempt_count,last_reason_code').eq('owner_user_id', ownerUserId).eq('id', workItemId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function getOwnedResource(ownerUserId, type, id) {
  const table = type === 'RECIPE' ? 'automation_recipes' : type === 'RUN' ? 'automation_runs' : null;
  if (!table) return type === 'OWNER' || type === 'PROVIDER';
  const { data, error } = await client().from(table).select('id').eq('owner_user_id', ownerUserId).eq('id', id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
