import { createHash } from 'node:crypto';
import { config } from '../../config/config.js';
import { writeEmail } from '../../ai/prompts/personalizer.js';
import { PERSONALIZATION_PROMPT_V1 } from '../../ai/prompts/personalization-v1.js';
import { renderOutboundEmail } from '../../integrations/email-sender.js';
import { AppError } from '../../middleware/error-handler.js';
import * as repository from './sales-agent.repository.js';

export const SALES_AGENT_RULES_VERSION = 'phase15a-deterministic-evaluation@1.0.0';
export const SALES_AGENT_MODE = 'dry_run_only';
const APPROVED_SOURCES = new Set(['apollo', 'hunter', 'manual']);
const REVIEW_STATUSES = new Set(['all', 'pending_review', 'changes_required', 'approved', 'rejected', 'stopped', 'released_dry_run', 'blocked']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EVIDENCE_AGE_MS = 90 * 24 * 60 * 60 * 1000;

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactObject(value, allowed, message = 'Sales-agent request is invalid.') {
  if (!plainObject(value) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new AppError(message, 400, 'VALIDATION_ERROR');
  }
}

function boundedText(value, { field, minimum = 1, maximum }) {
  if (typeof value !== 'string') throw new AppError(`${field} is invalid.`, 400, 'VALIDATION_ERROR');
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw new AppError(`${field} is invalid.`, 400, 'VALIDATION_ERROR');
  }
  return normalized;
}

function uuid(value, field, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !UUID.test(value)) throw new AppError(`${field} is invalid.`, 400, 'VALIDATION_ERROR');
  return value;
}

function positiveRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new AppError('Revision is invalid.', 400, 'VALIDATION_ERROR');
  return value;
}

function idempotencyKey(value) {
  return boundedText(value, { field: 'Idempotency key', minimum: 16, maximum: 128 });
}

function normalizedEvidence(value) {
  exactObject(value, new Set(['source', 'reference', 'collectedAt', 'consentStatus', 'consentBasis']), 'Evidence is invalid.');
  const source = typeof value.source === 'string' ? value.source.trim().toLowerCase() : '';
  if (!APPROVED_SOURCES.has(source)) throw new AppError('Only approved evidence sources can enter review.', 422, 'PROVENANCE_NOT_APPROVED');
  const reference = boundedText(value.reference, { field: 'Evidence reference', minimum: 4, maximum: 500 });
  const collectedAtDate = new Date(value.collectedAt);
  const now = Date.now();
  if (!Number.isFinite(collectedAtDate.getTime()) || collectedAtDate.getTime() > now + 5 * 60 * 1000 || now - collectedAtDate.getTime() > MAX_EVIDENCE_AGE_MS) {
    throw new AppError('Evidence is invalid or stale.', 422, 'PROVENANCE_STALE');
  }
  const consentStatus = typeof value.consentStatus === 'string' ? value.consentStatus.trim() : '';
  if (!['legitimate_interest', 'opted_in'].includes(consentStatus)) {
    throw new AppError('A permitted consent or processing basis is required.', 422, 'CONSENT_REQUIRED');
  }
  const consentBasis = boundedText(value.consentBasis, { field: 'Consent basis', minimum: 10, maximum: 500 });
  return { source, reference, collectedAt: collectedAtDate.toISOString(), consentStatus, consentBasis };
}

function contentHash(subject, body) {
  return createHash('sha256').update(`${subject}\n${body}`, 'utf8').digest('hex');
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function check(code, passed, message) {
  return { code, passed: Boolean(passed), message };
}

/**
 * Deterministic evaluation is authoritative. AI output may assist drafting but
 * cannot override any failed check.
 */
export function evaluateDraft({ subject, body, recipientName, company, evidence }) {
  const normalizedSubject = String(subject || '').trim();
  const normalizedBody = String(body || '').trim();
  const combined = `${normalizedSubject}\n${normalizedBody}`;
  const recipientFirstName = firstName(recipientName);
  const words = normalizedBody.split(/\s+/).filter(Boolean).length;
  const sourceDate = new Date(evidence?.collectedAt);
  const sourceCurrent = Number.isFinite(sourceDate.getTime())
    && sourceDate.getTime() <= Date.now() + 5 * 60 * 1000
    && Date.now() - sourceDate.getTime() <= MAX_EVIDENCE_AGE_MS;
  const prohibited = /\b(?:guaranteed?|risk[- ]?free|100\s*%|ignore (?:all |the )?(?:previous|prior|system) instructions?|system prompt|developer prompt)\b/i;
  const unsupportedClaims = /\b(?:i|we) (?:help|helped|work with|worked with|have helped)|\bbook(?:ing)? more\b|\bwithout adding headcount\b|\bmost teams\b|\b(?:increase|boost|double|triple)(?:d|s|ing)?\b|\bi (?:noticed|saw|came across)\b/i;
  const checks = [
    check('subject_contract', normalizedSubject.length >= 1 && normalizedSubject.length <= 120 && !/[\r\n]/.test(normalizedSubject), 'Subject is a single line of at most 120 characters.'),
    check('body_contract', normalizedBody.length >= 1 && normalizedBody.length <= 1500 && words <= 90, 'Body is present and contains at most 90 words.'),
    check('recipient_personalization', Boolean(recipientFirstName) && normalizedBody.toLowerCase().includes(recipientFirstName.toLowerCase()), 'Body names the intended recipient.'),
    check('company_personalization', Boolean(company) && combined.toLowerCase().includes(String(company).trim().toLowerCase()), 'Draft is grounded in the persisted company.'),
    check('no_links_or_placeholders', !/https?:\/\/|www\.|\{\{[^}]+\}\}/i.test(combined), 'Draft contains no links or unresolved placeholders.'),
    check('no_prohibited_content', !prohibited.test(combined), 'Draft contains no prohibited guarantees or prompt-injection content.'),
    check('factuality', !unsupportedClaims.test(combined) && !/\b\d+(?:\.\d+)?\s*%\b/.test(combined), 'Draft avoids unsupported performance, familiarity, and numeric claims.'),
    check('approved_provenance', APPROVED_SOURCES.has(evidence?.source) && Boolean(evidence?.reference) && sourceCurrent, 'Evidence source is approved, referenced, and current.'),
    check('consent_basis', ['legitimate_interest', 'opted_in'].includes(evidence?.consentStatus) && String(evidence?.consentBasis || '').trim().length >= 10, 'A permitted consent or processing basis is recorded.'),
  ];
  return {
    passed: checks.every((entry) => entry.passed),
    rulesVersion: SALES_AGENT_RULES_VERSION,
    checkedAt: new Date().toISOString(),
    checks,
  };
}

function publicRepositoryError(error) {
  const message = String(error?.message || '');
  if (message.includes('OUTBOUND_ACTION_NOT_FOUND')) return new AppError('Sales approval not found.', 404, 'OUTBOUND_ACTION_NOT_FOUND');
  if (message.includes('INSUFFICIENT_PERMISSIONS')) return new AppError('Owner Workspace access is not permitted.', 403, 'INSUFFICIENT_PERMISSIONS');
  if (message.includes('PROVENANCE_NOT_APPROVED')) return new AppError('Only approved evidence sources can enter review.', 422, 'PROVENANCE_NOT_APPROVED');
  if (message.includes('OUTBOUND_SUPPRESSED')) return new AppError('This recipient is suppressed and cannot enter review.', 409, 'OUTBOUND_SUPPRESSED');
  if (message.includes('DUPLICATE_OUTBOUND_ACTION')) return new AppError('An active approval already exists for this prospect and step.', 409, 'DUPLICATE_OUTBOUND_ACTION');
  if (message.includes('OUTBOUND_DAILY_CAP_REACHED')) return new AppError('The dry-run daily cap has been reached.', 429, 'OUTBOUND_DAILY_CAP_REACHED');
  if (message.includes('OUTBOUND_APPROVAL_BLOCKED') || message.includes('OUTBOUND_RELEASE_BLOCKED')) return new AppError('Compliance checks blocked this action.', 409, 'OUTBOUND_COMPLIANCE_BLOCKED');
  if (message.includes('OUTBOUND_ACTION_STATE_CONFLICT')) return new AppError('This approval changed or is no longer actionable. Refresh and try again.', 409, 'OUTBOUND_ACTION_STATE_CONFLICT');
  if (message.includes('VALIDATION_ERROR')) return new AppError('Sales-agent request is invalid.', 400, 'VALIDATION_ERROR');
  return new AppError('Sales approvals are temporarily unavailable.', 503, 'SALES_AGENT_UNAVAILABLE', false);
}

function actionView(action) {
  if (!action) throw new AppError('Sales approval not found.', 404, 'OUTBOUND_ACTION_NOT_FOUND');
  return {
    id: action.id,
    clientId: action.client_id,
    campaignId: action.campaign_id,
    prospectId: action.prospect_id,
    channel: action.channel,
    step: action.step,
    revision: action.revision,
    recipient: { name: action.recipient_name, email: action.recipient_email },
    clientName: action.client_name,
    subject: action.subject,
    body: action.body,
    contentHash: action.content_hash,
    evaluation: action.evaluation,
    evidence: {
      source: action.source_kind,
      reference: action.source_reference,
      collectedAt: action.source_collected_at,
      consentStatus: action.consent_status,
      consentBasis: action.consent_basis,
    },
    status: action.status,
    decisionAt: action.decision_at,
    decisionReason: action.decision_reason,
    provider: { status: action.provider_status, id: action.provider_id, errorCode: action.provider_error_code },
    releasedAt: action.released_at,
    stoppedAt: action.stopped_at,
    createdAt: action.created_at,
    updatedAt: action.updated_at,
  };
}

export async function listApprovals(ownerUserId, query = {}) {
  const status = typeof query.status === 'string' ? query.status : 'all';
  if (!REVIEW_STATUSES.has(status)) throw new AppError('Approval status is invalid.', 400, 'VALIDATION_ERROR');
  const parsedLimit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) throw new AppError('Approval limit is invalid.', 400, 'VALIDATION_ERROR');
  try {
    const items = await repository.listOutboundActions(ownerUserId, { status, limit: parsedLimit });
    return { mode: SALES_AGENT_MODE, items: items.map(actionView) };
  } catch (error) {
    throw publicRepositoryError(error);
  }
}

export async function prepareApproval(ownerUserId, values, rawIdempotencyKey) {
  exactObject(values, new Set(['prospectId', 'campaignId', 'step']));
  const prospectId = uuid(values.prospectId, 'Prospect');
  const campaignId = uuid(values.campaignId, 'Campaign', { optional: true });
  const step = Number(values.step ?? 1);
  if (step !== 1) throw new AppError('Phase 15A supports only the first email step.', 400, 'VALIDATION_ERROR');
  const requestKey = idempotencyKey(rawIdempotencyKey);

  let scope;
  try { scope = await repository.getOwnedProspectScope(ownerUserId, prospectId); }
  catch (error) { throw publicRepositoryError(error); }
  if (!scope) throw new AppError('Sales approval not found.', 404, 'OUTBOUND_ACTION_NOT_FOUND');
  const { prospect, client } = scope;
  if (!prospect.email || !EMAIL.test(prospect.email) || !prospect.full_name || !prospect.company) {
    throw new AppError('Persisted prospect data is incomplete.', 422, 'PROSPECT_DATA_INCOMPLETE');
  }
  const evidence = normalizedEvidence({
    source: prospect.source,
    reference: prospect.source_reference,
    collectedAt: prospect.source_collected_at,
    consentStatus: prospect.consent_status,
    consentBasis: prospect.consent_basis,
  });

  let draft;
  try {
    draft = await writeEmail(step, prospect, client, {
      dryRun: true,
      context: { requestId: requestKey, actorType: 'user', actorId: ownerUserId, clientId: client.id, authorized: true },
    });
  } catch {
    throw new AppError('A safe draft could not be generated from the persisted prospect.', 422, 'DRAFT_GENERATION_BLOCKED');
  }
  const subject = boundedText(draft.subject, { field: 'Draft subject', maximum: 120 });
  const body = boundedText(draft.body, { field: 'Draft body', maximum: 1500 });
  const evaluation = evaluateDraft({ subject, body, recipientName: prospect.full_name, company: prospect.company, evidence });
  const model = {
    provider: 'deterministic',
    name: 'reviewed-personalization-template',
    promptId: PERSONALIZATION_PROMPT_V1.id,
    promptVersion: PERSONALIZATION_PROMPT_V1.version,
  };
  const input = {
    prospectId,
    campaignId,
    step,
    evidence,
    subject,
    body,
    contentHash: contentHash(subject, body),
    evaluation,
    rulesVersion: SALES_AGENT_RULES_VERSION,
    model,
    idempotencyKey: requestKey,
    artifacts: {
      research: { source: evidence.source, reference: evidence.reference, collectedAt: evidence.collectedAt, consentStatus: evidence.consentStatus, consentBasis: evidence.consentBasis },
      enrichment: { fullName: prospect.full_name, firstName: prospect.first_name, title: prospect.title, company: prospect.company, email: prospect.email, industry: prospect.industry, location: prospect.location, linkedinUrl: prospect.linkedin_url },
      scoring: { score: prospect.icp_score, qualified: prospect.qualified, hot: prospect.hot, reasons: Array.isArray(prospect.score_reasons) ? prospect.score_reasons : [], rulesVersion: 'persisted-icp-score@1.0.0' },
      draft: { subject, body, step, model },
    },
  };
  try { return actionView(await repository.createOutboundAction(ownerUserId, input)); }
  catch (error) { throw publicRepositoryError(error); }
}

export async function reviseApproval(ownerUserId, actionIdValue, values) {
  const actionId = uuid(actionIdValue, 'Approval');
  exactObject(values, new Set(['expectedRevision', 'subject', 'body']));
  const expectedRevision = positiveRevision(values.expectedRevision);
  const subject = boundedText(values.subject, { field: 'Draft subject', maximum: 120 });
  const body = boundedText(values.body, { field: 'Draft body', maximum: 1500 });
  let action;
  let scope;
  try {
    action = await repository.getOutboundAction(ownerUserId, actionId);
    if (action) scope = await repository.getOwnedProspectScope(ownerUserId, action.prospect_id);
  } catch (error) { throw publicRepositoryError(error); }
  if (!action || !scope) throw new AppError('Sales approval not found.', 404, 'OUTBOUND_ACTION_NOT_FOUND');
  const evidence = { source: action.source_kind, reference: action.source_reference, collectedAt: action.source_collected_at, consentStatus: action.consent_status, consentBasis: action.consent_basis };
  const evaluation = evaluateDraft({ subject, body, recipientName: action.recipient_name, company: scope.prospect.company, evidence });
  try {
    return actionView(await repository.reviseOutboundAction(ownerUserId, actionId, {
      expectedRevision, subject, body, contentHash: contentHash(subject, body), evaluation, rulesVersion: SALES_AGENT_RULES_VERSION,
    }));
  } catch (error) { throw publicRepositoryError(error); }
}

export async function decideApproval(ownerUserId, actionIdValue, values) {
  const actionId = uuid(actionIdValue, 'Approval');
  exactObject(values, new Set(['expectedRevision', 'decision', 'reason']));
  const expectedRevision = positiveRevision(values.expectedRevision);
  const decision = typeof values.decision === 'string' ? values.decision.trim() : '';
  if (!['approve', 'reject', 'stop'].includes(decision)) throw new AppError('Decision is invalid.', 400, 'VALIDATION_ERROR');
  let reason = null;
  if (decision !== 'approve') {
    reason = boundedText(values.reason, { field: 'Decision reason', minimum: 3, maximum: 500 });
  } else {
    if (values.reason !== undefined && values.reason !== null && values.reason !== '') {
      throw new AppError('Approval reason is invalid.', 400, 'VALIDATION_ERROR');
    }
    let action;
    try { action = await repository.getOutboundAction(ownerUserId, actionId); }
    catch (error) { throw publicRepositoryError(error); }
    if (!action) throw new AppError('Sales approval not found.', 404, 'OUTBOUND_ACTION_NOT_FOUND');
    reason = contentHash(action.subject, renderOutboundEmail(action.body, action.recipient_email));
  }
  try { return actionView(await repository.decideOutboundAction(ownerUserId, actionId, { expectedRevision, decision, reason })); }
  catch (error) { throw publicRepositoryError(error); }
}

export async function releaseApprovalDryRun(ownerUserId, actionIdValue, values, rawIdempotencyKey) {
  const actionId = uuid(actionIdValue, 'Approval');
  exactObject(values, new Set(['expectedRevision']));
  const expectedRevision = positiveRevision(values.expectedRevision);
  const requestKey = idempotencyKey(rawIdempotencyKey);
  let action;
  try { action = await repository.getOutboundAction(ownerUserId, actionId); }
  catch (error) { throw publicRepositoryError(error); }
  if (!action) throw new AppError('Sales approval not found.', 404, 'OUTBOUND_ACTION_NOT_FOUND');
  const finalBody = renderOutboundEmail(action.body, action.recipient_email);
  try {
    return actionView(await repository.releaseOutboundActionDryRun(ownerUserId, actionId, {
      expectedRevision, idempotencyKey: requestKey, dailyLimit: config.dailySendLimit, finalBody,
    }));
  } catch (error) { throw publicRepositoryError(error); }
}
