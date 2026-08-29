import { AppError } from '../../middleware/error-handler.js';
import * as workspace from '../owner-workspace/owner-workspace.service.js';
import { evaluateAdmissionPolicies, listPolicyRegistry } from './automation.recipe-policy.policy.js';
import * as repository from './automation.recipe-policy.repository.js';
import {
  RECIPE_LIFECYCLE_TRANSITIONS,
  assertAssignmentInputs,
  assertIdempotencyKey,
  assertRecipeCode,
  assertRecipeDefinition,
  sha256,
  stableJson,
} from './automation.recipe-policy.validation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid() { throw new AppError('Recipe or policy request is invalid.', 400, 'VALIDATION_ERROR'); }
function denied() { throw new AppError('Recipe or policy access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS'); }
function unavailable() { throw new AppError('Recipe or policy governance is temporarily unavailable.', 503, 'AUTOMATION_UNAVAILABLE', false); }
function uuid(value) { if (typeof value !== 'string' || !UUID.test(value)) invalid(); return value; }
function exact(value, fields) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) invalid(); return value; }
function mapError(error) {
  if (error instanceof AppError) throw error;
  const message = String(error?.message || '');
  if (/DENIED|ACCESS|OWNER_SCOPE|EMPLOYEE_SCOPE|ASSIGNMENT_SCOPE/.test(message)) denied();
  if (/NOT_FOUND/.test(message)) throw new AppError('Recipe record not found.', 404, 'AUTOMATION_NOT_FOUND');
  if (/CONFLICT|LIFECYCLE_INVALID|IDEMPOTENCY/.test(message)) throw new AppError('Recipe request conflicts with its current state.', 409, 'AUTOMATION_CONFLICT');
  if (/VALIDATION|INVALID|DYNAMIC|NOT_EDITABLE|NOT_ACTIVE|CODE_MISMATCH|POLICY/.test(message)) invalid();
  unavailable();
}
async function scope(userId, { ownerOnly = false } = {}) {
  try {
    await workspace.assertOwnerWorkspaceAccess(userId);
    return { ownerUserId: userId, actorUserId: userId, actorKind: 'owner', isOwner: true };
  } catch (error) {
    if (error?.code !== 'INSUFFICIENT_PERMISSIONS') throw error;
  }
  if (ownerOnly) denied();
  try {
    const employee = await repository.getActiveEmployeeActor(userId);
    if (!employee || employee.role !== 'employee' || employee.status !== 'active' || !employee.portal_owner_user_id) denied();
    return { ownerUserId: employee.portal_owner_user_id, actorUserId: userId, actorKind: 'employee', isOwner: false };
  } catch (error) {
    if (error instanceof AppError) throw error;
    unavailable();
  }
}
function recipeView(recipe) {
  return { id: recipe.id, code: recipe.code, status: recipe.status, createdAt: recipe.created_at, updatedAt: recipe.updated_at };
}
function parseDueAt(value) {
  if (value === undefined || value === null) return new Date().toISOString();
  const dueAt = new Date(value);
  if (Number.isNaN(dueAt.getTime())) invalid();
  return dueAt.toISOString();
}

export async function getPolicyRegistry(userId) {
  await scope(userId);
  return listPolicyRegistry();
}
export async function listRecipes(userId, query = {}) {
  const actor = await scope(userId, { ownerOnly: true });
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid();
  try { return (await repository.listRecipes(actor.ownerUserId, limit)).map(recipeView); } catch (error) { mapError(error); }
}
export async function getRecipe(userId, recipeId) {
  const actor = await scope(userId, { ownerOnly: true });
  try {
    const value = await repository.getRecipe(actor.ownerUserId, uuid(recipeId));
    if (!value) throw new AppError('Recipe record not found.', 404, 'AUTOMATION_NOT_FOUND');
    return {
      recipe: recipeView(value.recipe),
      versions: value.versions.map((version) => ({ id: version.id, version: version.version, status: version.status, configurationSha256: version.configuration_sha256, createdAt: version.created_at, approvedAt: version.approved_at })),
      activations: value.activations.map((activation) => ({ recipeVersionId: activation.recipe_version_id, status: activation.status, activatedAt: activation.activated_at, deactivatedAt: activation.deactivated_at })),
      lifecycleEvents: value.lifecycleEvents.map((event) => ({ recipeVersionId: event.recipe_version_id, previousStatus: event.previous_status, nextStatus: event.next_status, transition: event.transition_code, createdAt: event.created_at })),
    };
  } catch (error) { mapError(error); }
}
export async function createRecipe(userId, values) {
  const actor = await scope(userId, { ownerOnly: true });
  try {
    const body = exact(values, ['code', 'definition']);
    const code = assertRecipeCode(body.code);
    const definition = assertRecipeDefinition(body.definition, code);
    return await repository.createRecipe({ ownerUserId: actor.ownerUserId, actorUserId: actor.actorUserId, code, definition, configurationSha256: sha256(definition) });
  } catch (error) { mapError(error); }
}
export async function createRecipeVersion(userId, recipeId, values) {
  const actor = await scope(userId, { ownerOnly: true });
  try {
    const body = exact(values, ['definition']);
    const definition = assertRecipeDefinition(body.definition);
    return await repository.createRecipeVersion({ ownerUserId: actor.ownerUserId, actorUserId: actor.actorUserId, recipeId: uuid(recipeId), definition, configurationSha256: sha256(definition) });
  } catch (error) { mapError(error); }
}
export async function transitionRecipe(userId, recipeId, values) {
  const actor = await scope(userId, { ownerOnly: true });
  try {
    const body = exact(values, ['recipeVersionId', 'transition']);
    if (!RECIPE_LIFECYCLE_TRANSITIONS.includes(body.transition)) invalid();
    return await repository.transitionRecipe({ ownerUserId: actor.ownerUserId, actorUserId: actor.actorUserId, recipeId: uuid(recipeId), recipeVersionId: uuid(body.recipeVersionId), transition: body.transition });
  } catch (error) { mapError(error); }
}
export async function upsertAssignment(userId, recipeVersionId, values) {
  const actor = await scope(userId, { ownerOnly: true });
  try {
    const body = exact(values, ['employeeUserId', 'allowedInputs', 'status']);
    if (!['ACTIVE', 'PAUSED', 'REVOKED'].includes(body.status)) invalid();
    const allowedInputs = assertAssignmentInputs(body.allowedInputs);
    return await repository.upsertAssignment({
      ownerUserId: actor.ownerUserId, actorUserId: actor.actorUserId, recipeVersionId: uuid(recipeVersionId),
      employeeUserId: uuid(body.employeeUserId), allowedInputs, allowedInputsSha256: sha256(allowedInputs), status: body.status,
    });
  } catch (error) { mapError(error); }
}
export async function admitManualRun(userId, values, rawIdempotency) {
  const actor = await scope(userId);
  try {
    const body = exact(values, ['recipeCode', 'input', 'dueAt']);
    const recipeCode = assertRecipeCode(body.recipeCode);
    const input = body.input;
    if (!input || Array.isArray(input) || typeof input !== 'object') invalid();
    const dueAt = parseDueAt(body.dueAt);
    const idempotencyKey = assertIdempotencyKey(rawIdempotency);
    // The browser never supplies a version, configuration hash, action, provider, or policy result.
    const request = { recipeCode, input, dueAt: body.dueAt ?? null };
    return await repository.admitRecipeRun({
      ownerUserId: actor.ownerUserId, actorUserId: actor.actorUserId, actorKind: actor.actorKind,
      recipeCode, input, dueAt, idempotencyKey, requestSha256: sha256(stableJson(request)),
    });
  } catch (error) { mapError(error); }
}

// Exported only for focused tests of the static, fail-closed policy decision; database admission remains authoritative.
export function evaluateFixedAdmissionPolicy(step) { return evaluateAdmissionPolicies(step); }

function assignedRecipeView(row, detail = false) {
  const definition = row.version.definition || {};
  const view = {
    assignmentId: row.assignment.id,
    code: row.recipe.code,
    status: row.recipe.status,
    version: row.version.version,
    recipeVersionId: row.version.id,
    allowedInputsSha256: row.assignment.allowed_inputs_sha256,
    allowedInputs: row.assignment.allowed_inputs,
  };
  if (detail) {
    const first = Array.isArray(definition.steps) ? definition.steps.find((step) => step.sequence === 1) : null;
    view.inputSchema = definition.inputSchema || { properties: {}, required: [] };
    view.rootStep = first ? { stepCode: first.stepCode, actionCode: first.actionCode, requiresHumanReview: Boolean(first.requiresHumanReview) } : null;
  }
  return view;
}
export async function listAssignedRecipes(userId) {
  const actor = await scope(userId);
  if (actor.isOwner) denied();
  try { return (await repository.listAssignedRecipes(actor.ownerUserId, actor.actorUserId)).map((row) => assignedRecipeView(row)); }
  catch (error) { mapError(error); }
}
export async function getAssignedRecipe(userId, recipeCode) {
  const actor = await scope(userId);
  if (actor.isOwner || typeof recipeCode !== 'string' || !/^RCP_[A-Z0-9_]{3,60}$/.test(recipeCode)) denied();
  try {
    const row = (await repository.listAssignedRecipes(actor.ownerUserId, actor.actorUserId)).find((item) => item.recipe.code === recipeCode);
    if (!row) denied();
    return assignedRecipeView(row, true);
  } catch (error) { mapError(error); }
}
export async function getOwnerAssignmentProjection(userId) {
  const actor = await scope(userId, { ownerOnly: true });
  try {
    const [assignments, candidates] = await Promise.all([repository.listOwnerAssignments(actor.ownerUserId), repository.listEmployeeCandidates(actor.ownerUserId)]);
    const counts = assignments.reduce((total, assignment) => ({ ...total, [assignment.status.toLowerCase()]: total[assignment.status.toLowerCase()] + 1 }), { active: 0, paused: 0, revoked: 0 });
    return { assignments: assignments.map((assignment) => ({ id: assignment.id, recipeVersionId: assignment.recipe_version_id, employeeUserId: assignment.employee_user_id, status: assignment.status, allowedInputsSha256: assignment.allowed_inputs_sha256, createdAt: assignment.created_at, updatedAt: assignment.updated_at, revokedAt: assignment.revoked_at })), candidates: candidates.map((candidate) => ({ id: candidate.id, name: candidate.full_name, email: candidate.email })), counts };
  } catch (error) { mapError(error); }
}
export async function getOwnerAutomationHealth(userId) {
  const actor = await scope(userId, { ownerOnly: true });
  try {
    const value = await repository.getOwnerAutomationHealth(actor.ownerUserId);
    const counts = value.runs.reduce((total, run) => ({ ...total, [run.state.toLowerCase()]: (total[run.state.toLowerCase()] || 0) + 1 }), {});
    return { runCounts: counts, policyFailures: value.policyFailures.map((item) => ({ runId: item.run_id, decision: item.decision, reasonCode: item.reason_code, createdAt: item.created_at })) };
  } catch (error) { mapError(error); }
}
