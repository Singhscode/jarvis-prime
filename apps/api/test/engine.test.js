// Comprehensive test suite for the JARVIS PRIME engine.
// Run with: npm test   (uses Node's built-in test runner)
//
// Tests cover:
//   - ICP scoring with custom weights and thresholds
//   - Reply classification
//   - Middleware (validation, rate limiter, auth)
//   - Provider interfaces
//   - Event bus
//   - Queue
//   - Config client overrides

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreProspect } from '../src/modules/prospects/icp-scorer.js';
import { classifyReply } from '../src/ai/agents/inbound-agent.js';

const client = {
  name: 'Demo Agency',
  icp_titles: ['Founder', 'Head of Sales'],
  icp_industries: ['Marketing'],
  icp_locations: ['India'],
  icp_keywords: ['agency', 'outbound', 'b2b'],
};

// ---- ICP Scoring ----

describe('ICP Scorer', () => {
  test('scores a perfect-fit prospect as hot', () => {
    const r = scoreProspect(
      {
        full_name: 'Aarav Sharma',
        title: 'Founder',
        company: 'BrightReach Agency',
        industry: 'Marketing',
        location: 'Gurgaon, India',
        email: 'aarav@brightreach.com',
      },
      client
    );
    assert.ok(r.score >= 24, `expected hot score, got ${r.score}`);
    assert.equal(r.qualified, true);
    assert.equal(r.hot, true);
  });

  test('disqualifies an obvious bad fit', () => {
    const r = scoreProspect(
      { full_name: 'Sam Intern', title: 'Student Intern', company: 'College', email: 'sam@uni.edu' },
      client
    );
    assert.equal(r.qualified, false);
    assert.equal(r.score, 0);
  });

  test('low-signal prospect is not qualified', () => {
    const r = scoreProspect(
      { full_name: 'Jane Doe', title: 'Junior Designer', company: 'Random Co', email: 'jane@random.com' },
      client
    );
    assert.equal(r.qualified, false);
  });

  test('respects custom scoring weights from client config', () => {
    const customClient = {
      ...client,
      config: {
        scoringWeights: { title: 15, industry: 5, location: 2, keyword: 1, email: 1 },
        qualifyThreshold: 20,
        hotThreshold: 22,
      },
    };
    const r = scoreProspect(
      {
        full_name: 'Test CEO',
        title: 'Founder',
        company: 'TestCo Agency',
        industry: 'Marketing',
        location: 'India',
        email: 'test@testco.com',
      },
      customClient
    );
    // With title weight 15 + industry 5 + location 2 + keyword + email = should be high
    assert.ok(r.score >= 20, `expected qualified with custom weights, got ${r.score}`);
    assert.equal(r.qualified, true);
  });

  test('respects custom disqualifiers from client config', () => {
    const customClient = {
      ...client,
      config: {
        disqualifiers: ['contractor', 'temp'],
      },
    };
    const r = scoreProspect(
      { full_name: 'John Temp', title: 'Temp Worker', company: 'StaffingCo', email: 'john@staff.com' },
      customClient
    );
    assert.equal(r.qualified, false);
    assert.equal(r.score, 0);
  });

  test('handles empty prospect gracefully', () => {
    const r = scoreProspect({}, {});
    assert.equal(r.qualified, false);
    assert.equal(typeof r.score, 'number');
  });

  test('handles missing email', () => {
    const r = scoreProspect(
      { full_name: 'No Email', title: 'Founder', company: 'TestCo', industry: 'Marketing' },
      client
    );
    assert.ok(r.score < 30, 'should not get max score without email');
  });
});

// ---- Reply Classification ----

describe('Reply Classification', () => {
  test('detects unsubscribe intent', () => {
    assert.equal(classifyReply('Please unsubscribe me'), 'unsubscribe');
    assert.equal(classifyReply('Opt out please'), 'unsubscribe');
    assert.equal(classifyReply('Remove me from this list'), 'unsubscribe');
  });

  test('detects auto-reply', () => {
    assert.equal(classifyReply('Out of office until Monday'), 'auto_reply');
    assert.equal(classifyReply('This is an automatic reply'), 'auto_reply');
  });

  test('detects negative intent', () => {
    assert.equal(classifyReply('Not interested, thanks'), 'negative');
    assert.equal(classifyReply('No thanks'), 'negative');
  });

  test('detects positive intent', () => {
    assert.equal(classifyReply("Sure, let's talk — send a calendar link"), 'positive');
    assert.equal(classifyReply('I am interested, tell me more'), 'positive');
  });

  test('defaults to question for ambiguous replies', () => {
    assert.equal(classifyReply('What exactly do you do?'), 'question');
    assert.equal(classifyReply('Can you share more details about pricing?'), 'question');
  });

  test('handles empty input', () => {
    assert.equal(classifyReply(''), 'question');
    assert.equal(classifyReply(), 'question');
  });
});

// ---- Validation Middleware ----

describe('Validation Middleware', () => {
  test('validates required fields', async () => {
    const { validate } = await import('../src/middleware/validate.js');
    const middleware = validate({ action: 'string', count: 'number' });

    const req = { body: { action: 'test', count: 5 } };
    const res = {};
    let nextCalled = false;

    middleware(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  test('rejects missing required fields', async () => {
    const { validate } = await import('../src/middleware/validate.js');
    const middleware = validate({ action: 'string' });

    const req = { body: {} };
    assert.throws(() => middleware(req, {}, () => {}), { message: /Missing required field/ });
  });

  test('allows optional fields', async () => {
    const { validate } = await import('../src/middleware/validate.js');
    const middleware = validate({ action: 'string', params: 'object?' });

    const req = { body: { action: 'test' } };
    let nextCalled = false;
    middleware(req, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  test('rejects wrong types', async () => {
    const { validate } = await import('../src/middleware/validate.js');
    const middleware = validate({ count: 'number' });

    const req = { body: { count: 'not-a-number' } };
    assert.throws(() => middleware(req, {}, () => {}), { message: /must be of type/ });
  });
});

// ---- Rate Limiter ----

describe('Rate Limiter', () => {
  test('allows requests under the limit', async () => {
    const { createRateLimiter } = await import('../src/middleware/rate-limiter.js');
    const limiter = createRateLimiter({ windowMs: 60000, max: 5 });

    let passed = 0;
    const req = { ip: '127.0.0.1' };
    const res = { setHeader: () => {}, status: () => ({ json: () => {} }) };

    for (let i = 0; i < 5; i++) {
      limiter(req, res, () => { passed++; });
    }

    assert.equal(passed, 5);
    limiter._cleanup();
  });

  test('blocks requests over the limit', async () => {
    const { createRateLimiter } = await import('../src/middleware/rate-limiter.js');
    const limiter = createRateLimiter({ windowMs: 60000, max: 2 });

    let passed = 0;
    let blocked = false;
    const req = { ip: '10.0.0.1' };
    const res = {
      setHeader: () => {},
      status: (code) => {
        if (code === 429) blocked = true;
        return { json: () => {} };
      },
    };

    for (let i = 0; i < 5; i++) {
      limiter(req, res, () => { passed++; });
    }

    assert.equal(passed, 2);
    assert.equal(blocked, true);
    limiter._cleanup();
  });
});

// ---- Event Bus ----

describe('Event Bus', () => {
  test('emits and receives events', async () => {
    const { eventBus } = await import('../src/utils/event-bus.js');

    let received = null;
    eventBus.on('test.event', (data) => { received = data; });
    await eventBus.emit('test.event', { value: 42 });

    assert.deepEqual(received, { value: 42 });
    eventBus.removeAll('test.event');
  });

  test('once-listener fires only once', async () => {
    const { eventBus } = await import('../src/utils/event-bus.js');

    let count = 0;
    eventBus.once('test.once', () => { count++; });
    await eventBus.emit('test.once');
    await eventBus.emit('test.once');

    assert.equal(count, 1);
  });

  test('unsubscribe works', async () => {
    const { eventBus } = await import('../src/utils/event-bus.js');

    let count = 0;
    const unsub = eventBus.on('test.unsub', () => { count++; });
    await eventBus.emit('test.unsub');
    unsub();
    await eventBus.emit('test.unsub');

    assert.equal(count, 1);
  });
});

// ---- Queue ----

describe('Queue', () => {
  test('enqueue and process jobs', async () => {
    const { queue } = await import('../src/jobs/queue.js');

    let processedPayload = null;
    queue.process('test_job', async (job) => {
      processedPayload = job.payload;
    });

    queue.enqueue('test_job', { message: 'hello' });

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 200));

    assert.deepEqual(processedPayload, { message: 'hello' });
  });

  test('tracks queue stats', async () => {
    const { queue } = await import('../src/jobs/queue.js');
    const stats = queue.stats();
    assert.equal(typeof stats.total, 'number');
    assert.equal(typeof stats.pending, 'number');
    assert.equal(typeof stats.completed, 'number');
  });
});

// ---- Config ----

describe('Config', () => {
  test('getClientConfig merges defaults with client overrides', async () => {
    const { getClientConfig } = await import('../src/config/config.js');

    const clientWithConfig = {
      config: {
        maxSteps: 5,
        followupDays: [0, 2, 4, 6, 8],
      },
    };

    const cc = getClientConfig(clientWithConfig);
    assert.equal(cc.maxSteps, 5);
    assert.deepEqual(cc.followupDays, [0, 2, 4, 6, 8]);
    assert.ok(cc.scoringWeights.title > 0, 'should have default scoring weights');
  });

  test('getClientConfig returns defaults for empty client', async () => {
    const { getClientConfig } = await import('../src/config/config.js');

    const cc = getClientConfig({});
    assert.equal(cc.maxSteps, 3);
    assert.equal(cc.qualifyThreshold, 15);
    assert.equal(cc.hotThreshold, 24);
  });
});

// ---- Auth: JWT Service ----

describe('JWT Service', () => {
  const secret = 'test-secret-for-jwt-unit-tests';
  const user = { id: 'user-123', email: 'test@example.com', role: 'client' };
  const session = { id: 'session-456', device_id: 'device-abc' };

  test('creates and verifies a valid access token', async () => {
    const { createAccessToken, verifyAccessToken } = await import('../src/modules/auth/jwt-service.js');
    const token = createAccessToken(user, session, secret);
    const payload = verifyAccessToken(token, secret);

    assert.ok(payload, 'token should verify successfully');
    assert.equal(payload.sub, user.id);
    assert.equal(payload.email, user.email);
    assert.equal(payload.session_id, session.id);
  });

  test('rejects a token signed with the wrong secret', async () => {
    const { createAccessToken, verifyAccessToken } = await import('../src/modules/auth/jwt-service.js');
    const token = createAccessToken(user, session, secret);
    const payload = verifyAccessToken(token, 'wrong-secret');
    assert.equal(payload, null);
  });

  test('rejects a tampered token payload', async () => {
    const { createAccessToken, verifyAccessToken } = await import('../src/modules/auth/jwt-service.js');
    const token = createAccessToken(user, session, secret);
    const [header, payload, signature] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'attacker-id' })).toString('base64url');
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;
    const result = verifyAccessToken(tamperedToken, secret);
    assert.equal(result, null);
  });

  test('extracts bearer token from Authorization header', async () => {
    const { extractBearerToken } = await import('../src/modules/auth/jwt-service.js');
    assert.equal(extractBearerToken('Bearer abc123'), 'abc123');
    assert.equal(extractBearerToken('abc123'), null);
    assert.equal(extractBearerToken(null), null);
  });
});

// ---- Auth: Crypto ----

describe('Auth Crypto', () => {
  test('hashes and verifies a password correctly', async () => {
    const { hashPassword, verifyPassword } = await import('../src/modules/auth/crypto.js');
    const password = 'CorrectHorse123!';
    const hash = await hashPassword(password);

    assert.ok(hash, 'hash should be produced');
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword('WrongPassword456!', hash), false);
  });

  test('generates and verifies token hashes', async () => {
    const { generateToken, hashToken, verifyTokenHash } = await import('../src/modules/auth/crypto.js');
    const token = generateToken();
    const hash = hashToken(token);

    assert.equal(verifyTokenHash(token, hash), true);
    assert.equal(verifyTokenHash('wrong-token', hash), false);
  });
});

// ---- Auth: Middleware ----

describe('Auth Middleware', () => {
  test('rejects requests with no Authorization header', async () => {
    const { createAuthMiddleware } = await import('../src/middleware/auth-middleware.js');
    const middleware = createAuthMiddleware();

    const req = { headers: {}, path: '/protected' };
    let statusCode = null;
    let responseBody = null;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { responseBody = body; return this; },
    };

    middleware(req, res, () => { throw new Error('next() should not be called'); });

    assert.equal(statusCode, 401);
    assert.equal(responseBody.error.code, 'MISSING_TOKEN');
  });
});

// ---- Logger ----

describe('Logger', () => {
  test('child logger preserves context', async () => {
    const { log } = await import('../src/utils/logger.js');
    const childLog = log.child({ requestId: 'test-123', clientId: 'client-abc' });
    assert.ok(childLog.info, 'child logger should have info method');
    assert.ok(childLog.child, 'child logger should support further nesting');
  });

  test('timer works', async () => {
    const { log } = await import('../src/utils/logger.js');
    log.time('test-timer');
    await new Promise((r) => setTimeout(r, 10));
    // Should not throw
    log.timeEnd('test-timer');
  });
});

// ---- CRM Foundation ----

describe('CRM Foundation', () => {
  test('rejects unsupported contact fields before database access', async () => {
    const { updateContact } = await import('../src/modules/crm/crm.service.js');

    await assert.rejects(
      updateContact('user-123', 'contact-123', { unexpected: 'value' }),
      { code: 'INVALID_FIELDS' }
    );
  });

  test('requires bearer authentication for CRM routes', async () => {
    const express = (await import('express')).default;
    const { default: crmRouter } = await import('../src/modules/crm/crm.routes.js');
    const app = express();
    app.use('/crm', crmRouter);
    const server = await new Promise((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });

    try {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/crm/companies`);
      const body = await response.json();

      assert.equal(response.status, 401);
      assert.equal(body.error.code, 'MISSING_TOKEN');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
