import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScorePolicyV1 } from '../src/modules/automation/automation.recipe-policy.policy.js';
import { assertRecipeDefinition, assertScorePolicyInput, sha256 } from '../src/modules/automation/automation.recipe-policy.validation.js';

const scoreInput = Object.freeze({
  prospect: { title: 'Founder', company: 'BrightReach Agency', industry: 'Marketing', location: 'Gurgaon, India', email: 'founder@brightreach.test' },
  clientIcp: {
    titles: ['Founder', 'Head of Sales'], industries: ['Marketing'], locations: ['India'], keywords: ['agency', 'outbound', 'b2b'],
    scoringWeights: { title: 10, industry: 8, location: 4, keyword: 2, email: 2 }, qualifyThreshold: 15, hotThreshold: 24,
    disqualifiers: ['student', 'intern', 'freelance', 'unemployed', 'looking for work'],
  },
});

function recipeWithScorePolicy() {
  return {
    recipeCode: 'RCP_SCORE_AUDIT_ONLY',
    inputSchema: { properties: { mode: { type: 'string' }, projectId: { type: 'string' }, taskId: { type: 'string' }, patch: { type: 'object' } }, required: ['mode', 'projectId', 'taskId', 'patch'] },
    steps: [{ stepCode: 'STEP_TASK', sequence: 1, actionCode: 'ACT_TASK', policies: ['POL_APPROVAL@V1', 'POL_SCORE@V1'], requiresHumanReview: false }],
  };
}

test('POL_SCORE@V1 reuses the deterministic scorer and normalizes input before hashing', () => {
  const reordered = { clientIcp: { ...scoreInput.clientIcp }, prospect: { ...scoreInput.prospect } };
  const first = evaluateScorePolicyV1(scoreInput);
  const second = evaluateScorePolicyV1(reordered);
  assert.deepEqual(first, second);
  assert.equal(sha256(assertScorePolicyInput(scoreInput)), sha256(assertScorePolicyInput(reordered)));
  assert.equal(first.policyCode, 'POL_SCORE');
  assert.equal(first.safeMetadata.scorer, 'ICP_SCORER_V1');
});

test('POL_SCORE@V1 allows a qualified deterministic ICP fit', () => {
  const result = evaluateScorePolicyV1(scoreInput);
  assert.deepEqual({ decision: result.decision, reasonCode: result.reasonCode, qualified: result.safeMetadata.qualified, hot: result.safeMetadata.hot }, {
    decision: 'ALLOW', reasonCode: 'ICP_QUALIFIED', qualified: true, hot: true,
  });
  assert.ok(result.safeMetadata.score >= 24);
});

test('POL_SCORE@V1 blocks an unqualified deterministic ICP fit', () => {
  const result = evaluateScorePolicyV1({
    ...scoreInput,
    prospect: { title: 'Student Intern', company: 'College', industry: 'Education', location: 'Elsewhere', email: 'student@college.test' },
  });
  assert.deepEqual({ decision: result.decision, reasonCode: result.reasonCode, score: result.safeMetadata.score, qualified: result.safeMetadata.qualified }, {
    decision: 'BLOCK', reasonCode: 'ICP_NOT_QUALIFIED', score: 0, qualified: false,
  });
});

test('POL_SCORE@V1 fails closed for incomplete, malformed, or dynamic score input', () => {
  assert.doesNotThrow(() => evaluateScorePolicyV1(scoreInput));
  assert.throws(() => evaluateScorePolicyV1({ ...scoreInput, prospect: { ...scoreInput.prospect, email: undefined } }), /AUTOMATION_SCORE_INPUT_INVALID/);
  assert.throws(() => evaluateScorePolicyV1({ ...scoreInput, clientIcp: { ...scoreInput.clientIcp, scoringWeights: { title: 10 } } }), /AUTOMATION_SCORE_INPUT_INVALID/);
  assert.throws(() => evaluateScorePolicyV1({ ...scoreInput, unexpected: 'browser-expression' }), /AUTOMATION_SCORE_INPUT_INVALID/);
});

test('POL_SCORE@V1 remains audit-only and cannot be browser-enabled in recipe admission', () => {
  assert.throws(() => assertRecipeDefinition(recipeWithScorePolicy()), /AUTOMATION_POLICY_INVALID/);
});
