import { getDb } from '../../database/db.js';
import { AUTOMATION_REGISTRY_VERSION, AUTOMATION_WORKER_VERSION } from './automation.execution.validation.js';

function client() {
  const { client: db, usingMemory } = getDb();
  if (usingMemory) throw new Error('Recipe and policy governance requires PostgreSQL/Supabase; in-memory storage is not permitted.');
  return db;
}
function result(response) { if (response.error) throw response.error; return response.data; }

export async function getActiveEmployeeActor(userId) {
  const { data, error } = await client().from('users').select('id,role,status,portal_owner_user_id').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function createRecipe(values) {
  return result(await client().rpc('automation_create_recipe', {
    p_owner: values.ownerUserId, p_actor: values.actorUserId, p_code: values.code,
    p_definition: values.definition, p_configuration_hash: values.configurationSha256,
  }));
}
export async function createRecipeVersion(values) {
  return result(await client().rpc('automation_create_recipe_version', {
    p_owner: values.ownerUserId, p_actor: values.actorUserId, p_recipe: values.recipeId,
    p_definition: values.definition, p_configuration_hash: values.configurationSha256,
  }));
}
export async function transitionRecipe(values) {
  return result(await client().rpc('automation_transition_recipe_lifecycle', {
    p_owner: values.ownerUserId, p_actor: values.actorUserId, p_recipe: values.recipeId,
    p_recipe_version: values.recipeVersionId, p_transition: values.transition,
  }));
}
export async function upsertAssignment(values) {
  return result(await client().rpc('automation_upsert_recipe_assignment', {
    p_owner: values.ownerUserId, p_actor: values.actorUserId, p_recipe_version: values.recipeVersionId,
    p_employee: values.employeeUserId, p_allowed_inputs: values.allowedInputs,
    p_allowed_inputs_hash: values.allowedInputsSha256, p_status: values.status,
  }));
}
export async function admitRecipeRun(values) {
  return result(await client().rpc('automation_admit_recipe_run', {
    p_owner: values.ownerUserId, p_actor: values.actorUserId, p_actor_kind: values.actorKind,
    p_recipe_code: values.recipeCode, p_input: values.input, p_due_at: values.dueAt,
    p_idempotency: values.idempotencyKey, p_request_hash: values.requestSha256,
  }));
}
export async function evaluateRecipeScorePolicy(values) {
  return result(await client().rpc('automation_evaluate_recipe_score_policy', {
    p_owner: values.ownerUserId, p_actor: values.actorUserId, p_recipe_code: values.recipeCode,
    p_input: values.input, p_idempotency: values.idempotencyKey, p_request_hash: values.requestSha256,
    p_score: values.score, p_qualified: values.qualified, p_hot: values.hot,
    p_decision: values.decision, p_reason: values.reasonCode, p_metadata: values.safeMetadata,
  }));
}
export async function listRecipes(ownerUserId, limit = 50) {
  const { data, error } = await client().from('automation_recipes')
    .select('id,code,status,created_at,updated_at').eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}
export async function getRecipe(ownerUserId, recipeId) {
  const [recipe, versions, activations, events] = await Promise.all([
    client().from('automation_recipes').select('id,code,status,created_at,updated_at').eq('owner_user_id', ownerUserId).eq('id', recipeId).maybeSingle(),
    client().from('automation_recipe_versions').select('id,version,status,configuration_sha256,created_at,approved_at').eq('owner_user_id', ownerUserId).eq('recipe_id', recipeId).order('version', { ascending: false }),
    client().from('automation_recipe_activations').select('recipe_version_id,status,activated_at,deactivated_at').eq('owner_user_id', ownerUserId).eq('recipe_id', recipeId).order('activated_at', { ascending: false }),
    client().from('automation_recipe_lifecycle_events').select('recipe_version_id,previous_status,next_status,transition_code,created_at').eq('owner_user_id', ownerUserId).eq('recipe_id', recipeId).order('created_at', { ascending: false }),
  ]);
  for (const response of [recipe, versions, activations, events]) if (response.error) throw response.error;
  return recipe.data ? { recipe: recipe.data, versions: versions.data || [], activations: activations.data || [], lifecycleEvents: events.data || [] } : null;
}

export async function listAssignedRecipes(ownerUserId, employeeUserId) {
  const { data: assignments, error } = await client().from('automation_recipe_assignments')
    .select('id,recipe_version_id,allowed_inputs,allowed_inputs_sha256,created_at,updated_at')
    .eq('owner_user_id', ownerUserId).eq('employee_user_id', employeeUserId).eq('status', 'ACTIVE');
  if (error) throw error;
  if (!assignments?.length) return [];
  const versionIds = assignments.map((row) => row.recipe_version_id);
  const [{ data: versions, error: versionError }, { data: activations, error: activationError }] = await Promise.all([
    client().from('automation_recipe_versions').select('id,recipe_id,version,status,definition').eq('owner_user_id', ownerUserId).in('id', versionIds).eq('status', 'APPROVED'),
    client().from('automation_recipe_activations').select('recipe_id,recipe_version_id').eq('owner_user_id', ownerUserId).in('recipe_version_id', versionIds).eq('status', 'ACTIVE'),
  ]);
  if (versionError) throw versionError; if (activationError) throw activationError;
  const activeIds = new Set((activations || []).map((row) => row.recipe_version_id));
  const recipeIds = (versions || []).filter((row) => activeIds.has(row.id)).map((row) => row.recipe_id);
  if (!recipeIds.length) return [];
  const { data: recipes, error: recipeError } = await client().from('automation_recipes').select('id,code,status').eq('owner_user_id', ownerUserId).in('id', recipeIds).eq('status', 'ACTIVE');
  if (recipeError) throw recipeError;
  const recipesById = new Map((recipes || []).map((row) => [row.id, row]));
  const assignmentsByVersion = new Map(assignments.map((row) => [row.recipe_version_id, row]));
  return (versions || []).filter((version) => activeIds.has(version.id) && recipesById.has(version.recipe_id))
    .map((version) => ({ assignment: assignmentsByVersion.get(version.id), version, recipe: recipesById.get(version.recipe_id) }));
}
export async function listOwnerAssignments(ownerUserId) {
  const { data, error } = await client().from('automation_recipe_assignments')
    .select('id,recipe_version_id,employee_user_id,status,allowed_inputs_sha256,created_at,updated_at,revoked_at')
    .eq('owner_user_id', ownerUserId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function listEmployeeCandidates(ownerUserId) {
  const { data, error } = await client().from('users').select('id,full_name,email,status')
    .eq('portal_owner_user_id', ownerUserId).eq('role', 'employee').eq('status', 'active').order('full_name');
  if (error) throw error;
  return data || [];
}
export async function getOwnerAutomationHealth(ownerUserId, actorUserId) {
  const [runs, decisions, operational, compatibility] = await Promise.all([
    client().from('automation_runs').select('state').eq('owner_user_id', ownerUserId),
    client().from('automation_policy_decisions').select('decision,reason_code,created_at,run_id').eq('owner_user_id', ownerUserId).in('decision', ['BLOCK', 'HUMAN_REVIEW']).order('created_at', { ascending: false }).limit(50),
    client().rpc('automation_get_owner_operational_health', { p_owner: ownerUserId, p_actor: actorUserId }),
    client().rpc('automation_check_compatibility', { p_registry: AUTOMATION_REGISTRY_VERSION, p_worker: AUTOMATION_WORKER_VERSION }),
  ]);
  for (const response of [runs, decisions, operational, compatibility]) if (response.error) throw response.error;
  return { runs: runs.data || [], policyFailures: decisions.data || [], operationalHealth: operational.data, compatibility: compatibility.data };
}
