import { DISABLED_POLICY_CODES, FIXED_POLICY_KEYS } from './automation.recipe-policy.validation.js';

const APPROVAL_POLICY = Object.freeze({ code: 'POL_APPROVAL', version: 'V1', key: 'POL_APPROVAL@V1' });
const LIMIT_POLICY = Object.freeze({ code: 'POL_LIMIT', version: 'V1', key: 'POL_LIMIT@V1', enforcedBy: 'STEP_2_CLAIM' });

export function listPolicyRegistry() {
  return Object.freeze([
    { ...APPROVAL_POLICY, enabled: true, evaluation: 'STATIC_RECIPE_REVIEW' },
    { ...LIMIT_POLICY, enabled: true, evaluation: 'STEP_2_DURABLE_QUOTA' },
    ...DISABLED_POLICY_CODES.map((code) => ({ code, version: 'V1', enabled: false, evaluation: 'DISABLED' })),
  ]);
}

export function evaluateAdmissionPolicies(step) {
  if (!step || !Array.isArray(step.policies) || !step.policies.includes(APPROVAL_POLICY.key) || step.policies.some((key) => !FIXED_POLICY_KEYS.includes(key))) {
    throw new Error('AUTOMATION_POLICY_INVALID');
  }
  if (step.requiresHumanReview) return Object.freeze({ decision: 'HUMAN_REVIEW', reasonCode: 'RECIPE_HUMAN_REVIEW', evidence: { policyCode: APPROVAL_POLICY.code, policyVersion: APPROVAL_POLICY.version } });
  return Object.freeze({ decision: 'ALLOW', reasonCode: 'RECIPE_APPROVED', evidence: { policyCode: APPROVAL_POLICY.code, policyVersion: APPROVAL_POLICY.version } });
}
