import { createHash } from 'node:crypto';

export const RECIPE_ACTION_CODES = Object.freeze(['ACT_ASSIGN', 'ACT_TASK', 'ACT_NOTIFY']);
export const FIXED_POLICY_KEYS = Object.freeze(['POL_APPROVAL@V1', 'POL_LIMIT@V1']);
export const DISABLED_POLICY_CODES = Object.freeze(['POL_SCORE', 'POL_REPLY']);
export const RECIPE_LIFECYCLE_TRANSITIONS = Object.freeze(['SUBMIT_REVIEW', 'APPROVE', 'ACTIVATE', 'PAUSE', 'ARCHIVE']);
export const RECIPE_STATUSES = Object.freeze(['DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'ARCHIVED']);

const CODE = /^RCP_[A-Z0-9_]{3,60}$/;
const STEP = /^[A-Z][A-Z0-9_]{2,60}$/;
const FIELD = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;
const HASH = /^[0-9a-f]{64}$/;
const UNSAFE_KEYS = new Set(['url', 'uri', 'sql', 'query', 'code', 'script', 'expression', 'module', 'import', 'require', 'credential', 'credentials', 'secret', 'token', 'password', 'provider', 'webhook']);

function invalid(code = 'AUTOMATION_RECIPE_DEFINITION_INVALID') { throw new Error(code); }
function object(value, code) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Buffer.byteLength(JSON.stringify(value)) > 65536) invalid(code);
  return value;
}
function exact(value, keys, code) {
  object(value, code);
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid(code);
  return value;
}
function safeJson(value) {
  if (Array.isArray(value)) return value.forEach(safeJson);
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /^\s*(https?:\/\/|javascript:|data:)/i.test(value)) invalid('AUTOMATION_RECIPE_DYNAMIC_CONTENT');
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key.toLowerCase())) invalid('AUTOMATION_RECIPE_DYNAMIC_CONTENT');
    safeJson(child);
  }
}
function validateInputSchema(schema) {
  exact(schema, ['properties', 'required'], 'AUTOMATION_RECIPE_SCHEMA_INVALID');
  object(schema.properties, 'AUTOMATION_RECIPE_SCHEMA_INVALID');
  if (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== 'string' || !Object.hasOwn(schema.properties, key))) invalid('AUTOMATION_RECIPE_SCHEMA_INVALID');
  for (const [name, property] of Object.entries(schema.properties)) {
    if (!FIELD.test(name)) invalid('AUTOMATION_RECIPE_SCHEMA_INVALID');
    exact(property, ['type'], 'AUTOMATION_RECIPE_SCHEMA_INVALID');
    if (!['string', 'number', 'boolean', 'object', 'array'].includes(property.type)) invalid('AUTOMATION_RECIPE_SCHEMA_INVALID');
  }
}
function validatePolicies(policies) {
  if (!Array.isArray(policies) || policies.length < 1 || new Set(policies).size !== policies.length || !policies.includes('POL_APPROVAL@V1') || policies.some((policy) => !FIXED_POLICY_KEYS.includes(policy))) invalid('AUTOMATION_POLICY_INVALID');
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(', ')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort((left, right) => left.length - right.length || left.localeCompare(right)).map((key) => `${JSON.stringify(key)}: ${stableJson(value[key])}`).join(', ')}}`;
  return JSON.stringify(value);
}
export function sha256(value) { return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex'); }
export function assertRecipeCode(value) { if (typeof value !== 'string' || !CODE.test(value)) invalid('AUTOMATION_RECIPE_CODE_INVALID'); return value; }
export function assertConfigurationHash(value) { if (typeof value !== 'string' || !HASH.test(value)) invalid('AUTOMATION_CONFIGURATION_HASH_INVALID'); return value; }
export function assertIdempotencyKey(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{16,200}$/.test(value)) invalid('AUTOMATION_IDEMPOTENCY_INVALID'); return value; }

export function assertRecipeDefinition(value, expectedCode = null) {
  exact(value, ['recipeCode', 'inputSchema', 'steps'], 'AUTOMATION_RECIPE_DEFINITION_INVALID');
  assertRecipeCode(value.recipeCode);
  if (expectedCode && value.recipeCode !== expectedCode) invalid('AUTOMATION_RECIPE_CODE_MISMATCH');
  safeJson(value);
  validateInputSchema(value.inputSchema);
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 100) invalid('AUTOMATION_RECIPE_GRAPH_INVALID');
  let previousCode = null;
  const seen = new Set();
  value.steps.forEach((step, index) => {
    exact(step, ['stepCode', 'sequence', 'actionCode', 'dependsOn', 'input', 'policies', 'requiresHumanReview'], 'AUTOMATION_RECIPE_GRAPH_INVALID');
    if (!STEP.test(step.stepCode) || seen.has(step.stepCode) || !Number.isInteger(step.sequence) || step.sequence !== index + 1 || !RECIPE_ACTION_CODES.includes(step.actionCode) || typeof step.requiresHumanReview !== 'boolean') invalid('AUTOMATION_RECIPE_GRAPH_INVALID');
    seen.add(step.stepCode);
    validatePolicies(step.policies);
    if (index === 0) {
      if (Object.hasOwn(step, 'dependsOn') || Object.hasOwn(step, 'input')) invalid('AUTOMATION_RECIPE_GRAPH_INVALID');
    } else {
      if (step.dependsOn !== previousCode) invalid('AUTOMATION_RECIPE_GRAPH_INVALID');
      object(step.input, 'AUTOMATION_RECIPE_GRAPH_INVALID');
      safeJson(step.input);
    }
    previousCode = step.stepCode;
  });
  return value;
}
export function assertRecipeInput(definition, input) {
  object(input, 'AUTOMATION_RECIPE_INPUT_INVALID');
  const { properties, required } = definition.inputSchema;
  if (Object.keys(input).some((key) => !Object.hasOwn(properties, key)) || required.some((key) => !Object.hasOwn(input, key))) invalid('AUTOMATION_RECIPE_INPUT_INVALID');
  for (const [key, value] of Object.entries(input)) {
    const type = properties[key].type;
    if ((type === 'array' && !Array.isArray(value)) || (type === 'object' && (!value || Array.isArray(value) || typeof value !== 'object')) || (type !== 'array' && type !== 'object' && typeof value !== type)) invalid('AUTOMATION_RECIPE_INPUT_INVALID');
  }
  return input;
}
export function assertAssignmentInputs(value) {
  object(value, 'AUTOMATION_ASSIGNMENT_INVALID');
  for (const [action, hashes] of Object.entries(value)) {
    if (!RECIPE_ACTION_CODES.includes(action) || !Array.isArray(hashes) || hashes.some((hash) => typeof hash !== 'string' || !HASH.test(hash))) invalid('AUTOMATION_ASSIGNMENT_INVALID');
  }
  return value;
}
