import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { evaluateScorePolicyV1 } from '../src/modules/automation/automation.recipe-policy.policy.js';

const { Client } = pg;
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required.');
if (!['127.0.0.1', 'localhost'].includes(new URL(connectionString).hostname)) throw new Error('Automation integration tests require a disposable local database.');
const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const jsonb = (value) => {
  if (Array.isArray(value)) return `[${value.map(jsonb).join(', ')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort((left, right) => left.length - right.length || left.localeCompare(right)).map((key) => `${JSON.stringify(key)}: ${jsonb(value[key])}`).join(', ')}}`;
  return JSON.stringify(value);
};
const inputHash = (value) => hash(jsonb(value));
const ids = Object.fromEntries(['ownerA', 'ownerB', 'actorA', 'actorB', 'recipeA', 'recipeB', 'versionA', 'versionB'].map((key) => [key, randomUUID()]));
const taskInput = Object.freeze({ mode: 'UPDATE', projectId: 'project-safe', taskId: 'task-safe', patch: { completed: true } });
const taskHash = inputHash(taskInput);
const key = (suffix) => `automation-${suffix}-${randomUUID()}`;
const recipeCode = (suffix) => `RCP_${suffix.toUpperCase()}_${randomUUID().replaceAll('-', '').toUpperCase().slice(0, 16)}`;
function governedDefinition(code, { humanReview = false } = {}) {
  return {
    recipeCode: code,
    inputSchema: {
      properties: { mode: { type: 'string' }, projectId: { type: 'string' }, taskId: { type: 'string' }, patch: { type: 'object' } },
      required: ['mode', 'projectId', 'taskId', 'patch'],
    },
    steps: [
      { stepCode: 'STEP_TASK', sequence: 1, actionCode: 'ACT_TASK', policies: ['POL_APPROVAL@V1', 'POL_LIMIT@V1'], requiresHumanReview: humanReview },
      { stepCode: 'STEP_NOTIFY', sequence: 2, actionCode: 'ACT_NOTIFY', dependsOn: 'STEP_TASK', input: { mode: 'SEND_MESSAGE', threadId: 'thread-safe', body: 'Status update' }, policies: ['POL_APPROVAL@V1'], requiresHumanReview: false },
    ],
  };
}
async function createGovernedRecipe({ code = recipeCode('GOV'), humanReview = false } = {}) {
  const definition = governedDefinition(code, { humanReview });
  const created = await call(db, 'automation_create_recipe', [ids.ownerA, ids.ownerA, code, JSON.stringify(definition), hash(jsonb(definition))]);
  await call(db, 'automation_transition_recipe_lifecycle', [ids.ownerA, ids.ownerA, created.recipe_id, created.recipe_version_id, 'SUBMIT_REVIEW']);
  await call(db, 'automation_transition_recipe_lifecycle', [ids.ownerA, ids.ownerA, created.recipe_id, created.recipe_version_id, 'APPROVE']);
  await call(db, 'automation_transition_recipe_lifecycle', [ids.ownerA, ids.ownerA, created.recipe_id, created.recipe_version_id, 'ACTIVATE']);
  return { ...created, code, definition };
}
async function admitGovernedRecipe({ recipe, actor = ids.ownerA, actorKind = 'owner', input = taskInput, idempotency = key('recipe-admit'), dueAt = new Date(Date.now() - 1000).toISOString() } = {}) {
  const requestHash = hash(jsonb({ recipeCode: recipe.code, input, dueAt }));
  return call(db, 'automation_admit_recipe_run', [ids.ownerA, actor, actorKind, recipe.code, JSON.stringify(input), dueAt, idempotency, requestHash]);
}
async function createApolloRecipe({ owner = ids.ownerA, actor = owner, code = recipeCode('APOLLO') } = {}) {
  const definition = {
    recipeCode: code,
    inputSchema: { properties: { titles: { type: 'array' }, locations: { type: 'array' }, industries: { type: 'array' }, limit: { type: 'number' } }, required: ['titles', 'locations', 'industries', 'limit'] },
    steps: [{ stepCode: 'STEP_APOLLO', sequence: 1, actionCode: 'ACT_APOLLO_SEARCH', policies: ['POL_APPROVAL@V1', 'POL_LIMIT@V1'], requiresHumanReview: false }],
  };
  const created = await call(db, 'automation_create_recipe', [owner, actor, code, JSON.stringify(definition), hash(jsonb(definition))]);
  for (const transition of ['SUBMIT_REVIEW', 'APPROVE', 'ACTIVATE']) await call(db, 'automation_transition_recipe_lifecycle', [owner, actor, created.recipe_id, created.recipe_version_id, transition]);
  return { ...created, code, definition };
}
async function admitApolloRecipe({ recipe, owner = ids.ownerA, actor = owner, idempotency = key('apollo-admit'), dueAt = new Date(Date.now() - 1_000).toISOString(), input = { titles: ['Founder'], locations: ['New York'], industries: ['Software'], limit: 2 } } = {}) {
  return call(db, 'automation_admit_recipe_run', [owner, actor, 'owner', recipe.code, JSON.stringify(input), dueAt, idempotency, hash(jsonb({ recipeCode: recipe.code, input, dueAt }))]);
}
let db;

async function call(client, name, params) {
  const { rows } = await client.query(`select public.${name}(${params.map((_, index) => `$${index + 1}`).join(',')}) as value`, params);
  return rows[0]?.value;
}
async function callSet(client, name, params) {
  const { rows } = await client.query(`select public.${name}(${params.map((_, index) => `$${index + 1}`).join(',')}) as value`, params);
  return rows.map((row) => row.value);
}
async function createRun({ owner = ids.ownerA, actor = owner, actorKind = 'owner', version = ids.versionA, action = 'ACT_TASK', input = taskInput, providedInputHash = inputHash(input), sourceEvent = randomUUID(), payloadHash = hash(sourceEvent), idempotency = key('request'), requestHash = hash('request'), dueAt = new Date(Date.now() - 1000).toISOString() } = {}) {
  return call(db, 'automation_create_trigger_run', [
    owner, actor, actorKind, 'MANUAL', sourceEvent, payloadHash, JSON.stringify({ test: true }),
    version, hash(`config:${version}`), idempotency, requestHash, action, JSON.stringify(input), providedInputHash, dueAt,
  ]);
}
async function claimFor(runId, worker = `worker-${randomUUID()}`) {
  const claimed = await callSet(db, 'automation_claim_work', [worker, 1, 60]);
  const work = claimed.find((item) => item.run_id === runId);
  assert.ok(work, `expected a claim for run ${runId}`);
  return { ...work, worker };
}
async function work(runId) {
  const { rows: [row] } = await db.query('select * from public.automation_work_items where run_id=$1', [runId]);
  return row;
}
async function cancel(runId) {
  return call(db, 'automation_cancel_run', [ids.ownerA, runId, ids.ownerA, 'TEST_CLEANUP']);
}
async function setControl(ownerUserId, scopeType, scopeId, paused, reasonCode = 'TEST_PAUSE') {
  return call(db, 'automation_set_control', [ownerUserId, scopeType, scopeId, paused, false, reasonCode, ids.ownerA]);
}

before(async () => {
  db = new Client({ connectionString });
  await db.connect();
  await db.query(`insert into public.users(id,email,email_normalized,full_name,status,role,portal_owner_user_id) values
    ($1,$5,$5,'Automation Owner A','active','client',null),
    ($2,$6,$6,'Automation Owner B','active','client',null),
    ($3,$7,$7,'Automation Employee A','active','employee',$1),
    ($4,$8,$8,'Automation Employee B','active','employee',$2)`, [
    ids.ownerA, ids.ownerB, ids.actorA, ids.actorB,
    `owner-a-${ids.ownerA}@test.local`, `owner-b-${ids.ownerB}@test.local`,
    `actor-a-${ids.actorA}@test.local`, `actor-b-${ids.actorB}@test.local`,
  ]);
  await db.query(`insert into public.automation_recipes(id,owner_user_id,code,status,created_by_user_id) values
    ($1,$3,'RCP_TEST_A','APPROVED',$3),($2,$4,'RCP_TEST_B','APPROVED',$4)`, [ids.recipeA, ids.recipeB, ids.ownerA, ids.ownerB]);
  await db.query(`insert into public.automation_recipe_versions(id,owner_user_id,recipe_id,version,status,definition,configuration_sha256,created_by_user_id,approved_by_user_id,approved_at) values
    ($1,$3,$5,1,'APPROVED','{"actions":[{"key":"ACTION_1","action_code":"ACT_TASK","provider_code":"INTERNAL"}]}',$7,$3,$3,now()),($2,$4,$6,1,'APPROVED','{"actions":[{"key":"ACTION_1","action_code":"ACT_TASK","provider_code":"INTERNAL"}]}',$8,$4,$4,now())`, [
    ids.versionA, ids.versionB, ids.ownerA, ids.ownerB, ids.recipeA, ids.recipeB,
    hash(`config:${ids.versionA}`), hash(`config:${ids.versionB}`),
  ]);
  await db.query(`insert into public.automation_recipe_assignments(owner_user_id,recipe_version_id,employee_user_id,status,allowed_inputs,allowed_inputs_sha256,created_by_user_id)
    values ($1,$2,$3,'ACTIVE',$4::jsonb,$5,$1)`, [
    ids.ownerA, ids.versionA, ids.actorA, JSON.stringify({ ACT_TASK: [taskHash] }), hash(`scope:${taskHash}`),
  ]);
});
after(async () => {
  // This suite always runs after a disposable local db reset. Audit tables are intentionally immutable,
  // so test fixture evidence is retained until the next reset rather than bypassing its protections.
  if (db) await db.end();
});

describe('Phase 11 durable automation PostgreSQL control plane', { concurrency: false }, () => {
  test('keeps control-plane tables private and exposes only controlled RPCs', async () => {
    const { rows: [state] } = await db.query(`select
      (select bool_and(relrowsecurity) from pg_class where oid=any(array[
        'public.automation_runs'::regclass,'public.automation_work_items'::regclass,
        'public.automation_work_reservations'::regclass,'public.automation_run_events'::regclass
      ])) as rls,
      has_table_privilege('service_role','public.automation_work_items','insert') as service_insert,
      has_function_privilege('service_role','public.automation_claim_work(text,integer,integer)','execute') as claim_execute,
      has_function_privilege('service_role','public.automation_reserve_work(uuid,uuid,text,uuid)','execute') as helper_execute,
      has_table_privilege('anon','public.automation_runs','select') as anon_read`);
    assert.deepEqual(state, { rls: true, service_insert: false, claim_execute: true, helper_execute: false, anon_read: false });
  });

  test('persists replay and conflicting trigger evidence without rolling back conflict audit history', async () => {
    const sourceEvent = randomUUID();
    const first = await createRun({ sourceEvent, idempotency: key('replay'), requestHash: hash('same-request') });
    const replay = await createRun({ sourceEvent, idempotency: key('ignored'), requestHash: hash('same-request') });
    const conflict = await createRun({ sourceEvent, payloadHash: hash('conflicting-payload'), idempotency: key('ignored'), requestHash: hash('different-request') });
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.run_id, first.run_id);
    assert.deepEqual({ rejected: conflict.rejected, reason: conflict.reason }, { rejected: true, reason: 'AUTOMATION_TRIGGER_CONFLICT' });
    const { rows: [inbox] } = await db.query('select status,reason_code from public.automation_trigger_inbox where id=$1', [first.trigger_id]);
    assert.deepEqual(inbox, { status: 'CONFLICT', reason_code: 'TRIGGER_EVIDENCE_CONFLICT' });
    const { rows: events } = await db.query('select event_code from public.automation_run_events where run_id=$1 order by event_sequence', [first.run_id]);
    assert.deepEqual(events.map((row) => row.event_code), ['TRIGGER_ACCEPTED', 'TRIGGER_CONFLICT']);
    await cancel(first.run_id);
  });

  test('rejects a requested action that is not the immutable recipe action', async () => {
    const rejected = await createRun({
      action: 'ACT_ASSIGN',
      input: { projectId: 'project-safe', taskId: 'task-safe', employeeUserId: 'employee-safe' },
      idempotency: key('recipe-action-mismatch'),
    });
    assert.deepEqual({ rejected: rejected.rejected, reason: rejected.reason }, { rejected: true, reason: 'AUTOMATION_RECIPE_ACTION_INVALID' });
    const { rows: [inbox] } = await db.query('select status,reason_code,run_id from public.automation_trigger_inbox where id=$1', [rejected.trigger_id]);
    assert.deepEqual(inbox, { status: 'REJECTED', reason_code: 'RECIPE_ACTION_INVALID', run_id: null });
    const { rows: [decision] } = await db.query(`select decision,reason_code from public.automation_policy_decisions
      where correlation_id=(select correlation_id from public.automation_trigger_inbox where id=$1)`, [rejected.trigger_id]);
    assert.deepEqual(decision, { decision: 'BLOCK', reason_code: 'RECIPE_ACTION_INVALID' });
  });

  test('enforces active same-owner Employee action/input assignment scope and immutable scope snapshot', async () => {
    const accepted = await createRun({ actor: ids.actorA, actorKind: 'employee', idempotency: key('employee') });
    assert.equal(accepted.rejected, undefined);
    const { rows: [run] } = await db.query('select recipe_assignment_id,assignment_allowed_inputs_sha256 from public.automation_runs where id=$1', [accepted.run_id]);
    assert.ok(run.recipe_assignment_id);
    assert.equal(run.assignment_allowed_inputs_sha256, hash(`scope:${taskHash}`));
    const unassigned = await createRun({ actor: ids.actorB, actorKind: 'employee', idempotency: key('cross-owner') });
    const outOfScope = await createRun({ actor: ids.actorA, actorKind: 'employee', input: { ...taskInput, taskId: 'different' }, idempotency: key('out-of-scope') });
    const forgedHash = await createRun({ actor: ids.actorA, actorKind: 'employee', input: { ...taskInput, taskId: 'forged' }, providedInputHash: taskHash, idempotency: key('forged-hash') });
    const wrongOwnerVersion = await createRun({ actor: ids.actorA, actorKind: 'employee', version: ids.versionB, idempotency: key('wrong-version') });
    assert.equal(unassigned.reason, 'AUTOMATION_EMPLOYEE_SCOPE_DENIED');
    assert.equal(outOfScope.reason, 'AUTOMATION_EMPLOYEE_SCOPE_DENIED');
    assert.equal(forgedHash.reason, 'AUTOMATION_EMPLOYEE_SCOPE_DENIED');
    assert.equal(wrongOwnerVersion.reason, 'AUTOMATION_VERSION_INVALID');
    await cancel(accepted.run_id);
  });

  test('claims once under concurrency, reserves six durable links, and blocks quota denial without consuming attempts', async () => {
    const first = await createRun({ idempotency: key('quota-first') });
    const left = new Client({ connectionString }); const right = new Client({ connectionString });
    await Promise.all([left.connect(), right.connect()]);
    const [leftClaim, rightClaim] = await Promise.all([
      callSet(left, 'automation_claim_work', ['worker-left', 1, 60]),
      callSet(right, 'automation_claim_work', ['worker-right', 1, 60]),
    ]);
    await Promise.all([left.end(), right.end()]);
    const claimed = [...leftClaim, ...rightClaim];
    assert.equal(new Set(claimed.map((item) => item.id)).size, claimed.length);
    const firstClaim = claimed.find((item) => item.run_id === first.run_id) || await claimFor(first.run_id, 'worker-first');
    const { rows: [links] } = await db.query('select count(*)::int as total,count(*) filter(where active)::int as active from public.automation_work_reservations where work_item_id=$1', [firstClaim.id]);
    assert.deepEqual(links, { total: 6, active: 6 });
    await db.query(`update public.automation_quota_reservations set limit_value=1 where owner_user_id=$1 and scope_type='OWNER' and reservation_type='CONCURRENT'`, [ids.ownerA]);
    const second = await createRun({ idempotency: key('quota-second') });
    await claimFor(second.run_id, 'worker-quota').catch(() => undefined);
    const denied = await work(second.run_id);
    assert.deepEqual({ state: denied.state, attempts: denied.attempt_count, lease: denied.lease_token }, { state: 'BLOCKED', attempts: 0, lease: null });
    await cancel(first.run_id); await cancel(second.run_id);
    await db.query(`update public.automation_quota_reservations set limit_value=10 where owner_user_id=$1 and scope_type='OWNER' and reservation_type='CONCURRENT'`, [ids.ownerA]);
  });

  test('fences all control scopes immediately before dispatch and never permits a revoked Employee scope', async () => {
    const scopes = [
      ['GLOBAL', 'GLOBAL', null], ['OWNER', ids.ownerA, ids.ownerA], ['RECIPE', ids.recipeA, ids.ownerA], ['RUN', null, ids.ownerA], ['PROVIDER', 'INTERNAL', ids.ownerA],
    ];
    for (const [scopeType, configuredScopeId, ownerUserId] of scopes) {
      const run = await createRun({ idempotency: key(`dispatch-${scopeType}`) });
      const claimed = await claimFor(run.run_id, `worker-${scopeType}`);
      const scopeId = scopeType === 'RUN' ? run.run_id : configuredScopeId;
      await setControl(ownerUserId, scopeType, scopeId, true, `TEST_${scopeType}`);
      const dispatch = await call(db, 'automation_mark_dispatching', [claimed.id, claimed.worker, claimed.lease_token]);
      assert.equal(dispatch.allowed, false, `${scopeType} should deny dispatch`);
      await setControl(ownerUserId, scopeType, scopeId, false, `TEST_${scopeType}_CLEAR`);
      await cancel(run.run_id);
    }
    const employee = await createRun({ actor: ids.actorA, actorKind: 'employee', idempotency: key('employee-fence') });
    const claimed = await claimFor(employee.run_id, 'worker-employee-fence');
    await db.query(`update public.automation_recipe_assignments set status='REVOKED',revoked_at=now() where owner_user_id=$1 and employee_user_id=$2`, [ids.ownerA, ids.actorA]);
    const denied = await call(db, 'automation_mark_dispatching', [claimed.id, claimed.worker, claimed.lease_token]);
    assert.equal(denied.allowed, false);
    await db.query(`update public.automation_recipe_assignments set status='ACTIVE',revoked_at=null where owner_user_id=$1 and employee_user_id=$2`, [ids.ownerA, ids.actorA]);
    await cancel(employee.run_id);
  });

  test('reactivates released reservation links on retry and performs control-aware stale recovery', async () => {
    const retry = await createRun({ idempotency: key('retry') });
    const claimed = await claimFor(retry.run_id, 'worker-retry');
    await call(db, 'automation_transition_work', [claimed.id, claimed.worker, claimed.lease_token, 'RUNNING', 'RETRYABLE', 'TRANSIENT_DEPENDENCY_FAILURE', JSON.stringify({}), new Date().toISOString()]);
    const { rows: [released] } = await db.query('select count(*)::int as total,count(*) filter(where active)::int as active from public.automation_work_reservations where work_item_id=$1', [claimed.id]);
    assert.deepEqual(released, { total: 6, active: 0 });
    const retried = await claimFor(retry.run_id, 'worker-retry-two');
    const { rows: [reactivated] } = await db.query('select count(*)::int as total,count(*) filter(where active)::int as active from public.automation_work_reservations where work_item_id=$1', [retried.id]);
    assert.deepEqual(reactivated, { total: 6, active: 6 });
    await db.query(`update public.automation_work_items set lease_until=now()-interval '1 second' where id=$1`, [retried.id]);
    await setControl(ids.ownerA, 'OWNER', ids.ownerA, true, 'RECOVERY_PAUSE');
    const recovered = await callSet(db, 'automation_recover_stale', [50]);
    assert.ok(recovered.some((entry) => entry.work_item_id === retried.id && entry.state === 'BLOCKED'));
    await setControl(ids.ownerA, 'OWNER', ids.ownerA, false, 'RECOVERY_RESUME');
    await cancel(retry.run_id);

    const exhausted = await createRun({ idempotency: key('exhausted') });
    await db.query('update public.automation_work_items set max_attempts=1 where run_id=$1', [exhausted.run_id]);
    const exhaustedClaim = await claimFor(exhausted.run_id, 'worker-exhausted');
    await db.query(`update public.automation_work_items set lease_until=now()-interval '1 second' where id=$1`, [exhaustedClaim.id]);
    const exhaustedRecovery = await callSet(db, 'automation_recover_stale', [50]);
    assert.ok(exhaustedRecovery.some((entry) => entry.work_item_id === exhaustedClaim.id && entry.state === 'FAILED'));

    const ambiguous = await createRun({ idempotency: key('ambiguous') });
    const ambiguousClaim = await claimFor(ambiguous.run_id, 'worker-ambiguous');
    await call(db, 'automation_mark_dispatching', [ambiguousClaim.id, ambiguousClaim.worker, ambiguousClaim.lease_token]);
    await db.query(`update public.automation_work_items set lease_until=now()-interval '1 second' where id=$1`, [ambiguousClaim.id]);
    const ambiguousRecovery = await callSet(db, 'automation_recover_stale', [50]);
    assert.ok(ambiguousRecovery.some((entry) => entry.work_item_id === ambiguousClaim.id && entry.state === 'HUMAN_REVIEW'));
    const late = await call(db, 'automation_transition_work', [ambiguousClaim.id, ambiguousClaim.worker, ambiguousClaim.lease_token, 'RUNNING', 'COMPLETED', 'LATE_RESULT', JSON.stringify({}), null]);
    assert.equal(late.late, true);
    const { rows: lateEvents } = await db.query(`select event_code from public.automation_run_events where work_item_id=$1 and event_code='LATE_RESULT'`, [ambiguousClaim.id]);
    assert.equal(lateEvents.length, 1);
    await cancel(ambiguous.run_id);
  });

  test('cancels nonterminal work, protects terminal results, and retains the due-claim index path', async () => {
    const terminal = await createRun({ idempotency: key('terminal') });
    const claimed = await claimFor(terminal.run_id, 'worker-terminal');
    await call(db, 'automation_mark_dispatching', [claimed.id, claimed.worker, claimed.lease_token]);
    await call(db, 'automation_transition_work', [claimed.id, claimed.worker, claimed.lease_token, 'RUNNING', 'COMPLETED', 'ACTION_COMPLETED', JSON.stringify({ ok: true }), null]);
    const late = await call(db, 'automation_transition_work', [claimed.id, claimed.worker, claimed.lease_token, 'RUNNING', 'RETRYABLE', 'LATE_RESULT', JSON.stringify({}), null]);
    assert.equal(late.late, true);
    const pending = await createRun({ idempotency: key('cancel') });
    const cancelled = await cancel(pending.run_id);
    assert.equal(cancelled.state, 'CANCELLED');
    assert.equal((await work(pending.run_id)).state, 'CANCELLED');
    await db.query('set enable_seqscan=off');
    const plan = await db.query(`explain (costs false) select * from public.automation_work_items where state in ('WAITING','RETRYABLE') and due_at <= now() order by due_at,priority desc,owner_user_id,id limit 10`);
    await db.query('set enable_seqscan=on');
    assert.match(plan.rows.map((row) => row['QUERY PLAN']).join('\n'), /automation_work_items_due_claim_idx/);
  });

  test('materializes daily schedules exactly once with database timezone and compatibility contracts', async () => {
    const schedule = await call(db, 'automation_create_daily_schedule', [
      ids.ownerA, ids.ownerA, ids.versionA, hash(`config:${ids.versionA}`), 'ACT_TASK', JSON.stringify(taskInput), 'America/New_York', '09:30:00',
    ]);
    await db.query(`update public.automation_schedules set next_occurrence_at=now()-interval '1 minute' where id=$1`, [schedule.schedule_id]);
    const left = new Client({ connectionString }); const right = new Client({ connectionString });
    await Promise.all([left.connect(), right.connect()]);
    const [leftRows, rightRows] = await Promise.all([
      callSet(left, 'automation_materialize_schedules', [25]), callSet(right, 'automation_materialize_schedules', [25]),
    ]);
    await Promise.all([left.end(), right.end()]);
    const created = [...leftRows, ...rightRows].filter(Boolean);
    assert.equal(created.length, 1);
    const { rows: [occurrence] } = await db.query(`select o.occurrence_key,o.run_id,o.work_item_id,s.next_occurrence_at > now() as advanced
      from public.automation_schedule_occurrences o join public.automation_schedules s on s.id=o.schedule_id where o.schedule_id=$1`, [schedule.schedule_id]);
    assert.ok(occurrence.run_id); assert.ok(occurrence.work_item_id); assert.equal(occurrence.advanced, true);
    assert.equal((await callSet(db, 'automation_materialize_schedules', [25])).length, 0);
    // A bounded catch-up leaves further past occurrences for the next durable wake/restart.
    await db.query(`update public.automation_schedules set catch_up_limit=1,next_occurrence_at=now()-interval '3 days' where id=$1`, [schedule.schedule_id]);
    assert.equal((await callSet(db, 'automation_materialize_schedules', [25])).length, 1);
    const { rows: [behind] } = await db.query('select next_occurrence_at <= now() as behind from public.automation_schedules where id=$1', [schedule.schedule_id]);
    assert.equal(behind.behind, true);
    assert.equal((await callSet(db, 'automation_materialize_schedules', [25])).length, 1);
    await assert.rejects(call(db, 'automation_create_daily_schedule', [ids.ownerA, ids.ownerA, ids.versionA, hash(`config:${ids.versionA}`), 'ACT_TASK', JSON.stringify(taskInput), 'Not/A_Timezone', '09:30:00']), /AUTOMATION_VALIDATION_ERROR/);
    const { rows: [dst] } = await db.query(`select
      ((date '2026-03-08' + time '02:30') at time zone 'America/New_York') as spring_forward,
      ((date '2026-11-01' + time '01:30') at time zone 'America/New_York') as fall_back`);
    assert.equal(dst.spring_forward.toISOString(), '2026-03-08T07:30:00.000Z');
    assert.equal(dst.fall_back.toISOString(), '2026-11-01T06:30:00.000Z');
    const contract = await call(db, 'automation_check_compatibility', ['AUTOMATION_REGISTRY_V1', 'AUTOMATION_WORKER_V1']);
    assert.deepEqual(contract, { ready: true, schema_version: 2, registry_version: 'AUTOMATION_REGISTRY_V1', worker_version: 'AUTOMATION_WORKER_V1' });
    await assert.rejects(call(db, 'automation_check_compatibility', ['stale', 'AUTOMATION_WORKER_V1']), /AUTOMATION_COMPATIBILITY_MISMATCH/);
    const { rows: scheduleRuns } = await db.query('select run_id from public.automation_schedule_occurrences where schedule_id=$1 and run_id is not null', [schedule.schedule_id]);
    for (const { run_id: runId } of scheduleRuns) await cancel(runId);
  });

  test('extends only a current lease and rejects stale lease holders before recovery', async () => {
    const run = await createRun({ idempotency: key('heartbeat') });
    const claimed = await claimFor(run.run_id, 'worker-heartbeat');
    const { rows: [before] } = await db.query('select lease_until from public.automation_work_items where id=$1', [claimed.id]);
    const heartbeat = await call(db, 'automation_heartbeat_work', [claimed.id, claimed.worker, claimed.lease_token, 60]);
    assert.ok(new Date(heartbeat.lease_until) > new Date(before.lease_until));
    await assert.rejects(call(db, 'automation_heartbeat_work', [claimed.id, 'wrong-worker', claimed.lease_token, 60]), /AUTOMATION_LEASE_LOST/);
    await assert.rejects(call(db, 'automation_heartbeat_work', [claimed.id, claimed.worker, randomUUID(), 60]), /AUTOMATION_LEASE_LOST/);
    await db.query(`update public.automation_work_items set lease_until=now()-interval '1 second' where id=$1`, [claimed.id]);
    await assert.rejects(call(db, 'automation_heartbeat_work', [claimed.id, claimed.worker, claimed.lease_token, 60]), /AUTOMATION_LEASE_LOST/);
    const recovered = await callSet(db, 'automation_recover_stale', [10]);
    assert.ok(recovered.some((entry) => entry.work_item_id === claimed.id && entry.state === 'RETRYABLE'));
    const { rows: events } = await db.query(`select event_code from public.automation_run_events where work_item_id=$1`, [claimed.id]);
    assert.ok(events.some((event) => event.event_code === 'LEASE_HEARTBEAT'));
    await cancel(run.run_id);
  });

  test('creates deduplicated dependent work only after parent completion and resolves authorized review controls', async () => {
    const parentRun = await createRun({ idempotency: key('dependent-parent') });
    const parent = await claimFor(parentRun.run_id, 'worker-parent');
    await assert.rejects(call(db, 'automation_create_dependent_work', [ids.ownerA, parent.id, 2, JSON.stringify(taskInput), new Date().toISOString()]), /AUTOMATION_DEPENDENCY_NOT_COMPLETED/);
    await call(db, 'automation_transition_work', [parent.id, parent.worker, parent.lease_token, 'RUNNING', 'COMPLETED', 'ACTION_COMPLETED', JSON.stringify({}), null]);
    const firstChild = await call(db, 'automation_create_dependent_work', [ids.ownerA, parent.id, 2, JSON.stringify(taskInput), new Date(Date.now() + 3600000).toISOString()]);
    const replayedChild = await call(db, 'automation_create_dependent_work', [ids.ownerA, parent.id, 2, JSON.stringify(taskInput), new Date(Date.now() + 3600000).toISOString()]);
    assert.equal(firstChild.replayed, false); assert.deepEqual(replayedChild, { work_item_id: firstChild.work_item_id, replayed: true });
    const { rows: [child] } = await db.query('select dependency_work_item_id,state from public.automation_work_items where id=$1', [firstChild.work_item_id]);
    assert.deepEqual(child, { dependency_work_item_id: parent.id, state: 'WAITING' });
    for (let sequence = 3; sequence <= 26; sequence += 1) await call(db, 'automation_create_dependent_work', [ids.ownerA, parent.id, sequence, JSON.stringify({ ...taskInput, sequence }), new Date(Date.now() + 3600000).toISOString()]);
    await assert.rejects(call(db, 'automation_create_dependent_work', [ids.ownerA, parent.id, 27, JSON.stringify(taskInput), new Date().toISOString()]), /AUTOMATION_FANOUT_LIMIT/);

    const reviewRun = await createRun({ idempotency: key('review') });
    const review = await claimFor(reviewRun.run_id, 'worker-review');
    await call(db, 'automation_mark_dispatching', [review.id, review.worker, review.lease_token]);
    await db.query(`update public.automation_work_items set lease_until=now()-interval '1 second' where id=$1`, [review.id]);
    await callSet(db, 'automation_recover_stale', [10]);
    const resolutionKey = key('review-resolution');
    const resumed = await call(db, 'automation_resolve_human_review', [ids.ownerA, review.id, ids.ownerA, 'RESUME', 'OPERATOR_REVIEWED', resolutionKey]);
    assert.deepEqual({ state: resumed.state, replayed: resumed.replayed }, { state: 'WAITING', replayed: false });
    const replay = await call(db, 'automation_resolve_human_review', [ids.ownerA, review.id, ids.ownerA, 'RESUME', 'OPERATOR_REVIEWED', resolutionKey]);
    assert.equal(replay.replayed, true);
    await assert.rejects(call(db, 'automation_resolve_human_review', [ids.ownerA, review.id, ids.actorA, 'FAIL', 'OPERATOR_REVIEWED', key('employee-review')]), /AUTOMATION_REVIEW_DENIED/);
    await assert.rejects(call(db, 'automation_resolve_human_review', [ids.ownerA, review.id, ids.ownerA, 'FAIL', 'OPERATOR_REVIEWED', resolutionKey]), /AUTOMATION_IDEMPOTENCY_CONFLICT/);
    await cancel(reviewRun.run_id);
    for (const [decision, expectedState] of [['FAIL', 'FAILED'], ['CANCEL', 'CANCELLED']]) {
      const decisionRun = await createRun({ idempotency: key(`review-${decision}`) });
      const decisionWork = await claimFor(decisionRun.run_id, `worker-review-${decision}`);
      await call(db, 'automation_mark_dispatching', [decisionWork.id, decisionWork.worker, decisionWork.lease_token]);
      await db.query(`update public.automation_work_items set lease_until=now()-interval '1 second' where id=$1`, [decisionWork.id]);
      await callSet(db, 'automation_recover_stale', [10]);
      const resolved = await call(db, 'automation_resolve_human_review', [ids.ownerA, decisionWork.id, ids.ownerA, decision, 'OPERATOR_REVIEWED', key(`review-${decision}-resolution`)]);
      assert.equal(resolved.state, expectedState);
    }
    await assert.rejects(call(db, 'automation_resolve_human_review', [ids.ownerB, review.id, ids.ownerB, 'FAIL', 'OPERATOR_REVIEWED', key('cross-owner-review')]), /AUTOMATION_REVIEW_STATE_INVALID/);
    const retryRun = await createRun({ actor: ids.actorA, actorKind: 'employee', idempotency: key('employee-safe-retry') });
    const retryWork = await claimFor(retryRun.run_id, 'worker-employee-retry');
    await call(db, 'automation_transition_work', [retryWork.id, retryWork.worker, retryWork.lease_token, 'RUNNING', 'RETRYABLE', 'TRANSIENT_DEPENDENCY_FAILURE', JSON.stringify({}), new Date().toISOString()]);
    await assert.rejects(call(db, 'automation_resume_retry', [ids.ownerA, retryWork.id, ids.actorB, key('cross-owner-retry-control'), 'RETRY_RESUMED']), /AUTOMATION_RETRY_DENIED/);
    const retry = await call(db, 'automation_resume_retry', [ids.ownerA, retryWork.id, ids.actorA, key('employee-safe-retry-control'), 'RETRY_RESUMED']);
    assert.deepEqual({ state: retry.state, replayed: retry.replayed }, { state: 'WAITING', replayed: false });
    const { rows: reviewEvents } = await db.query(`select event_code from public.automation_run_events where work_item_id=$1`, [review.id]);
    assert.ok(reviewEvents.some((event) => event.event_code === 'HUMAN_REVIEW_RESOLVED'));
    await cancel(parentRun.run_id); await cancel(reviewRun.run_id); await cancel(retryRun.run_id);
  });

  test('durably blocks emergency-stop and cancellation races before external dispatch', async () => {
    const beforeClaim = await createRun({ idempotency: key('stop-before-claim') });
    await setControl(ids.ownerA, 'RUN', beforeClaim.run_id, true, 'EMERGENCY_STOP');
    await callSet(db, 'automation_claim_work', ['worker-stop-before', 50, 60]);
    assert.deepEqual({ state: (await work(beforeClaim.run_id)).state, reason: (await work(beforeClaim.run_id)).last_reason_code }, { state: 'BLOCKED', reason: 'EMERGENCY_STOP' });
    await setControl(ids.ownerA, 'RUN', beforeClaim.run_id, false, 'CLEAR_RUN_STOP');

    const afterClaim = await createRun({ idempotency: key('stop-after-claim') });
    const claimed = await claimFor(afterClaim.run_id, 'worker-stop-after');
    await setControl(ids.ownerA, 'RUN', afterClaim.run_id, true, 'EMERGENCY_STOP');
    const denied = await call(db, 'automation_mark_dispatching', [claimed.id, claimed.worker, claimed.lease_token]);
    assert.equal(denied.allowed, false);
    assert.equal((await work(afterClaim.run_id)).state, 'CANCELLED');
    await setControl(ids.ownerA, 'RUN', afterClaim.run_id, false, 'CLEAR_RUN_STOP');

    const cancelled = await createRun({ idempotency: key('cancel-after-claim') });
    const cancellable = await claimFor(cancelled.run_id, 'worker-cancel-after');
    assert.equal((await cancel(cancelled.run_id)).state, 'CANCELLED');
    await assert.rejects(call(db, 'automation_mark_dispatching', [cancellable.id, cancellable.worker, cancellable.lease_token]), /AUTOMATION_LEASE_LOST/);
  });

  test('resets exhausted daily quota only in a new durable window', async () => {
    // Shared fair-claim setup may leave unrelated eligible fixtures leased; force their normal durable recovery first.
    await db.query(`update public.automation_work_items set lease_until=now()-interval '1 second' where state='RUNNING'`);
    await callSet(db, 'automation_recover_stale', [50]);
    const consumedRun = await createRun({ idempotency: key('daily-consumed') });
    const consumedWork = await claimFor(consumedRun.run_id, 'worker-daily-consumed');
    await call(db, 'automation_transition_work', [consumedWork.id, consumedWork.worker, consumedWork.lease_token, 'RUNNING', 'COMPLETED', 'ACTION_COMPLETED', JSON.stringify({}), null]);
    await db.query(`update public.automation_quota_reservations set limit_value=1
      where owner_user_id=$1 and reservation_type='DAILY' and consumed >= 1`, [ids.ownerA]);
    const deniedRun = await createRun({ idempotency: key('daily-denied') });
    await callSet(db, 'automation_claim_work', ['worker-daily-denied', 50, 60]);
    assert.deepEqual({ state: (await work(deniedRun.run_id)).state, reason: (await work(deniedRun.run_id)).last_reason_code }, { state: 'BLOCKED', reason: 'QUOTA_DENIED' });
    await db.query(`update public.automation_quota_reservations set window_start=window_start-interval '1 day'
      where owner_user_id=$1 and reservation_type='DAILY'`, [ids.ownerA]);
    const resetRun = await createRun({ idempotency: key('daily-window-reset') });
    const resetClaim = await claimFor(resetRun.run_id, 'worker-daily-reset');
    assert.equal(resetClaim.run_id, resetRun.run_id);
    await cancel(consumedRun.run_id); await cancel(deniedRun.run_id); await cancel(resetRun.run_id);
  });

  test('serves both bounded owner backlogs without monopolizing a claim cycle', async () => {
    const runs = [];
    for (let index = 0; index < 4; index += 1) {
      runs.push({ owner: ids.ownerA, result: await createRun({ owner: ids.ownerA, actor: ids.ownerA, version: ids.versionA, idempotency: key(`fair-a-${index}`) }) });
      runs.push({ owner: ids.ownerB, result: await createRun({ owner: ids.ownerB, actor: ids.ownerB, version: ids.versionB, idempotency: key(`fair-b-${index}`) }) });
    }
    const claimed = await callSet(db, 'automation_claim_work', ['worker-fairness', 4, 60]);
    const ownerCounts = claimed.reduce((counts, item) => ({ ...counts, [item.owner_user_id]: (counts[item.owner_user_id] || 0) + 1 }), {});
    assert.equal(Object.keys(ownerCounts).length, 2);
    assert.ok(ownerCounts[ids.ownerA] >= 1 && ownerCounts[ids.ownerB] >= 1);
    assert.ok(Math.abs(ownerCounts[ids.ownerA] - ownerCounts[ids.ownerB]) <= 1);
    for (const run of runs) await call(db, 'automation_cancel_run', [run.owner, run.result.run_id, run.owner, 'TEST_CLEANUP']);
  });

  test('governs immutable Recipe lifecycle, active routing, fixed policy evidence, and idempotent manual admission', async () => {
    const recipe = await createGovernedRecipe();
    const { rows: [lifecycle] } = await db.query(`select r.status,rv.status as version_status,a.status as activation_status
      from public.automation_recipes r join public.automation_recipe_versions rv on rv.recipe_id=r.id
      join public.automation_recipe_activations a on a.recipe_id=r.id
      where r.id=$1 and a.status='ACTIVE'`, [recipe.recipe_id]);
    assert.deepEqual(lifecycle, { status: 'ACTIVE', version_status: 'APPROVED', activation_status: 'ACTIVE' });
    await assert.rejects(db.query(`update public.automation_recipe_versions set definition='{}'::jsonb where id=$1`, [recipe.recipe_version_id]), /AUTOMATION_IMMUTABLE/);

    const idempotency = key('governed-replay');
    const dueAt = new Date(Date.now() + 60_000).toISOString();
    const admitted = await admitGovernedRecipe({ recipe, idempotency, dueAt });
    const replay = await admitGovernedRecipe({ recipe, idempotency, dueAt });
    assert.equal(admitted.replayed, false); assert.deepEqual(replay, { trigger_id: admitted.trigger_id, run_id: admitted.run_id, replayed: true });
    const { rows: [run] } = await db.query(`select recipe_version_id,configuration_sha256,state from public.automation_runs where id=$1`, [admitted.run_id]);
    assert.deepEqual({ recipe_version_id: run.recipe_version_id, configuration_sha256: run.configuration_sha256, state: run.state }, { recipe_version_id: recipe.recipe_version_id, configuration_sha256: hash(jsonb(recipe.definition)), state: 'WAITING' });
    const { rows: [evidence] } = await db.query(`select policy_code,policy_version,decision,reason_code,recipe_version_id,configuration_sha256
      from public.automation_policy_decisions where run_id=$1 and policy_code='POL_APPROVAL'`, [admitted.run_id]);
    assert.deepEqual(evidence, { policy_code: 'POL_APPROVAL', policy_version: 'V1', decision: 'ALLOW', reason_code: 'RECIPE_APPROVED', recipe_version_id: recipe.recipe_version_id, configuration_sha256: hash(jsonb(recipe.definition)) });
    await assert.rejects(admitGovernedRecipe({ recipe: { ...recipe, code: recipeCode('MISSING') } }), /AUTOMATION_RECIPE_NOT_ACTIVE/);
    await cancel(admitted.run_id);
  });

  test('rejects invalid Recipes, enforces Employee assignment scope, and compiles fixed successor work in the Step 2 transaction', async () => {
    const invalidCode = recipeCode('INVALID');
    const invalid = governedDefinition(invalidCode);
    invalid.steps[1].dependsOn = 'STEP_UNKNOWN';
    await assert.rejects(call(db, 'automation_create_recipe', [ids.ownerA, ids.ownerA, invalidCode, JSON.stringify(invalid), hash(jsonb(invalid))]), /AUTOMATION_RECIPE_GRAPH_INVALID/);
    const unsupported = governedDefinition(recipeCode('UNSUPPORTED'));
    for (const actionCode of ['ACT_EMAIL', 'ACT_HUNTER_EMAIL_FIND', 'ACT_OUTREACH_SEND', 'ACT_CALENDAR_BOOK']) {
      unsupported.steps[0].actionCode = actionCode;
      await assert.rejects(call(db, 'automation_create_recipe', [ids.ownerA, ids.ownerA, unsupported.recipeCode, JSON.stringify(unsupported), hash(jsonb(unsupported))]), /AUTOMATION_RECIPE_GRAPH_INVALID/);
    }

    const recipe = await createGovernedRecipe();
    const assigned = await call(db, 'automation_upsert_recipe_assignment', [
      ids.ownerA, ids.ownerA, recipe.recipe_version_id, ids.actorA,
      JSON.stringify({ ACT_TASK: [taskHash] }), hash(jsonb({ ACT_TASK: [taskHash] })), 'ACTIVE',
    ]);
    assert.equal(assigned.status, 'ACTIVE');
    const employee = await admitGovernedRecipe({ recipe, actor: ids.actorA, actorKind: 'employee', idempotency: key('governed-employee') });
    assert.ok(employee.run_id);
    await assert.rejects(admitGovernedRecipe({ recipe, actor: ids.actorA, actorKind: 'employee', input: { ...taskInput, taskId: 'different' } }), /AUTOMATION_EMPLOYEE_SCOPE_DENIED/);
    await db.query(`update public.automation_recipe_assignments set status='REVOKED',revoked_at=now() where id=$1`, [assigned.assignment_id]);
    await assert.rejects(admitGovernedRecipe({ recipe, actor: ids.actorA, actorKind: 'employee' }), /AUTOMATION_EMPLOYEE_SCOPE_DENIED/);
    await cancel(employee.run_id);

    const admitted = await admitGovernedRecipe({ recipe, idempotency: key('governed-successor') });
    const root = await claimFor(admitted.run_id, 'worker-governed-successor');
    await call(db, 'automation_transition_work', [root.id, root.worker, root.lease_token, 'RUNNING', 'COMPLETED', 'ACTION_COMPLETED', JSON.stringify({}), null]);
    const { rows: compiled } = await db.query(`select sequence,dependency_work_item_id,recipe_action_key,action_code,input,state
      from public.automation_work_items where run_id=$1 order by sequence`, [admitted.run_id]);
    assert.deepEqual(compiled.map((item) => ({ sequence: item.sequence, dependency_work_item_id: item.dependency_work_item_id, recipe_action_key: item.recipe_action_key, action_code: item.action_code, input: item.input, state: item.state })), [
      { sequence: 1, dependency_work_item_id: null, recipe_action_key: 'STEP_TASK', action_code: 'ACT_TASK', input: taskInput, state: 'COMPLETED' },
      { sequence: 2, dependency_work_item_id: root.id, recipe_action_key: 'STEP_NOTIFY', action_code: 'ACT_NOTIFY', input: { mode: 'SEND_MESSAGE', threadId: 'thread-safe', body: 'Status update' }, state: 'WAITING' },
    ]);
    const { rows: [run] } = await db.query('select state from public.automation_runs where id=$1', [admitted.run_id]);
    assert.equal(run.state, 'WAITING');
    await cancel(employee.run_id); await cancel(admitted.run_id);
  });

  test('holds a Recipe requiring human review before any Step 2 dispatch without enabling external delivery', async () => {
    const recipe = await createGovernedRecipe({ humanReview: true });
    const admitted = await admitGovernedRecipe({ recipe, idempotency: key('governed-review') });
    const { rows: [workItem] } = await db.query('select state,action_code,provider_code from public.automation_work_items where id=$1', [admitted.work_item_id]);
    assert.deepEqual(workItem, { state: 'HUMAN_REVIEW', action_code: 'ACT_TASK', provider_code: 'INTERNAL' });
    const claims = await callSet(db, 'automation_claim_work', ['worker-governed-review', 50, 60]);
    assert.equal(claims.some((claim) => claim.id === admitted.work_item_id), false);
    const { rows: [policy] } = await db.query(`select decision,reason_code from public.automation_policy_decisions where work_item_id=$1 and policy_code='POL_APPROVAL'`, [admitted.work_item_id]);
    assert.deepEqual(policy, { decision: 'HUMAN_REVIEW', reason_code: 'RECIPE_HUMAN_REVIEW' });
    await cancel(admitted.run_id);
  });

  test('authorizes only the current assigned Employee, preserves controls, and writes exactly one event per successful operation', async () => {
    const recipe = await createGovernedRecipe();
    const assignment = await call(db, 'automation_upsert_recipe_assignment', [ids.ownerA, ids.ownerA, recipe.recipe_version_id, ids.actorA, JSON.stringify({ ACT_TASK: [taskHash] }), hash(jsonb({ ACT_TASK: [taskHash] })), 'ACTIVE']);
    const run = await admitGovernedRecipe({ recipe, actor: ids.actorA, actorKind: 'employee', idempotency: key('employee-pause') });
    const before = await db.query(`select count(*)::int as total from public.automation_run_events where run_id=$1`, [run.run_id]);
    const paused = await call(db, 'automation_set_employee_run_pause', [ids.actorA, run.run_id, 'PAUSE']);
    assert.deepEqual({ operation: paused.operation, changed: paused.changed }, { operation: 'pause', changed: true });
    const { rows: [control] } = await db.query(`select paused,emergency_stop,actor_user_id from public.automation_controls where owner_user_id=$1 and scope_type='RUN' and scope_id=$2`, [ids.ownerA, run.run_id]);
    assert.deepEqual(control, { paused: true, emergency_stop: false, actor_user_id: ids.actorA });
    const afterPause = await db.query(`select count(*)::int as total from public.automation_run_events where run_id=$1`, [run.run_id]);
    assert.equal(afterPause.rows[0].total, before.rows[0].total + 1);
    await assert.rejects(call(db, 'automation_set_employee_run_pause', [ids.actorB, run.run_id, 'RESUME']), /AUTOMATION_EMPLOYEE_RUN_DENIED/);
    await assert.rejects(call(db, 'automation_set_employee_run_pause', [ids.ownerA, run.run_id, 'RESUME']), /AUTOMATION_EMPLOYEE_RUN_DENIED/);
    await db.query(`update public.automation_recipe_assignments set status='REVOKED', revoked_at=now() where id=$1`, [assignment.assignment_id]);
    await assert.rejects(call(db, 'automation_set_employee_run_pause', [ids.actorA, run.run_id, 'RESUME']), /AUTOMATION_EMPLOYEE_ASSIGNMENT_DENIED/);
    const afterRejected = await db.query(`select count(*)::int as total from public.automation_run_events where run_id=$1`, [run.run_id]);
    assert.equal(afterRejected.rows[0].total, afterPause.rows[0].total);
    await cancel(run.run_id);
    await assert.rejects(call(db, 'automation_set_employee_run_pause', [ids.actorA, run.run_id, 'PAUSE']), /AUTOMATION_RUN_TERMINAL/);
  });

  test('never clears an Owner emergency stop and serializes concurrent Employee pause with stronger control', async () => {
    const recipe = await createGovernedRecipe();
    await call(db, 'automation_upsert_recipe_assignment', [ids.ownerA, ids.ownerA, recipe.recipe_version_id, ids.actorA, JSON.stringify({ ACT_TASK: [taskHash] }), hash(jsonb({ ACT_TASK: [taskHash] })), 'ACTIVE']);
    const run = await admitGovernedRecipe({ recipe, actor: ids.actorA, actorKind: 'employee', idempotency: key('employee-emergency') });
    await setControl(ids.ownerA, 'OWNER', ids.ownerA, false, 'OWNER_CLEAR');
    const left = new Client({ connectionString }); const right = new Client({ connectionString });
    await Promise.all([left.connect(), right.connect()]);
    try {
      const results = await Promise.allSettled([
        call(left, 'automation_set_employee_run_pause', [ids.actorA, run.run_id, 'PAUSE']),
        right.query(`select public.automation_set_control($1::uuid,$2::text,$3::text,$4::boolean,$5::boolean,$6::text,$7::uuid)`, [ids.ownerA, 'OWNER', ids.ownerA, false, true, 'OWNER_EMERGENCY', ids.ownerA]),
      ]);
      assert.ok(results.every((entry) => entry.status === 'fulfilled'), JSON.stringify(results));
    } finally {
      await Promise.all([left.end(), right.end()]);
    }
    await assert.rejects(call(db, 'automation_set_employee_run_pause', [ids.actorA, run.run_id, 'RESUME']), /AUTOMATION_EMERGENCY_STOP_ACTIVE/);
    const { rows: [ownerControl] } = await db.query(`select paused,emergency_stop,actor_user_id from public.automation_controls where owner_user_id=$1 and scope_type='OWNER' and scope_id=$2`, [ids.ownerA, ids.ownerA]);
    assert.deepEqual(ownerControl, { paused: false, emergency_stop: true, actor_user_id: ids.ownerA });
    const { rows: [runControl] } = await db.query(`select paused,emergency_stop from public.automation_controls where owner_user_id=$1 and scope_type='RUN' and scope_id=$2`, [ids.ownerA, run.run_id]);
    assert.equal(runControl?.emergency_stop || false, false);
    await setControl(ids.ownerA, 'OWNER', ids.ownerA, false, 'OWNER_CLEAR');
    await cancel(run.run_id);
  });

  test('exposes the Employee control RPC only to service_role', async () => {
    const { rows: [privileges] } = await db.query(`select
      has_function_privilege('service_role','public.automation_set_employee_run_pause(uuid,uuid,text)','execute') as service,
      has_function_privilege('anon','public.automation_set_employee_run_pause(uuid,uuid,text)','execute') as anon,
      has_function_privilege('authenticated','public.automation_set_employee_run_pause(uuid,uuid,text)','execute') as authenticated`);
    assert.deepEqual(privileges, { service: true, anon: false, authenticated: false });
  });

  test('serializes Employee operations with cancellation and worker claim without unsafe dispatch', async () => {
    const recipe = await createGovernedRecipe();
    await call(db, 'automation_upsert_recipe_assignment', [ids.ownerA, ids.ownerA, recipe.recipe_version_id, ids.actorA, JSON.stringify({ ACT_TASK: [taskHash] }), hash(jsonb({ ACT_TASK: [taskHash] })), 'ACTIVE']);
    const pauseRun = await admitGovernedRecipe({ recipe, actor: ids.actorA, actorKind: 'employee', idempotency: key('employee-pause-cancel') });
    const left = new Client({ connectionString }); const right = new Client({ connectionString });
    await Promise.all([left.connect(), right.connect()]);
    try {
      await Promise.allSettled([
        call(left, 'automation_set_employee_run_pause', [ids.actorA, pauseRun.run_id, 'PAUSE']),
        call(right, 'automation_cancel_run', [ids.ownerA, pauseRun.run_id, ids.ownerA, 'OWNER_CANCELLED']),
      ]);
    } finally { await Promise.all([left.end(), right.end()]); }
    const { rows: [cancelled] } = await db.query('select state from public.automation_runs where id=$1', [pauseRun.run_id]);
    assert.equal(cancelled.state, 'CANCELLED');

    const resumeRun = await admitGovernedRecipe({ recipe, actor: ids.actorA, actorKind: 'employee', idempotency: key('employee-resume-cancel') });
    await call(db, 'automation_set_employee_run_pause', [ids.actorA, resumeRun.run_id, 'PAUSE']);
    const resumeClient = new Client({ connectionString }); const cancelClient = new Client({ connectionString });
    await Promise.all([resumeClient.connect(), cancelClient.connect()]);
    try {
      await Promise.allSettled([
        call(resumeClient, 'automation_set_employee_run_pause', [ids.actorA, resumeRun.run_id, 'RESUME']),
        call(cancelClient, 'automation_cancel_run', [ids.ownerA, resumeRun.run_id, ids.ownerA, 'OWNER_CANCELLED']),
      ]);
    } finally { await Promise.all([resumeClient.end(), cancelClient.end()]); }
    const { rows: [resumeCancelled] } = await db.query('select state from public.automation_runs where id=$1', [resumeRun.run_id]);
    assert.equal(resumeCancelled.state, 'CANCELLED');

    const workerRun = await admitGovernedRecipe({ recipe, actor: ids.actorA, actorKind: 'employee', idempotency: key('employee-worker-claim') });
    await call(db, 'automation_set_employee_run_pause', [ids.actorA, workerRun.run_id, 'PAUSE']);
    const claimed = await callSet(db, 'automation_claim_work', ['worker-paused-employee-run', 50, 60]);
    assert.equal(claimed.some((item) => item.run_id === workerRun.run_id), false);
    await cancel(workerRun.run_id);
  });
});


test('persists owner-scoped, idempotent POL_SCORE evidence without admitting or dispatching work', { concurrency: false }, async () => {
  const recipe = await createGovernedRecipe();
  const input = {
    prospect: { title: 'Founder', company: 'BrightReach Agency', industry: 'Marketing', location: 'Gurgaon, India', email: 'founder@brightreach.test' },
    clientIcp: {
      titles: ['Founder', 'Head of Sales'], industries: ['Marketing'], locations: ['India'], keywords: ['agency', 'outbound', 'b2b'],
      scoringWeights: { title: 10, industry: 8, location: 4, keyword: 2, email: 2 }, qualifyThreshold: 15, hotThreshold: 24,
      disqualifiers: ['student', 'intern', 'freelance', 'unemployed', 'looking for work'],
    },
  };
  const evaluation = evaluateScorePolicyV1(input);
  const idempotency = key('score-policy');
  const requestHash = hash(jsonb({ policy: 'POL_SCORE@V1', recipeCode: recipe.code, input }));
  const before = await db.query(`select
    (select count(*)::int from public.automation_trigger_inbox where owner_user_id=$1) as inboxes,
    (select count(*)::int from public.automation_runs where owner_user_id=$1) as runs,
    (select count(*)::int from public.automation_work_items where owner_user_id=$1) as work`, [ids.ownerA]);
  const args = [ids.ownerA, ids.ownerA, recipe.code, JSON.stringify(input), idempotency, requestHash,
    evaluation.safeMetadata.score, evaluation.safeMetadata.qualified, evaluation.safeMetadata.hot,
    evaluation.decision, evaluation.reasonCode, JSON.stringify(evaluation.safeMetadata)];
  const first = await call(db, 'automation_evaluate_recipe_score_policy', args);
  const replay = await call(db, 'automation_evaluate_recipe_score_policy', args);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual({ correlation_id: replay.correlation_id, decision: replay.decision, score: replay.score }, {
    correlation_id: first.correlation_id, decision: 'ALLOW', score: evaluation.safeMetadata.score,
  });
  const { rows: [evidence] } = await db.query(`select owner_user_id,recipe_version_id,configuration_sha256,policy_code,policy_version,decision,reason_code,
    evaluated_input_sha256,safe_metadata,correlation_id,idempotency_key,request_sha256,created_at
    from public.automation_policy_decisions where owner_user_id=$1 and idempotency_key=$2`, [ids.ownerA, idempotency]);
  assert.deepEqual({ owner_user_id: evidence.owner_user_id, recipe_version_id: evidence.recipe_version_id, configuration_sha256: evidence.configuration_sha256,
    policy_code: evidence.policy_code, policy_version: evidence.policy_version, decision: evidence.decision, reason_code: evidence.reason_code,
    evaluated_input_sha256: evidence.evaluated_input_sha256, safe_metadata: evidence.safe_metadata, idempotency_key: evidence.idempotency_key, request_sha256: evidence.request_sha256 }, {
    owner_user_id: ids.ownerA, recipe_version_id: recipe.recipe_version_id, configuration_sha256: hash(jsonb(recipe.definition)),
    policy_code: 'POL_SCORE', policy_version: 'V1', decision: 'ALLOW', reason_code: 'ICP_QUALIFIED',
    evaluated_input_sha256: inputHash(input), safe_metadata: evaluation.safeMetadata, idempotency_key: idempotency, request_sha256: requestHash,
  });
  assert.match(evidence.correlation_id, /^[0-9a-f-]{36}$/i);
  assert.ok(evidence.created_at);
  const after = await db.query(`select
    (select count(*)::int from public.automation_trigger_inbox where owner_user_id=$1) as inboxes,
    (select count(*)::int from public.automation_runs where owner_user_id=$1) as runs,
    (select count(*)::int from public.automation_work_items where owner_user_id=$1) as work`, [ids.ownerA]);
  assert.deepEqual(after.rows[0], before.rows[0]);
  await assert.rejects(call(db, 'automation_evaluate_recipe_score_policy', [
    ids.ownerA, ids.ownerA, recipe.code, JSON.stringify({ ...input, prospect: { ...input.prospect, company: 'Changed Company' } }), idempotency,
    hash(jsonb({ policy: 'POL_SCORE@V1', recipeCode: recipe.code, input: { ...input, prospect: { ...input.prospect, company: 'Changed Company' } } })),
    evaluation.safeMetadata.score, evaluation.safeMetadata.qualified, evaluation.safeMetadata.hot, evaluation.decision, evaluation.reasonCode, JSON.stringify(evaluation.safeMetadata),
  ]), /AUTOMATION_IDEMPOTENCY_CONFLICT/);
  await assert.rejects(call(db, 'automation_evaluate_recipe_score_policy', [
    ids.ownerB, ids.ownerB, recipe.code, JSON.stringify(input), key('score-cross-owner'), requestHash,
    evaluation.safeMetadata.score, evaluation.safeMetadata.qualified, evaluation.safeMetadata.hot, evaluation.decision, evaluation.reasonCode, JSON.stringify(evaluation.safeMetadata),
  ]), /AUTOMATION_RECIPE_NOT_ACTIVE/);
});


test('admits only bounded owner-scoped ACT_APOLLO_SEARCH work and records derived provider audit identifiers without CRM or outreach work', { concurrency: false }, async () => {
  const code = recipeCode('APOLLO_READ');
  const definition = {
    recipeCode: code,
    inputSchema: {
      properties: { titles: { type: 'array' }, locations: { type: 'array' }, industries: { type: 'array' }, limit: { type: 'number' } },
      required: ['titles', 'locations', 'industries', 'limit'],
    },
    steps: [{ stepCode: 'STEP_APOLLO', sequence: 1, actionCode: 'ACT_APOLLO_SEARCH', policies: ['POL_APPROVAL@V1', 'POL_LIMIT@V1'], requiresHumanReview: false }],
  };
  const recipe = await call(db, 'automation_create_recipe', [ids.ownerA, ids.ownerA, code, JSON.stringify(definition), hash(jsonb(definition))]);
  for (const transition of ['SUBMIT_REVIEW', 'APPROVE', 'ACTIVATE']) {
    await call(db, 'automation_transition_recipe_lifecycle', [ids.ownerA, ids.ownerA, recipe.recipe_id, recipe.recipe_version_id, transition]);
  }
  const input = { titles: ['Founder'], locations: ['New York'], industries: ['Software'], limit: 2 };
  const dueAt = new Date(Date.now() - 1_000).toISOString();
  const idempotency = key('apollo-read');
  const requestHash = hash(jsonb({ recipeCode: code, input, dueAt }));
  const first = await call(db, 'automation_admit_recipe_run', [ids.ownerA, ids.ownerA, 'owner', code, JSON.stringify(input), dueAt, idempotency, requestHash]);
  const replay = await call(db, 'automation_admit_recipe_run', [ids.ownerA, ids.ownerA, 'owner', code, JSON.stringify(input), dueAt, idempotency, requestHash]);
  assert.deepEqual({ replayed: first.replayed, state: first.state }, { replayed: false, state: 'WAITING' });
  assert.deepEqual(replay, { trigger_id: first.trigger_id, run_id: first.run_id, replayed: true });
  const { rows: [stored] } = await db.query(`select action_code,provider_code,input,input_sha256,provider_idempotency_key,provider_correlation_id
    from public.automation_work_items where id=$1`, [first.work_item_id]);
  assert.deepEqual({ action_code: stored.action_code, provider_code: stored.provider_code, input: stored.input }, { action_code: 'ACT_APOLLO_SEARCH', provider_code: 'APOLLO', input });
  assert.equal(stored.input_sha256, inputHash(input));
  assert.equal(stored.provider_idempotency_key, null);
  assert.equal(stored.provider_correlation_id, null);

  await call(db, 'automation_configure_apollo_read', [ids.ownerA, ids.ownerA, true, 5, 1]);
  const claimed = await claimFor(first.run_id, 'worker-apollo-read');
  assert.equal(claimed.provider_code, 'APOLLO');
  const dispatched = await call(db, 'automation_mark_dispatching', [claimed.id, claimed.worker, claimed.lease_token]);
  assert.equal(dispatched.allowed, true);
  const { rows: [dispatchedWork] } = await db.query(`select provider_idempotency_key,provider_correlation_id from public.automation_work_items where id=$1`, [claimed.id]);
  const { rows: [run] } = await db.query('select correlation_id from public.automation_runs where id=$1', [first.run_id]);
  assert.deepEqual(dispatchedWork, {
    provider_idempotency_key: `phase11:APOLLO:ACT_APOLLO_SEARCH:${claimed.id}`,
    provider_correlation_id: `phase11:APOLLO:${run.correlation_id}`,
  });
  const { rows: [event] } = await db.query(`select event_code,action_code,safe_metadata from public.automation_run_events
    where work_item_id=$1 and event_code='WORK_DISPATCHING'`, [claimed.id]);
  assert.deepEqual(event, { event_code: 'WORK_DISPATCHING', action_code: 'ACT_APOLLO_SEARCH', safe_metadata: { provider_code: 'APOLLO' } });

  const invalid = { ...input, limit: 51 };
  await assert.rejects(call(db, 'automation_admit_recipe_run', [ids.ownerA, ids.ownerA, 'owner', code, JSON.stringify(invalid), dueAt, key('apollo-invalid'), hash(jsonb({ recipeCode: code, input: invalid, dueAt }))]), /AUTOMATION_APOLLO_INPUT_INVALID/);
  await assert.rejects(call(db, 'automation_admit_recipe_run', [ids.ownerB, ids.ownerB, 'owner', code, JSON.stringify(input), dueAt, key('apollo-cross-owner'), requestHash]), /AUTOMATION_RECIPE_NOT_ACTIVE/);
  const { rows: sideEffects } = await db.query(`select action_code from public.automation_work_items where run_id=$1`, [first.run_id]);
  assert.deepEqual(sideEffects, [{ action_code: 'ACT_APOLLO_SEARCH' }]);
  await cancel(first.run_id);
});


test('Apollo stays disabled without explicit owner configuration and the durable configuration is owner-scoped', { concurrency: false }, async () => {
  await call(db, 'automation_configure_apollo_read', [ids.ownerA, ids.ownerA, false, null, null]);
  const recipe = await createApolloRecipe();
  const blockedRun = await admitApolloRecipe({ recipe, idempotency: key('apollo-disabled') });
  await callSet(db, 'automation_claim_work', ['worker-apollo-disabled', 50, 60]);
  const blocked = await work(blockedRun.run_id);
  assert.deepEqual({ state: blocked.state, reason: blocked.last_reason_code, attempts: blocked.attempt_count, lease: blocked.lease_token }, { state: 'BLOCKED', reason: 'APOLLO_PROVIDER_NOT_READY', attempts: 0, lease: null });

  await call(db, 'automation_configure_apollo_read', [ids.ownerA, ids.ownerA, true, 3, 1]);
  const ownerBRecipe = await createApolloRecipe({ owner: ids.ownerB, actor: ids.ownerB });
  const ownerBRun = await admitApolloRecipe({ recipe: ownerBRecipe, owner: ids.ownerB, actor: ids.ownerB, idempotency: key('apollo-owner-b') });
  await callSet(db, 'automation_claim_work', ['worker-apollo-owner-b-disabled', 50, 60]);
  const ownerBBlocked = await work(ownerBRun.run_id);
  assert.deepEqual({ state: ownerBBlocked.state, reason: ownerBBlocked.last_reason_code, attempts: ownerBBlocked.attempt_count }, { state: 'BLOCKED', reason: 'APOLLO_PROVIDER_NOT_READY', attempts: 0 });
  await assert.rejects(call(db, 'automation_configure_apollo_read', [ids.ownerB, ids.ownerA, true, 1, 1]), /AUTOMATION_OWNER_ACCESS_DENIED|AUTOMATION_ASSIGNMENT_SCOPE_DENIED|AUTOMATION_/);
  const { rows: configs } = await db.query(`select owner_user_id,enabled,max_requests_per_window,max_concurrent_requests from public.automation_provider_action_configs order by owner_user_id`);
  assert.ok(configs.some((row) => row.owner_user_id === ids.ownerA && row.enabled && row.max_requests_per_window === 3 && row.max_concurrent_requests === 1));
  assert.equal(configs.some((row) => row.owner_user_id === ids.ownerB && row.enabled), false);
});

test('Apollo reservations, safe summaries, replay, and recovery remain single-work-item and lease safe', { concurrency: false }, async () => {
  await call(db, 'automation_configure_apollo_read', [ids.ownerA, ids.ownerA, true, 8, 1]);
  const recipe = await createApolloRecipe();
  const firstIdempotency = key('apollo-complete');
  const firstDueAt = new Date(Date.now() - 1_000).toISOString();
  const first = await admitApolloRecipe({ recipe, idempotency: firstIdempotency, dueAt: firstDueAt });
  const replay = await admitApolloRecipe({ recipe, idempotency: firstIdempotency, dueAt: firstDueAt });
  assert.deepEqual(replay, { trigger_id: first.trigger_id, run_id: first.run_id, replayed: true });
  const claimed = await claimFor(first.run_id, 'worker-apollo-complete');
  const second = await admitApolloRecipe({ recipe, idempotency: key('apollo-concurrent') });
  await callSet(db, 'automation_claim_work', ['worker-apollo-concurrent', 50, 60]);
  const quotaBlocked = await work(second.run_id);
  assert.deepEqual({ state: quotaBlocked.state, attempts: quotaBlocked.attempt_count, reason: quotaBlocked.last_reason_code }, { state: 'BLOCKED', attempts: 0, reason: 'QUOTA_DENIED' });
  await call(db, 'automation_mark_dispatching', [claimed.id, claimed.worker, claimed.lease_token]);
  const { rows: [run] } = await db.query('select correlation_id from public.automation_runs where id=$1', [first.run_id]);
  const complete = { provider: 'APOLLO', outcome: 'COMPLETE_SUCCESS', completeness: 'COMPLETE', returnedCount: 2, providerCorrelationId: `phase11:APOLLO:${run.correlation_id}` };
  await call(db, 'automation_transition_work', [claimed.id, claimed.worker, claimed.lease_token, 'RUNNING', 'COMPLETED', 'ACTION_COMPLETED', JSON.stringify(complete), null]);
  const { rows: [stored] } = await db.query('select owner_user_id,state,result_metadata from public.automation_work_items where id=$1', [claimed.id]);
  assert.deepEqual(stored, { owner_user_id: ids.ownerA, state: 'COMPLETED', result_metadata: complete });
  const late = await call(db, 'automation_transition_work', [claimed.id, claimed.worker, claimed.lease_token, 'RUNNING', 'COMPLETED', 'LATE_RESULT', JSON.stringify(complete), null]);
  assert.equal(late.late, true);
  const { rows: resultRows } = await db.query('select id from public.automation_work_items where run_id=$1 and result_metadata=$2::jsonb', [first.run_id, JSON.stringify(complete)]);
  assert.equal(resultRows.length, 1);

  const retry = await admitApolloRecipe({ recipe, idempotency: key('apollo-retry') });
  const retryClaim = await claimFor(retry.run_id, 'worker-apollo-retry');
  await call(db, 'automation_mark_dispatching', [retryClaim.id, retryClaim.worker, retryClaim.lease_token]);
  const { rows: [retryRun] } = await db.query('select correlation_id from public.automation_runs where id=$1', [retry.run_id]);
  const retryResult = { provider: 'APOLLO', outcome: 'RETRYABLE_FAILURE', completeness: 'UNKNOWN', providerCorrelationId: `phase11:APOLLO:${retryRun.correlation_id}`, code: 'APOLLO_RATE_LIMIT' };
  await call(db, 'automation_transition_work', [retryClaim.id, retryClaim.worker, retryClaim.lease_token, 'RUNNING', 'RETRYABLE', 'APOLLO_RATE_LIMIT', JSON.stringify(retryResult), new Date(Date.now() - 1_000).toISOString()]);
  const { rows: [released] } = await db.query('select count(*) filter(where active)::int as active from public.automation_work_reservations where work_item_id=$1', [retryClaim.id]);
  assert.equal(released.active, 0);
  const retryClaimedAgain = await claimFor(retry.run_id, 'worker-apollo-retry-again');
  assert.equal(retryClaimedAgain.id, retryClaim.id);
  await call(db, 'automation_mark_dispatching', [retryClaimedAgain.id, retryClaimedAgain.worker, retryClaimedAgain.lease_token]);
  await db.query(`update public.automation_work_items set lease_until=now()-interval '1 second' where id=$1`, [retryClaimedAgain.id]);
  const recovered = await callSet(db, 'automation_recover_stale', [50]);
  assert.ok(recovered.some((entry) => entry.work_item_id === retryClaimedAgain.id && entry.state === 'HUMAN_REVIEW'));
  const { rows: [unknown] } = await db.query('select state,result_metadata from public.automation_work_items where id=$1', [retryClaimedAgain.id]);
  assert.deepEqual(unknown, { state: 'HUMAN_REVIEW', result_metadata: { provider: 'APOLLO', outcome: 'UNKNOWN_OUTCOME', completeness: 'UNKNOWN', providerCorrelationId: `phase11:APOLLO:${retryRun.correlation_id}`, code: 'LEASE_EXPIRED_DISPATCHING' } });
  await cancel(retry.run_id);
  await call(db, 'automation_configure_apollo_read', [ids.ownerA, ids.ownerA, false, null, null]);
});


test('derives owner-scoped operational health from durable work and recovery evidence without a metrics store', { concurrency: false }, async () => {
  const eligible = await createRun({ idempotency: key('operational-eligible') });
  const delayed = await createRun({ idempotency: key('operational-delayed'), dueAt: new Date(Date.now() + 3_600_000).toISOString() });
  const staleRun = await createRun({ idempotency: key('operational-stale') });
  const { rows: [stale] } = await db.query(`update public.automation_work_items
    set state='RUNNING',attempt_count=1,attempt_phase='CLAIMED',lease_owner='worker-operational-stale',lease_token=gen_random_uuid(),lease_until=now()-interval '1 second'
    where run_id=$1 returning id`, [staleRun.run_id]);
  assert.ok(stale?.id);

  const beforeRecovery = await call(db, 'automation_get_owner_operational_health', [ids.ownerA, ids.ownerA]);
  assert.equal(beforeRecovery.queue.eligibleCount >= 1, true);
  assert.equal(beforeRecovery.queue.delayedCount >= 1, true);
  assert.equal(beforeRecovery.leases.staleCount, 1);
  assert.equal(beforeRecovery.leases.staleClaimedCount, 1);
  assert.equal(beforeRecovery.leases.staleDispatchingCount, 0);
  assert.equal(typeof beforeRecovery.observedAt, 'string');
  assert.equal(Object.hasOwn(beforeRecovery, 'workerId'), false);
  assert.equal(Object.hasOwn(beforeRecovery, 'input'), false);

  await callSet(db, 'automation_recover_stale', [50]);
  const afterRecovery = await call(db, 'automation_get_owner_operational_health', [ids.ownerA, ids.ownerA]);
  assert.equal(afterRecovery.leases.staleCount, 0);
  assert.equal(afterRecovery.recovery.recoveredLast24h >= 1, true);
  const otherOwner = await call(db, 'automation_get_owner_operational_health', [ids.ownerB, ids.ownerB]);
  assert.equal(otherOwner.recovery.recoveredLast24h, 0);
  await assert.rejects(call(db, 'automation_get_owner_operational_health', [ids.ownerA, ids.actorA]), /AUTOMATION_OWNER_SCOPE_DENIED/);

  for (const runId of [eligible.run_id, delayed.run_id, staleRun.run_id]) await cancel(runId);
});
