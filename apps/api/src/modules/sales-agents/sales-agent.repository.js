import { getDb } from '../../database/db.js';

function database() {
  const { client, usingMemory } = getDb();
  if (usingMemory || !client) throw new Error('SALES_AGENT_DATABASE_REQUIRED');
  return client;
}

export async function getOwnedProspectScope(ownerUserId, prospectId) {
  const db = database();
  const { data: prospect, error: prospectError } = await db.from('prospects')
    .select('id,client_id,full_name,first_name,title,company,email,linkedin_url,industry,location,source,source_reference,source_collected_at,consent_status,consent_basis,icp_score,qualified,hot,score_reasons,stage,step')
    .eq('id', prospectId).maybeSingle();
  if (prospectError) throw prospectError;
  if (!prospect?.client_id) return null;

  const { data: client, error: clientError } = await db.from('clients')
    .select('id,name,icp_titles,icp_industries,icp_locations,icp_keywords,status,owner_user_id')
    .eq('id', prospect.client_id).eq('owner_user_id', ownerUserId).eq('status', 'active').maybeSingle();
  if (clientError) throw clientError;
  return client ? { prospect, client } : null;
}

export async function listOutboundActions(ownerUserId, { status, limit }) {
  let query = database().from('outbound_actions')
    .select('id,client_id,campaign_id,prospect_id,channel,step,revision,recipient_name,recipient_email,client_name,subject,body,content_hash,evaluation,source_kind,source_reference,source_collected_at,consent_status,consent_basis,status,decision_at,decision_reason,provider_status,provider_id,provider_error_code,released_at,stopped_at,created_at,updated_at')
    .eq('owner_user_id', ownerUserId);
  if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query.order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function getOutboundAction(ownerUserId, actionId) {
  const { data, error } = await database().from('outbound_actions')
    .select('id,client_id,campaign_id,prospect_id,channel,step,revision,recipient_name,recipient_email,client_name,subject,body,content_hash,evaluation,source_kind,source_reference,source_collected_at,consent_status,consent_basis,status,decision_at,decision_reason,provider_status,provider_id,provider_error_code,released_at,stopped_at,created_at,updated_at')
    .eq('id', actionId).eq('owner_user_id', ownerUserId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createOutboundAction(ownerUserId, input) {
  const { data, error } = await database().rpc('create_sales_agent_outbound_action', {
    p_owner_user_id: ownerUserId,
    p_prospect_id: input.prospectId,
    p_campaign_id: input.campaignId,
    p_step: input.step,
    p_source_kind: input.evidence.source,
    p_source_reference: input.evidence.reference,
    p_source_collected_at: input.evidence.collectedAt,
    p_consent_status: input.evidence.consentStatus,
    p_consent_basis: input.evidence.consentBasis,
    p_research: input.artifacts.research,
    p_enrichment: input.artifacts.enrichment,
    p_scoring: input.artifacts.scoring,
    p_draft: input.artifacts.draft,
    p_evaluation: input.evaluation,
    p_evaluation_passed: input.evaluation.passed,
    p_subject: input.subject,
    p_body: input.body,
    p_content_hash: input.contentHash,
    p_model_provider: input.model.provider,
    p_model_name: input.model.name,
    p_prompt_id: input.model.promptId,
    p_prompt_version: input.model.promptVersion,
    p_rules_version: input.rulesVersion,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return data;
}

export async function reviseOutboundAction(ownerUserId, actionId, input) {
  const { data, error } = await database().rpc('revise_sales_agent_outbound_action', {
    p_owner_user_id: ownerUserId,
    p_action_id: actionId,
    p_expected_revision: input.expectedRevision,
    p_subject: input.subject,
    p_body: input.body,
    p_content_hash: input.contentHash,
    p_evaluation: input.evaluation,
    p_evaluation_passed: input.evaluation.passed,
    p_rules_version: input.rulesVersion,
  });
  if (error) throw error;
  return data;
}

export async function decideOutboundAction(ownerUserId, actionId, input) {
  const { data, error } = await database().rpc('decide_sales_agent_outbound_action', {
    p_owner_user_id: ownerUserId,
    p_action_id: actionId,
    p_expected_revision: input.expectedRevision,
    p_decision: input.decision,
    p_reason: input.reason,
  });
  if (error) throw error;
  return data;
}

export async function releaseOutboundActionDryRun(ownerUserId, actionId, input) {
  const { data, error } = await database().rpc('release_sales_agent_outbound_action_dry_run', {
    p_owner_user_id: ownerUserId,
    p_action_id: actionId,
    p_expected_revision: input.expectedRevision,
    p_release_idempotency_key: input.idempotencyKey,
    p_daily_limit: input.dailyLimit,
    p_final_body: input.finalBody,
  });
  if (error) throw error;
  return data;
}
