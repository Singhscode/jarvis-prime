// Tests for Phase 12 Analytics & Reporting.
//
// These tests exercise the REAL production code paths:
//   - analytics.service.js  (scope derivation, date parsing, response shaping)
//   - analytics.repository.js (Supabase query construction)
//   - analytics.routes.js   (HTTP layer, auth middleware, error responses)
//
// Supabase's HTTP calls are intercepted at the global fetch layer (same
// pattern as owner-workspace.test.js) so no real network or database is
// required — but the actual service/repository/route code runs unmodified.

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const nativeFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://analytics.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'analytics-test-jwt-secret';
process.env.DRY_RUN = 'true';

const OWNER_ID = '10000000-0000-4000-8000-000000000001';
const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000002';

const calls = [];
let usersTable = { id: OWNER_ID, role: 'client', status: 'active' };
let clientPortalMembershipCount = 0;
let handler = () => { throw new Error('Unexpected database request'); };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const count = (value) => new Response(null, { status: 200, headers: { 'content-range': `0-0/${value}` } });

globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const requestUrl = new URL(url);
  calls.push(url);

  // Authorization scope check (analytics.service.js `scope()`)
  if (requestUrl.pathname.endsWith('/users') && requestUrl.searchParams.get('id') === `eq.${usersTable.id}`) {
    return json([usersTable]);
  }
  if (requestUrl.pathname.endsWith('/client_portal_memberships')) {
    return count(clientPortalMembershipCount);
  }

  return handler(requestUrl, init);
};

after(() => { globalThis.fetch = nativeFetch; });

const express = (await import('express')).default;
const { default: analyticsRouter } = await import('../src/modules/analytics/analytics.routes.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');
const { createAccessToken } = await import('../src/modules/auth/jwt-service.js');

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/analytics', analyticsRouter);
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    await run(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function token(userId = OWNER_ID, role = 'client') {
  return createAccessToken(
    { id: userId, email: 'owner@example.test', role },
    { id: '20000000-0000-4000-8000-000000000002', device_id: 'test' },
    process.env.JWT_SECRET
  );
}

function resetAuthorization() {
  usersTable = { id: OWNER_ID, role: 'client', status: 'active' };
  clientPortalMembershipCount = 0;
}

describe('Analytics — Authorization Scope', () => {
  test('Owner (active client, no portal membership) can access analytics', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/finance_invoices')) return json([]);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/revenue?start=2026-01-01&end=2026-01-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 200);
    });
  });

  test('Inactive user cannot access analytics', async () => {
    resetAuthorization();
    usersTable = { id: OWNER_ID, role: 'client', status: 'inactive' };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/dashboard`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'INSUFFICIENT_PERMISSIONS');
    });
  });

  test('Employee (role=employee) cannot access analytics — MVP is owner-only', async () => {
    resetAuthorization();
    usersTable = { id: EMPLOYEE_ID, role: 'employee', status: 'active' };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/dashboard`, {
        headers: { Authorization: `Bearer ${token(EMPLOYEE_ID, 'employee')}` },
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).error.code, 'INSUFFICIENT_PERMISSIONS');
    });
  });

  test('Client-portal member cannot access analytics even with role=client', async () => {
    resetAuthorization();
    clientPortalMembershipCount = 1;
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/dashboard`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 403);
    });
  });

  test('Missing/invalid JWT is rejected before touching the database', async () => {
    resetAuthorization();
    handler = () => { throw new Error('Should not query the database without a valid JWT'); };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/dashboard`);
      assert.equal(response.status, 401);
    });
  });
});

describe('Analytics — Tenant Isolation', () => {
  test('every repository query scopes by the caller owner_user_id, never a client-supplied one', async () => {
    resetAuthorization();
    const otherOwnerId = '30000000-0000-4000-8000-000000000003';
    handler = (url) => {
      if (url.pathname.endsWith('/finance_invoices')) return json([{ issued_at: '2026-06-01T00:00:00Z', total_amount_minor: 5000 }]);
      if (url.pathname.endsWith('/crm_clients')) return count(1);
      if (url.pathname.endsWith('/crm_projects')) return count(1);
      if (url.pathname.endsWith('/crm_tasks')) return count(1);
      if (url.pathname.endsWith('/crm_leads')) return count(0);
      if (url.pathname.endsWith('/communication_messages') || url.pathname.endsWith('/communication_threads')) return count(0);
      if (url.pathname.endsWith('/automation_runs')) return count(0);
      if (url.pathname.endsWith('/finance_expenses')) return url.searchParams.get('select') === 'amount_minor' ? json([]) : count(0);
      throw new Error(`Unexpected query: ${url}`);
    };
    calls.length = 0;
    await withServer(async (port) => {
      // Attempt to smuggle a different owner id via query string — the route never reads it.
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/dashboard?owner_user_id=${otherOwnerId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 200);
    });
    const dataQueries = calls.filter((url) => {
      const parsed = new URL(url);
      return !parsed.pathname.endsWith('/users') && !parsed.pathname.endsWith('/client_portal_memberships');
    });
    assert.ok(dataQueries.length > 0, 'expected at least one data query');
    for (const rawUrl of dataQueries) {
      const parsed = new URL(rawUrl);
      assert.equal(parsed.searchParams.get('owner_user_id'), `eq.${OWNER_ID}`, `query did not scope by the JWT subject: ${rawUrl}`);
      assert.notEqual(parsed.searchParams.get('owner_user_id'), `eq.${otherOwnerId}`);
    }
  });

  test('two different owners see independent dashboard results from the same route', async () => {
    resetAuthorization();
    const dataByOwner = {
      [OWNER_ID]: { revenue: 150000, clients: 3 },
      '40000000-0000-4000-8000-000000000004': { revenue: 999999, clients: 1 },
    };
    handler = (url) => {
      const owner = url.searchParams.get('owner_user_id')?.replace('eq.', '');
      const fixture = dataByOwner[owner];
      if (!fixture) throw new Error(`No fixture for owner ${owner}`);
      if (url.pathname.endsWith('/finance_invoices')) return json([{ issued_at: '2026-06-01T00:00:00Z', total_amount_minor: fixture.revenue }]);
      if (url.pathname.endsWith('/crm_clients')) return count(fixture.clients);
      if (url.pathname.endsWith('/crm_projects')) return count(0);
      if (url.pathname.endsWith('/crm_tasks')) return count(0);
      if (url.pathname.endsWith('/crm_leads')) return count(0);
      if (url.pathname.endsWith('/communication_messages') || url.pathname.endsWith('/communication_threads')) return count(0);
      if (url.pathname.endsWith('/automation_runs')) return count(0);
      if (url.pathname.endsWith('/finance_expenses')) return url.searchParams.get('select') === 'amount_minor' ? json([]) : count(0);
      throw new Error(`Unexpected query: ${url}`);
    };

    await withServer(async (port) => {
      const ownerAResponse = await nativeFetch(`http://127.0.0.1:${port}/analytics/dashboard`, {
        headers: { Authorization: `Bearer ${token(OWNER_ID)}` },
      });
      const ownerABody = (await ownerAResponse.json()).data;
      assert.equal(ownerABody.overview.revenue.totalMinor, 150000);
      assert.equal(ownerABody.overview.clients, 3);

      usersTable = { id: '40000000-0000-4000-8000-000000000004', role: 'client', status: 'active' };
      const ownerBResponse = await nativeFetch(`http://127.0.0.1:${port}/analytics/dashboard`, {
        headers: { Authorization: `Bearer ${token('40000000-0000-4000-8000-000000000004')}` },
      });
      const ownerBBody = (await ownerBResponse.json()).data;
      assert.equal(ownerBBody.overview.revenue.totalMinor, 999999);
      assert.equal(ownerBBody.overview.clients, 1);

      // Confirm no cross-contamination: Owner B's numbers never equal Owner A's fixture.
      assert.notEqual(ownerBBody.overview.revenue.totalMinor, ownerABody.overview.revenue.totalMinor);
    });
  });
});

describe('Analytics — Revenue (date-scope consistency)', () => {
  test('total, invoice count, and average are all derived from the SAME date-scoped query', async () => {
    resetAuthorization();
    // Three paid invoices inside the requested range, one paid invoice OUTSIDE the range.
    // The in-range invoices are 50000 + 100000 + 75000 = 225000 minor, average 75000.
    handler = (url) => {
      if (url.pathname.endsWith('/finance_invoices')) {
        assert.equal(url.searchParams.get('status'), 'eq.paid');
        const issuedAtFilters = [...url.searchParams.entries()].filter(([key]) => key === 'issued_at').map(([, value]) => value);
        assert.ok(issuedAtFilters.some((v) => v.startsWith('gte.')), 'expected a gte filter on issued_at');
        assert.ok(issuedAtFilters.some((v) => v.startsWith('lte.')), 'expected an lte filter on issued_at');
        return json([
          { issued_at: '2026-08-01T00:00:00Z', total_amount_minor: 50000 },
          { issued_at: '2026-08-10T00:00:00Z', total_amount_minor: 100000 },
          { issued_at: '2026-08-20T00:00:00Z', total_amount_minor: 75000 },
        ]);
      }
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/revenue?start=2026-08-01&end=2026-08-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 200);
      const body = (await response.json()).data;
      assert.equal(body.revenue.totalMinor, 225000);
      assert.equal(body.invoiceCount, 3);
      assert.equal(body.revenue.averagePerInvoiceMinor, 75000);
      // Regression guard: total must equal count * average (i.e. same source rows).
      assert.equal(body.revenue.totalMinor, body.invoiceCount * body.revenue.averagePerInvoiceMinor);
    });
  });

  test('an out-of-range paid invoice never affects the requested period total (regression)', async () => {
    resetAuthorization();
    // This fixture behaves like a real Postgres/PostgREST query: it only
    // returns rows that satisfy BOTH the gte and lte filters on issued_at.
    // The old (buggy) implementation ran a SEPARATE, unbounded query for the
    // total — which would have summed in an out-of-range invoice regardless
    // of what filters the URL carried. By actually filtering here, this test
    // fails against that old two-query implementation and passes against the
    // current single-query implementation.
    const allInvoices = [
      { issued_at: '2026-08-15T00:00:00Z', total_amount_minor: 50000 },   // in range
      { issued_at: '2026-12-25T00:00:00Z', total_amount_minor: 999999 }, // far out of range
      { issued_at: '2026-07-01T00:00:00Z', total_amount_minor: 250000 }, // before range
    ];
    let queryCount = 0;
    handler = (url) => {
      if (url.pathname.endsWith('/finance_invoices')) {
        queryCount += 1;
        const gte = url.searchParams.get('issued_at.gte') ?? [...url.searchParams.entries()].find(([k, v]) => k === 'issued_at' && v.startsWith('gte.'))?.[1]?.slice(4);
        const lte = [...url.searchParams.entries()].filter(([k, v]) => k === 'issued_at' && v.startsWith('lte.')).map(([, v]) => v.slice(4))[0];
        assert.ok(gte, 'query must include a gte filter on issued_at');
        assert.ok(lte, 'query must include an lte filter on issued_at');
        const filtered = allInvoices.filter((inv) => inv.issued_at >= gte && inv.issued_at <= lte);
        return json(filtered);
      }
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/revenue?start=2026-08-01&end=2026-08-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const body = (await response.json()).data;
      assert.equal(body.revenue.totalMinor, 50000, 'total must only include the in-range invoice, not the 999999 or 250000 out-of-range ones');
      assert.equal(body.invoiceCount, 1);
    });
    // The fix removed the old second, unbounded query — exactly one query to finance_invoices per request.
    assert.equal(queryCount, 1, 'expected exactly one finance_invoices query (total and count must come from the same query)');
  });

  test('rejects a date range where start >= end before querying the database', async () => {
    resetAuthorization();
    handler = () => { throw new Error('Must not query the database for an invalid range'); };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/revenue?start=2026-09-15&end=2026-09-01`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    });
  });

  test('rejects missing start/end params', async () => {
    resetAuthorization();
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/revenue`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 400);
    });
  });

  test('rejects an invalid date string', async () => {
    resetAuthorization();
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/revenue?start=not-a-date&end=2026-09-19`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 400);
    });
  });

  test('zero paid invoices in range returns zero revenue, not an error', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/finance_invoices')) return json([]);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/revenue?start=2026-01-01&end=2026-01-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 200);
      const body = (await response.json()).data;
      assert.equal(body.revenue.totalMinor, 0);
      assert.equal(body.invoiceCount, 0);
      assert.equal(body.revenue.averagePerInvoiceMinor, 0);
    });
  });
});

describe('Analytics — Dashboard', () => {
  test('assembles revenue, clients, projects, tasks, leads, communication, automation, expenses in one response', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/finance_invoices')) {
        return json([
          { issued_at: '2026-09-01T00:00:00Z', total_amount_minor: 50000 },
          { issued_at: '2026-09-05T00:00:00Z', total_amount_minor: 100000 },
        ]);
      }
      if (url.pathname.endsWith('/crm_clients')) return count(3);
      if (url.pathname.endsWith('/crm_projects')) return count(1);
      if (url.pathname.endsWith('/crm_tasks') && url.searchParams.get('completed') === 'eq.true') return count(3);
      if (url.pathname.endsWith('/crm_tasks')) return count(4);
      if (url.pathname.endsWith('/crm_leads')) return count(2);
      if (url.pathname.endsWith('/communication_messages')) return count(5);
      if (url.pathname.endsWith('/communication_threads')) return count(1);
      if (url.pathname.endsWith('/automation_runs') && url.searchParams.get('state') === 'eq.COMPLETED') return count(8);
      if (url.pathname.endsWith('/automation_runs')) return count(2);
      if (url.pathname.endsWith('/finance_expenses') && url.searchParams.get('select') === 'amount_minor') return json([{ amount_minor: 1000 }]);
      if (url.pathname.endsWith('/finance_expenses') && url.searchParams.get('status') === 'eq.approved') return count(1);
      if (url.pathname.endsWith('/finance_expenses')) return count(2);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/dashboard`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = (await response.json()).data;
      assert.equal(body.overview.revenue.totalMinor, 150000);
      assert.equal(body.overview.revenue.totalMajor, 1500);
      assert.equal(body.overview.clients, 3);
      assert.equal(body.overview.projects, 1);
      assert.equal(body.overview.tasks.total, 4);
      assert.equal(body.overview.tasks.completed, 3);
      assert.equal(body.overview.tasks.completionRate, 75);
      assert.equal(body.overview.leads, 2);
      assert.equal(body.overview.expenses.total, 2);
      assert.equal(body.overview.expenses.approved, 1);
      assert.equal(body.overview.expenses.totalMinor, 1000);
      assert.equal(body.activity24h.messagesSent, 5);
      assert.equal(body.activity24h.threadsCreated, 1);
      assert.equal(body.activity24h.automationRuns.completed, 8);
      assert.equal(body.activity24h.automationRuns.failed, 2);
      assert.ok(body.generatedAt);
    });
  });
});

describe('Analytics — Tasks & Automation edge cases', () => {
  test('task completion rate is 0 (not NaN or an error) when there are zero tasks', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/crm_tasks')) return count(0);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/tasks`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 200);
      const body = (await response.json()).data;
      assert.equal(body.total, 0);
      assert.equal(body.completed, 0);
      assert.equal(body.completionRate, 0);
    });
  });

  test('automation success rate is null (not NaN or an error) when there are zero runs', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/automation_runs')) return count(0);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/automation`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 200);
      const body = (await response.json()).data;
      assert.equal(body.runsCompleted24h, 0);
      assert.equal(body.runsFailed24h, 0);
      assert.equal(body.successRate, null);
    });
  });
});

describe('Analytics — Clients, Projects, Leads, Communication, Expenses (real repository calls)', () => {
  test('GET /clients returns total, active, and new-this-month counts from crm_clients', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/crm_clients') && url.searchParams.has('updated_at')) return count(2);
      if (url.pathname.endsWith('/crm_clients') && url.searchParams.has('created_at')) return count(1);
      if (url.pathname.endsWith('/crm_clients')) return count(5);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/clients`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const body = (await response.json()).data;
      assert.equal(body.total, 5);
      assert.equal(body.active, 2);
      assert.equal(body.newThisMonth, 1);
    });
  });

  test('GET /projects returns the project count from crm_projects', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/crm_projects')) return count(7);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/projects`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal((await response.json()).data.total, 7);
    });
  });

  test('GET /leads returns the lead count from crm_leads (CRM/prospects coverage)', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/crm_leads')) return count(12);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/leads`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal((await response.json()).data.total, 12);
    });
  });

  test('GET /communication returns 24h message and thread counts', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/communication_messages')) return count(9);
      if (url.pathname.endsWith('/communication_threads')) return count(4);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/communication`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const body = (await response.json()).data;
      assert.equal(body.messagesSent24h, 9);
      assert.equal(body.threadsCreated24h, 4);
    });
  });

  test('GET /expenses returns total, approved, and minor/major amounts from finance_expenses', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/finance_expenses') && url.searchParams.get('select') === 'amount_minor') {
        return json([{ amount_minor: 20000 }, { amount_minor: 5000 }]);
      }
      if (url.pathname.endsWith('/finance_expenses') && url.searchParams.get('status') === 'eq.approved') return count(2);
      if (url.pathname.endsWith('/finance_expenses')) return count(3);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/expenses`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const body = (await response.json()).data;
      assert.equal(body.total, 3);
      assert.equal(body.approved, 2);
      assert.equal(body.totalMinor, 25000);
      assert.equal(body.totalMajor, 250);
    });
  });
});

describe('Analytics — Daily metrics endpoint', () => {
  test('returns an empty list when analytics_daily_metrics has no rows for the range', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/analytics_daily_metrics')) return json([]);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/daily?start=2026-08-01&end=2026-08-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 200);
      const body = (await response.json()).data;
      assert.deepEqual(body.metrics, []);
      assert.equal(body.count, 0);
    });
  });

  test('formats real analytics_daily_metrics rows into the documented response shape', async () => {
    resetAuthorization();
    handler = (url) => {
      if (url.pathname.endsWith('/analytics_daily_metrics')) {
        return json([{
          metric_date: '2026-08-15',
          crm_leads_created: 5,
          crm_leads_qualified: 2,
          crm_leads_converted: 1,
          finance_revenue_minor: 100000,
          finance_invoices_issued: 3,
          finance_payments_received_minor: 80000,
          finance_expenses_submitted: 2,
          communication_threads_created: 4,
          communication_messages_sent: 20,
          communication_delivery_failed: 0,
          automation_runs_completed: 6,
          automation_runs_failed: 1,
          automation_work_items_completed: 10,
        }]);
      }
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/daily?start=2026-08-01&end=2026-08-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      const body = (await response.json()).data;
      assert.equal(body.count, 1);
      const day = body.metrics[0];
      assert.equal(day.date, '2026-08-15');
      assert.equal(day.crm.leadsCreated, 5);
      assert.equal(day.finance.revenueMinor, 100000);
      assert.equal(day.finance.revenueMajor, 1000);
      assert.equal(day.communication.messagesSent, 20);
      assert.equal(day.automation.runsCompleted, 6);
    });
  });
});

describe('Analytics — Daily snapshot job (real data source for /daily)', () => {
  test('runDailySnapshotForAllOwners computes real activity and upserts one row per eligible owner', async () => {
    resetAuthorization();
    const { runDailySnapshotForAllOwners } = await import('../src/modules/analytics/analytics.service.js');
    const day = '2026-08-15';
    const ownerX = '50000000-0000-4000-8000-000000000005';
    const ownerY = '60000000-0000-4000-8000-000000000006';
    let upserted = [];

    handler = (url, init) => {
      if (url.pathname.endsWith('/users') && url.searchParams.get('role') === 'eq.client') {
        return json([{ id: ownerX }, { id: ownerY }]);
      }
      if (url.pathname.endsWith('/client_portal_memberships')) return json([]);

      // Count-style queries (head:true) — distinguish by table + params.
      if (url.pathname.endsWith('/crm_leads')) return count(url.searchParams.get('owner_user_id') === `eq.${ownerX}` ? 2 : 0);
      if (url.pathname.endsWith('/finance_invoices') && url.searchParams.get('select') === 'id') return count(1);
      if (url.pathname.endsWith('/finance_invoices')) {
        return json(url.searchParams.get('owner_user_id') === `eq.${ownerX}`
          ? [{ total_amount_minor: 30000 }]
          : []);
      }
      if (url.pathname.endsWith('/finance_payments')) {
        return json(url.searchParams.get('owner_user_id') === `eq.${ownerX}`
          ? [{ amount_minor: 25000 }]
          : []);
      }
      if (url.pathname.endsWith('/finance_expenses')) return count(0);
      if (url.pathname.endsWith('/communication_threads')) return count(url.searchParams.get('owner_user_id') === `eq.${ownerX}` ? 1 : 0);
      if (url.pathname.endsWith('/communication_messages')) return count(url.searchParams.get('owner_user_id') === `eq.${ownerX}` ? 4 : 0);
      if (url.pathname.endsWith('/communication_deliveries')) return count(0);
      if (url.pathname.endsWith('/automation_runs') && url.searchParams.get('state') === 'eq.COMPLETED') return count(url.searchParams.get('owner_user_id') === `eq.${ownerX}` ? 3 : 0);
      if (url.pathname.endsWith('/automation_runs') && url.searchParams.get('state') === 'eq.FAILED') return count(0);
      if (url.pathname.endsWith('/automation_work_items')) return count(url.searchParams.get('owner_user_id') === `eq.${ownerX}` ? 5 : 0);
      if (url.pathname.endsWith('/analytics_daily_metrics')) {
        const body = init?.body ? JSON.parse(init.body) : null;
        upserted.push(body);
        return json(body);
      }
      throw new Error(`Unexpected query: ${url}`);
    };

    const result = await runDailySnapshotForAllOwners(day);
    assert.equal(result.date, day);
    assert.equal(result.ownersProcessed, 2);
    assert.equal(result.ownersFailed, 0);
    assert.equal(upserted.length, 2);

    const rowX = upserted.find((r) => r.owner_user_id === ownerX);
    assert.ok(rowX, 'expected a snapshot row for ownerX');
    assert.equal(rowX.metric_date, day);
    assert.equal(rowX.crm_leads_created, 2);
    assert.equal(rowX.finance_revenue_minor, 30000);
    assert.equal(rowX.finance_payments_received_minor, 25000);
    assert.equal(rowX.communication_threads_created, 1);
    assert.equal(rowX.communication_messages_sent, 4);
    assert.equal(rowX.automation_runs_completed, 3);
    assert.equal(rowX.automation_work_items_completed, 5);
    // Columns with no corresponding concept in the schema stay at 0, not a guess.
    assert.equal(rowX.crm_leads_qualified, 0);
    assert.equal(rowX.crm_leads_converted, 0);

    const rowY = upserted.find((r) => r.owner_user_id === ownerY);
    assert.ok(rowY, 'expected a snapshot row for ownerY');
    assert.equal(rowY.finance_revenue_minor, 0);
    assert.equal(rowY.crm_leads_created, 0);
  });

  test('GET /daily returns the exact numbers the snapshot job wrote, end-to-end through the real HTTP route', async () => {
    resetAuthorization();
    const day = '2026-08-15';
    const storedRow = {
      metric_date: day,
      crm_leads_created: 2,
      crm_leads_qualified: 0,
      crm_leads_converted: 0,
      finance_revenue_minor: 30000,
      finance_invoices_issued: 1,
      finance_payments_received_minor: 25000,
      finance_expenses_submitted: 0,
      communication_threads_created: 1,
      communication_messages_sent: 4,
      communication_delivery_failed: 0,
      automation_runs_completed: 3,
      automation_runs_failed: 0,
      automation_work_items_completed: 5,
    };
    handler = (url) => {
      if (url.pathname.endsWith('/analytics_daily_metrics')) return json([storedRow]);
      throw new Error(`Unexpected query: ${url}`);
    };
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/daily?start=2026-08-01&end=2026-08-31`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 200);
      const body = (await response.json()).data;
      assert.equal(body.count, 1);
      const day0 = body.metrics[0];
      assert.equal(day0.date, day);
      assert.equal(day0.crm.leadsCreated, 2);
      assert.equal(day0.finance.revenueMinor, 30000);
      assert.equal(day0.finance.paymentsReceivedMinor, 25000);
      assert.equal(day0.communication.threadsCreated, 1);
      assert.equal(day0.communication.messagesSent, 4);
      assert.equal(day0.automation.runsCompleted, 3);
      assert.equal(day0.automation.workItemsCompleted, 5);
    });
  });

  test('a failure for one owner does not stop the batch from processing the rest', async () => {
    resetAuthorization();
    const { runDailySnapshotForAllOwners } = await import('../src/modules/analytics/analytics.service.js');
    const ownerFail = '70000000-0000-4000-8000-000000000007';
    const ownerOk = '80000000-0000-4000-8000-000000000008';
    handler = (url) => {
      if (url.pathname.endsWith('/users') && url.searchParams.get('role') === 'eq.client') {
        return json([{ id: ownerFail }, { id: ownerOk }]);
      }
      if (url.pathname.endsWith('/client_portal_memberships')) return json([]);
      if (url.pathname.endsWith('/crm_leads') && url.searchParams.get('owner_user_id') === `eq.${ownerFail}`) {
        return json({ message: 'simulated database error' }, 500);
      }
      if (url.pathname.endsWith('/crm_leads')) return count(0);
      if (url.pathname.endsWith('/finance_invoices')) return json([]);
      if (url.pathname.endsWith('/finance_payments')) return json([]);
      if (url.pathname.endsWith('/finance_expenses')) return count(0);
      if (url.pathname.endsWith('/communication_threads')) return count(0);
      if (url.pathname.endsWith('/communication_messages')) return count(0);
      if (url.pathname.endsWith('/communication_deliveries')) return count(0);
      if (url.pathname.endsWith('/automation_runs')) return count(0);
      if (url.pathname.endsWith('/automation_work_items')) return count(0);
      if (url.pathname.endsWith('/analytics_daily_metrics')) return json({});
      throw new Error(`Unexpected query: ${url}`);
    };
    const result = await runDailySnapshotForAllOwners('2026-08-15');
    assert.equal(result.ownersProcessed, 1);
    assert.equal(result.ownersFailed, 1);
  });
});

describe('Analytics — Status endpoint', () => {
  test('GET /analytics lists the real mounted endpoints', async () => {
    resetAuthorization();
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/analytics/`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      assert.equal(response.status, 200);
      const body = (await response.json()).data;
      assert.equal(body.status, 'ok');
      assert.ok(body.endpoints.includes('GET /api/analytics/dashboard'));
    });
  });
});
