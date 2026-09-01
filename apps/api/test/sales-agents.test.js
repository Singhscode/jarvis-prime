import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const nativeFetch = globalThis.fetch;
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://sales-agent.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sales-agent-test-service-role';
process.env.JWT_SECRET = 'sales-agent-test-jwt-secret-with-sufficient-length';
process.env.DRY_RUN = 'true';
process.env.DAILY_SEND_LIMIT = '7';
process.env.FROM_NAME = 'Jarvis Prime';
process.env.COMPANY_POSTAL_ADDRESS = '123 Test Street';
process.env.UNSUBSCRIBE_URL = 'https://example.test/unsubscribe';

const ownerId = '10000000-0000-4000-8000-000000000001';
const clientId = '20000000-0000-4000-8000-000000000001';
const prospectId = '30000000-0000-4000-8000-000000000001';
const actionId = '40000000-0000-4000-8000-000000000001';
const collectedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const rpcCalls = [];
const databaseRequests = [];
let currentAction;
let workspaceIdentity;
let activeClientPortalMembership;
let nextRpcError;
let linkedinNetworkCalls = 0;
let server;

const prospect = {
  id: prospectId,
  client_id: clientId,
  full_name: 'Alice Main',
  first_name: 'Alice',
  title: 'VP Sales',
  company: 'Acme',
  email: 'alice.main@example.test',
  linkedin_url: 'https://www.linkedin.com/in/alice-main',
  industry: 'B2B software',
  location: 'London',
  source: 'manual',
  source_reference: 'crm://prospects/alice-main',
  source_collected_at: collectedAt,
  consent_status: 'legitimate_interest',
  consent_basis: 'Relevant B2B role documented by the Owner.',
  icp_score: 82,
  qualified: true,
  hot: false,
  score_reasons: ['role_match'],
  stage: 'new',
  step: 0,
};

const client = {
  id: clientId,
  name: 'Acme Client',
  icp_titles: ['VP Sales'],
  icp_industries: ['B2B software'],
  icp_locations: ['London'],
  icp_keywords: ['pipeline'],
  status: 'active',
  owner_user_id: ownerId,
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function requestBody(input, init) {
  if (typeof init?.body === 'string') return JSON.parse(init.body);
  if (input instanceof Request) {
    const text = await input.clone().text();
    return text ? JSON.parse(text) : null;
  }
  return null;
}

function actionFixture(overrides = {}) {
  return {
    id: actionId,
    client_id: clientId,
    campaign_id: null,
    prospect_id: prospectId,
    channel: 'email',
    step: 1,
    revision: 1,
    recipient_name: prospect.full_name,
    recipient_email: prospect.email,
    client_name: client.name,
    subject: 'A concise Acme question',
    body: 'Hi Alice, a concise question about Acme priorities.',
    content_hash: createHash('sha256')
      .update('A concise Acme question\nHi Alice, a concise question about Acme priorities.', 'utf8')
      .digest('hex'),
    evaluation: { passed: true, rulesVersion: 'phase15a-deterministic-evaluation@1.0.0', checks: [] },
    source_kind: prospect.source,
    source_reference: prospect.source_reference,
    source_collected_at: prospect.source_collected_at,
    consent_status: prospect.consent_status,
    consent_basis: prospect.consent_basis,
    status: 'pending_review',
    decision_at: null,
    decision_reason: null,
    provider_status: null,
    provider_id: null,
    provider_error_code: null,
    released_at: null,
    stopped_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

globalThis.fetch = async (input, init = {}) => {
  const rawUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(rawUrl);
  if (url.hostname.includes('linkedin.com')) {
    linkedinNetworkCalls += 1;
    throw new Error('LinkedIn network access is forbidden in this test.');
  }

  assert.equal(url.hostname, 'sales-agent.test', `unexpected outbound request: ${rawUrl}`);
  databaseRequests.push(rawUrl);

  if (url.pathname.endsWith('/users')) return json(workspaceIdentity);
  if (url.pathname.endsWith('/client_portal_memberships')) {
    return json(activeClientPortalMembership ? [{ id: '50000000-0000-4000-8000-000000000001' }] : []);
  }
  if (url.pathname.endsWith('/prospects')) return json(prospect);
  if (url.pathname.endsWith('/clients')) return json(client);
  if (url.pathname.endsWith('/outbound_actions')) return json(currentAction);

  if (url.pathname.includes('/rpc/')) {
    const name = url.pathname.split('/rpc/')[1];
    const body = await requestBody(input, init);
    rpcCalls.push({ name, body });
    if (nextRpcError) {
      const error = nextRpcError;
      nextRpcError = null;
      return json({ message: error }, 400);
    }

    if (name === 'create_sales_agent_outbound_action') {
      currentAction = actionFixture({
        campaign_id: body.p_campaign_id,
        step: body.p_step,
        subject: body.p_subject,
        body: body.p_body,
        content_hash: body.p_content_hash,
        evaluation: { ...body.p_evaluation, passed: body.p_evaluation_passed },
        source_kind: body.p_source_kind,
        source_reference: body.p_source_reference,
        source_collected_at: body.p_source_collected_at,
        consent_status: body.p_consent_status,
        consent_basis: body.p_consent_basis,
        status: body.p_evaluation_passed ? 'pending_review' : 'changes_required',
      });
      return json(currentAction);
    }

    if (name === 'decide_sales_agent_outbound_action') {
      const statuses = { approve: 'approved', reject: 'rejected', stop: 'stopped' };
      currentAction = {
        ...currentAction,
        status: statuses[body.p_decision],
        decision_at: new Date().toISOString(),
        decision_reason: body.p_decision === 'approve' ? null : body.p_reason,
      };
      return json(currentAction);
    }

    if (name === 'release_sales_agent_outbound_action_dry_run') {
      currentAction = {
        ...currentAction,
        status: 'released_dry_run',
        provider_status: 'dry_run',
        released_at: new Date().toISOString(),
      };
      return json(currentAction);
    }
  }

  throw new Error(`unexpected database request: ${rawUrl}`);
};

const express = (await import('express')).default;
const { default: salesAgentRouter } = await import('../src/modules/sales-agents/sales-agent.routes.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');
const { createAccessToken } = await import('../src/modules/auth/jwt-service.js');
const {
  evaluateDraft,
  SALES_AGENT_MODE,
  SALES_AGENT_RULES_VERSION,
} = await import('../src/modules/sales-agents/sales-agent.service.js');
const { renderOutboundEmail, sendEmail } = await import('../src/integrations/email-sender.js');
const {
  visitProfile,
  sendConnectionRequest,
  sendDirectMessage,
  getDailyStats,
} = await import('../src/ai/agents/linkedin-agent.js');

function token(role = 'client') {
  return createAccessToken(
    { id: ownerId, email: 'owner@example.test', role },
    { id: '60000000-0000-4000-8000-000000000001', device_id: 'sales-agent-test' },
    process.env.JWT_SECRET,
  );
}

function endpoint(path = '/approvals') {
  return `http://127.0.0.1:${server.address().port}/api/sales-agents${path}`;
}

function headers({ idempotencyKey } = {}) {
  return {
    Authorization: `Bearer ${token()}`,
    'Content-Type': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

describe('Phase 15A sales-agent approval boundary', { concurrency: false }, () => {
  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/sales-agents', salesAgentRouter);
    app.use(errorHandler);
    server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
  });

  beforeEach(() => {
    rpcCalls.length = 0;
    databaseRequests.length = 0;
    currentAction = actionFixture();
    workspaceIdentity = { id: ownerId, role: 'client', status: 'active' };
    activeClientPortalMembership = false;
    nextRpcError = null;
    linkedinNetworkCalls = 0;
  });

  after(async () => {
    globalThis.fetch = nativeFetch;
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  test('requires JWT authentication and the existing active Owner predicate', async () => {
    let response = await nativeFetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'sales-agent-auth-test-0001' },
      body: JSON.stringify({ prospectId, step: 1 }),
    });
    assert.equal(response.status, 401);

    workspaceIdentity = { id: ownerId, role: 'employee', status: 'active' };
    response = await nativeFetch(endpoint(), {
      method: 'POST',
      headers: headers({ idempotencyKey: 'sales-agent-auth-test-0002' }),
      body: JSON.stringify({ prospectId, step: 1 }),
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'INSUFFICIENT_PERMISSIONS');
    assert.equal(rpcCalls.length, 0);
  });

  test('rejects browser evidence and derives preparation evidence only from persisted scope', async () => {
    let response = await nativeFetch(endpoint(), {
      method: 'POST',
      headers: headers({ idempotencyKey: 'sales-agent-browser-evidence-0001' }),
      body: JSON.stringify({
        prospectId,
        step: 1,
        evidence: {
          source: 'manual',
          reference: 'browser://self-attested',
          collectedAt,
          consentStatus: 'opted_in',
          consentBasis: 'Browser-supplied consent must not be trusted.',
        },
      }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    assert.equal(rpcCalls.length, 0);
    assert.equal(databaseRequests.filter((url) => url.includes('/prospects?')).length, 0);

    response = await nativeFetch(endpoint(), {
      method: 'POST',
      headers: headers({ idempotencyKey: 'sales-agent-persisted-evidence-0001' }),
      body: JSON.stringify({ prospectId, campaignId: null, step: 1 }),
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const payload = await response.json();
    assert.equal(payload.data.evidence.reference, prospect.source_reference);
    assert.equal(payload.data.evidence.consentStatus, prospect.consent_status);

    const createCall = rpcCalls.find((call) => call.name === 'create_sales_agent_outbound_action');
    assert.ok(createCall);
    assert.equal(createCall.body.p_source_kind, prospect.source);
    assert.equal(createCall.body.p_source_reference, prospect.source_reference);
    assert.equal(createCall.body.p_source_collected_at, prospect.source_collected_at);
    assert.equal(createCall.body.p_consent_status, prospect.consent_status);
    assert.equal(createCall.body.p_consent_basis, prospect.consent_basis);
    assert.equal(createCall.body.p_rules_version, SALES_AGENT_RULES_VERSION);
    assert.equal(typeof createCall.body.p_evaluation_passed, 'boolean');
    assert.doesNotMatch(JSON.stringify(payload), /approved_release_hash|service.role|password|access.token/i);
  });

  test('limits Phase 15A preparation to the first email and maps compliance failures safely', async () => {
    let response = await nativeFetch(endpoint(), {
      method: 'POST',
      headers: headers({ idempotencyKey: 'sales-agent-step-two-0001' }),
      body: JSON.stringify({ prospectId, step: 2 }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    assert.equal(rpcCalls.length, 0);

    nextRpcError = 'OUTBOUND_SUPPRESSED: raw database detail';
    response = await nativeFetch(endpoint(), {
      method: 'POST',
      headers: headers({ idempotencyKey: 'sales-agent-suppressed-0001' }),
      body: JSON.stringify({ prospectId, step: 1 }),
    });
    assert.equal(response.status, 409);
    const error = await response.json();
    assert.equal(error.error.code, 'OUTBOUND_SUPPRESSED');
    assert.doesNotMatch(JSON.stringify(error), /raw database detail/i);
  });

  test('evaluates drafts deterministically and fails closed on prohibited claims', () => {
    const input = {
      subject: 'A concise Acme question',
      body: 'Hi Alice, a concise question about Acme priorities.',
      recipientName: prospect.full_name,
      company: prospect.company,
      evidence: {
        source: prospect.source,
        reference: prospect.source_reference,
        collectedAt,
        consentStatus: prospect.consent_status,
        consentBasis: prospect.consent_basis,
      },
    };
    const first = evaluateDraft(input);
    const second = evaluateDraft(input);
    assert.equal(first.passed, true);
    assert.equal(first.rulesVersion, SALES_AGENT_RULES_VERSION);
    assert.deepEqual(first.checks, second.checks);

    const unsafe = evaluateDraft({
      ...input,
      body: 'Hi Alice, Acme is guaranteed to increase results by 100%.',
    });
    assert.equal(unsafe.passed, false);
    assert.ok(unsafe.checks.some((entry) => !entry.passed));
    assert.equal(SALES_AGENT_MODE, 'dry_run_only');
  });

  test('rejects browser-controlled approval hashes and computes the rendered-body hash server-side', async () => {
    let response = await nativeFetch(endpoint(`/approvals/${actionId}/decisions`), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        expectedRevision: 1,
        decision: 'approve',
        reason: 'browser-controlled-release-hash',
      }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    assert.equal(rpcCalls.filter((call) => call.name === 'decide_sales_agent_outbound_action').length, 0);

    const expectedFinalBody = renderOutboundEmail(currentAction.body, currentAction.recipient_email);
    const expectedHash = createHash('sha256')
      .update(`${currentAction.subject}\n${expectedFinalBody}`, 'utf8')
      .digest('hex');
    response = await nativeFetch(endpoint(`/approvals/${actionId}/decisions`), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ expectedRevision: 1, decision: 'approve' }),
    });
    assert.equal(response.status, 200);
    const decision = rpcCalls.find((call) => call.name === 'decide_sales_agent_outbound_action');
    assert.equal(decision.body.p_reason, expectedHash);
    assert.match(decision.body.p_reason, /^[0-9a-f]{64}$/);
  });

  test('passes only the server-rendered body and bounded cap to dry-run release', async () => {
    currentAction = actionFixture({ status: 'approved' });
    const expectedFinalBody = renderOutboundEmail(currentAction.body, currentAction.recipient_email);
    const response = await nativeFetch(endpoint(`/approvals/${actionId}/release-dry-run`), {
      method: 'POST',
      headers: headers({ idempotencyKey: 'sales-agent-release-dry-run-0001' }),
      body: JSON.stringify({ expectedRevision: 1 }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.data.status, 'released_dry_run');
    assert.equal(payload.data.provider.status, 'dry_run');

    const release = rpcCalls.find((call) => call.name === 'release_sales_agent_outbound_action_dry_run');
    assert.equal(release.body.p_final_body, expectedFinalBody);
    assert.equal(release.body.p_daily_limit, 7);
    assert.equal(release.body.p_release_idempotency_key, 'sales-agent-release-dry-run-0001');
  });

  test('keeps legacy email and every LinkedIn delivery path closed without provider calls or counters', async () => {
    const email = await sendEmail({ to: prospect.email, body: 'Legacy marketing body' });
    assert.equal(email.status, 'failed');
    assert.equal(email.errorCode, 'OUTBOUND_APPROVAL_REQUIRED');

    const before = getDailyStats();
    const results = await Promise.all([
      visitProfile(prospect),
      sendConnectionRequest(prospect, 'Connection note'),
      sendDirectMessage(prospect, 'Direct message'),
    ]);
    for (const result of results) {
      assert.equal(result.status, 'approval_required');
      assert.equal(result.errorCode, 'OUTBOUND_APPROVAL_REQUIRED');
    }
    assert.deepEqual(getDailyStats(), before);
    assert.equal(linkedinNetworkCalls, 0);
  });
});
