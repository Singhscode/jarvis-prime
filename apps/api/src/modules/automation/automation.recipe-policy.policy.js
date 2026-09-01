import { scoreProspect } from '../prospects/icp-scorer.js';
import { assertScorePolicyInput, DISABLED_POLICY_CODES, FIXED_POLICY_KEYS } from './automation.recipe-policy.validation.js';

const APPROVAL_POLICY = Object.freeze({ code: 'POL_APPROVAL', version: 'V1', key: 'POL_APPROVAL@V1' });
const LIMIT_POLICY = Object.freeze({ code: 'POL_LIMIT', version: 'V1', key: 'POL_LIMIT@V1', enforcedBy: 'STEP_2_CLAIM' });
const SCORE_POLICY = Object.freeze({ code: 'POL_SCORE', version: 'V1', evaluation: 'DETERMINISTIC_AUDIT_ONLY' });

export function listPolicyRegistry() {
  return Object.freeze([
    { ...APPROVAL_POLICY, enabled: true, evaluation: 'STATIC_RECIPE_REVIEW' },
    { ...LIMIT_POLICY, enabled: true, evaluation: 'STEP_2_DURABLE_QUOTA' },
    { ...SCORE_POLICY, enabled: true },
    ...DISABLED_POLICY_CODES.map((code) => ({ code, version: 'V1', enabled: false, evaluation: 'DISABLED' })),
  ]);
}

// This is a fixed, non-side-effecting policy evaluation. It deliberately is not a
// browser-selectable recipe-step policy and never admits or dispatches work by itself.
export function evaluateScorePolicyV1(value) {
  const input = assertScorePolicyInput(value);
  const score = scoreProspect(input.prospect, {
    icp_titles: input.clientIcp.titles,
    icp_industries: input.clientIcp.industries,
    icp_locations: input.clientIcp.locations,
    icp_keywords: input.clientIcp.keywords,
    config: {
      scoringWeights: input.clientIcp.scoringWeights,
      qualifyThreshold: input.clientIcp.qualifyThreshold,
      hotThreshold: input.clientIcp.hotThreshold,
      disqualifiers: input.clientIcp.disqualifiers,
    },
  });
  const decision = score.qualified ? 'ALLOW' : 'BLOCK';
  const reasonCode = score.qualified ? 'ICP_QUALIFIED' : 'ICP_NOT_QUALIFIED';
  return Object.freeze({
    policyCode: SCORE_POLICY.code,
    policyVersion: SCORE_POLICY.version,
    decision,
    reasonCode,
    input,
    safeMetadata: Object.freeze({ scorer: 'ICP_SCORER_V1', score: score.score, qualified: score.qualified, hot: score.hot, reasons: score.reasons }),
  });
}

export function evaluateAdmissionPolicies(step) {
  if (!step || !Array.isArray(step.policies) || !step.policies.includes(APPROVAL_POLICY.key) || step.policies.some((key) => !FIXED_POLICY_KEYS.includes(key))) {
    throw new Error('AUTOMATION_POLICY_INVALID');
  }
  if (step.requiresHumanReview) return Object.freeze({ decision: 'HUMAN_REVIEW', reasonCode: 'RECIPE_HUMAN_REVIEW', evidence: { policyCode: APPROVAL_POLICY.code, policyVersion: APPROVAL_POLICY.version } });
  return Object.freeze({ decision: 'ALLOW', reasonCode: 'RECIPE_APPROVED', evidence: { policyCode: APPROVAL_POLICY.code, policyVersion: APPROVAL_POLICY.version } });
}
