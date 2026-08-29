import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAssignmentInputs,
  assertRecipeDefinition,
  assertRecipeInput,
  sha256,
} from '../src/modules/automation/automation.recipe-policy.validation.js';
import { evaluateAdmissionPolicies, listPolicyRegistry } from '../src/modules/automation/automation.recipe-policy.policy.js';

function definition(overrides = {}) {
  const root = {
    stepCode: 'STEP_TASK', sequence: 1, actionCode: 'ACT_TASK',
    policies: ['POL_APPROVAL@V1', 'POL_LIMIT@V1'], requiresHumanReview: false,
  };
  return {
    recipeCode: 'RCP_SAFE_TASK_FLOW',
    inputSchema: {
      properties: { mode: { type: 'string' }, projectId: { type: 'string' }, taskId: { type: 'string' }, patch: { type: 'object' } },
      required: ['mode', 'projectId', 'taskId', 'patch'],
    },
    steps: [root],
    ...overrides,
  };
}

test('Recipe definitions accept only a bounded, linear static graph and typed root input', () => {
  const value = definition();
  assert.equal(assertRecipeDefinition(value), value);
  assert.deepEqual(assertRecipeInput(value, { mode: 'UPDATE', projectId: 'project-1', taskId: 'task-1', patch: { completed: true } }), { mode: 'UPDATE', projectId: 'project-1', taskId: 'task-1', patch: { completed: true } });
  assert.throws(() => assertRecipeInput(value, { mode: 'UPDATE', projectId: 'project-1', taskId: 'task-1', patch: {}, unknown: true }), /AUTOMATION_RECIPE_INPUT_INVALID/);
  assert.throws(() => assertRecipeInput(value, { mode: 'UPDATE', projectId: 'project-1', taskId: 'task-1', patch: 'not-an-object' }), /AUTOMATION_RECIPE_INPUT_INVALID/);
  assert.match(sha256(value), /^[a-f0-9]{64}$/);
});

test('Recipe validation fails closed for unknown fields, dynamic content, invalid graph shapes and disabled execution codes', () => {
  assert.throws(() => assertRecipeDefinition({ ...definition(), unexpected: true }), /AUTOMATION_RECIPE_DEFINITION_INVALID/);
  assert.throws(() => assertRecipeDefinition(definition({ steps: [{ ...definition().steps[0], actionCode: 'ACT_EMAIL' }] })), /AUTOMATION_RECIPE_GRAPH_INVALID/);
  assert.throws(() => assertRecipeDefinition(definition({ steps: [{ ...definition().steps[0], policies: ['POL_SCORE@V1'] }] })), /AUTOMATION_POLICY_INVALID/);
  assert.throws(() => assertRecipeDefinition(definition({ steps: [{ ...definition().steps[0], input: { taskId: 'forbidden-on-root' } }] })), /AUTOMATION_RECIPE_GRAPH_INVALID/);
  assert.throws(() => assertRecipeDefinition(definition({ steps: [
    definition().steps[0],
    { stepCode: 'STEP_NOTIFY', sequence: 2, actionCode: 'ACT_NOTIFY', dependsOn: 'STEP_OTHER', input: { mode: 'SEND_MESSAGE', threadId: 'thread-1', body: 'Update' }, policies: ['POL_APPROVAL@V1'], requiresHumanReview: false },
  ] })), /AUTOMATION_RECIPE_GRAPH_INVALID/);
  assert.throws(() => assertRecipeDefinition(definition({ steps: [{ ...definition().steps[0], input: undefined, policies: ['POL_APPROVAL@V1'], requiresHumanReview: false, dynamic: 'https://example.test' }] })), /AUTOMATION_RECIPE_DYNAMIC_CONTENT/);
  assert.throws(() => assertRecipeDefinition({ ...definition(), inputSchema: { properties: { callback: { type: 'string' } }, required: [], url: 'https://example.test' } }), /AUTOMATION_RECIPE_DYNAMIC_CONTENT/);
  assert.throws(() => assertAssignmentInputs({ ACT_EMAIL: ['a'.repeat(64)] }), /AUTOMATION_ASSIGNMENT_INVALID/);
});

test('the policy registry is fixed and only static approval can admit or hold a Recipe for review', () => {
  const registry = listPolicyRegistry();
  assert.deepEqual(registry.map((policy) => [policy.code, policy.enabled]), [
    ['POL_APPROVAL', true], ['POL_LIMIT', true], ['POL_SCORE', false], ['POL_REPLY', false],
  ]);
  assert.deepEqual(evaluateAdmissionPolicies(definition().steps[0]), {
    decision: 'ALLOW', reasonCode: 'RECIPE_APPROVED', evidence: { policyCode: 'POL_APPROVAL', policyVersion: 'V1' },
  });
  assert.deepEqual(evaluateAdmissionPolicies({ ...definition().steps[0], requiresHumanReview: true }), {
    decision: 'HUMAN_REVIEW', reasonCode: 'RECIPE_HUMAN_REVIEW', evidence: { policyCode: 'POL_APPROVAL', policyVersion: 'V1' },
  });
  assert.throws(() => evaluateAdmissionPolicies({ policies: ['POL_SCORE@V1'], requiresHumanReview: false }), /AUTOMATION_POLICY_INVALID/);
});
