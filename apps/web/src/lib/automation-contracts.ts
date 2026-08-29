// Phase 11 Step 5 control-surface contracts.
// These mirror the authenticated Automation API responses exactly. The browser never
// derives execution state, policy outcomes, or permissions from these shapes; it renders
// only what the backend already decided.

export type AutomationRunState =
  | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'RETRYABLE' | 'FAILED' | 'BLOCKED' | 'CANCELLED' | 'HUMAN_REVIEW';
export type AutomationRecipeStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type AutomationAssignmentStatus = 'ACTIVE' | 'PAUSED' | 'REVOKED';
export type AutomationInputType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export const AUTOMATION_RUN_STATES: readonly AutomationRunState[] = Object.freeze([
  'RUNNING', 'WAITING', 'COMPLETED', 'RETRYABLE', 'FAILED', 'BLOCKED', 'CANCELLED', 'HUMAN_REVIEW',
]);
export const AUTOMATION_RECIPE_LIFECYCLE: readonly AutomationRecipeStatus[] = Object.freeze([
  'DRAFT', 'REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'ARCHIVED',
]);
// Server-owned transition codes. The UI only offers these; the backend remains authoritative.
export const AUTOMATION_LIFECYCLE_TRANSITIONS = Object.freeze(['SUBMIT_REVIEW', 'APPROVE', 'ACTIVATE', 'PAUSE', 'ARCHIVE'] as const);
export type AutomationLifecycleTransition = (typeof AUTOMATION_LIFECYCLE_TRANSITIONS)[number];

/** Server-derived permissions. The UI must never infer these from run state. */
export type AutomationPermittedActions = { pause: boolean; resume: boolean; cancel: boolean; retry: boolean };

export type AutomationRun = {
  id: string;
  recipeVersionId: string;
  correlationId: string;
  state: AutomationRunState;
  requestedByKind: 'owner' | 'employee' | 'system';
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  permittedActions?: AutomationPermittedActions;
};
export type AutomationWorkItem = {
  id: string;
  sequence: number;
  dependencyWorkItemId: string | null;
  actionCode: string;
  state: AutomationRunState;
  dueAt: string;
  attemptCount: number;
  maxAttempts: number;
  reasonCode: string | null;
  result: Record<string, unknown>;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};
export type AutomationRunEvent = {
  sequence: number;
  code: string;
  actionCode: string | null;
  actorSource: string | null;
  previousState: string | null;
  newState: string | null;
  reasonCode: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
export type AutomationPolicyDecision = {
  policyCode: string;
  policyVersion: string;
  decision: string;
  reasonCode: string | null;
  createdAt: string;
};
export type AutomationRunHistory = {
  run: AutomationRun;
  workItems: AutomationWorkItem[];
  events: AutomationRunEvent[];
  decisions: AutomationPolicyDecision[];
};

export type AutomationRecipe = { id: string; code: string; status: AutomationRecipeStatus; createdAt: string; updatedAt: string };
export type AutomationRecipeVersion = {
  id: string; version: number; status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'RETIRED';
  configurationSha256: string; createdAt: string; approvedAt: string | null;
};
export type AutomationRecipeActivation = { recipeVersionId: string; status: string; activatedAt: string; deactivatedAt: string | null };
export type AutomationRecipeLifecycleEvent = {
  recipeVersionId: string | null; previousStatus: string | null; nextStatus: string; transition: string; createdAt: string;
};
export type AutomationRecipeDetail = {
  recipe: AutomationRecipe;
  versions: AutomationRecipeVersion[];
  activations: AutomationRecipeActivation[];
  lifecycleEvents: AutomationRecipeLifecycleEvent[];
};

export type AutomationAssignment = {
  id: string; recipeVersionId: string; employeeUserId: string; status: AutomationAssignmentStatus;
  allowedInputsSha256: string; createdAt: string; updatedAt: string; revokedAt: string | null;
};
export type AutomationEmployeeCandidate = { id: string; name: string | null; email: string };
export type AutomationAssignmentProjection = {
  assignments: AutomationAssignment[];
  candidates: AutomationEmployeeCandidate[];
  counts: { active: number; paused: number; revoked: number };
};

export type AutomationHealth = {
  runCounts: Partial<Record<string, number>>;
  policyFailures: { runId: string | null; decision: string; reasonCode: string | null; createdAt: string }[];
};

export type AutomationInputSchema = {
  properties: Record<string, { type: AutomationInputType }>;
  required: string[];
};
export type AssignedRecipe = {
  assignmentId: string;
  code: string;
  status: AutomationRecipeStatus;
  version: number;
  recipeVersionId: string;
  allowedInputsSha256: string;
  allowedInputs: Record<string, string[]>;
};
export type AssignedRecipeDetail = AssignedRecipe & {
  inputSchema: AutomationInputSchema;
  rootStep: { stepCode: string; actionCode: string; requiresHumanReview: boolean } | null;
};

/** Terminal run states stop polling. This mirrors the server contract; it grants no permission. */
export const AUTOMATION_TERMINAL_STATES: readonly AutomationRunState[] = Object.freeze(['COMPLETED', 'FAILED', 'CANCELLED']);
export function isTerminalRunState(state: AutomationRunState) { return AUTOMATION_TERMINAL_STATES.includes(state); }
export function formatTimestamp(value: string | null) { return value ? new Date(value).toLocaleString() : '—'; }
/** Presentation-only label. Business meaning stays with the server-provided code. */
export function humanizeCode(value: string | null) {
  if (!value) return '—';
  return value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');
}
/** The run's current step is whichever work item the server reports as not finished. */
export function currentStep(workItems: AutomationWorkItem[]) {
  return workItems.find((item) => !isTerminalRunState(item.state)) || workItems[workItems.length - 1] || null;
}
export function idempotencyKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `automation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
