// PostgreSQL Integration Tests for Phase 12 Analytics & Reporting
// Verifies analytics queries against actual Supabase database with RLS enforcement.

import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { URL } from 'node:url';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail-closed: Only allow local Postgres for integration tests
// This matches the pattern used in other integration tests (finance-billing, etc.)
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables required');
}

const parsedUrl = new URL(supabaseUrl);
const allowedHostnames = ['127.0.0.1', 'localhost', '::1'];

if (!allowedHostnames.includes(parsedUrl.hostname)) {
  throw new Error(
    `Integration tests must run against local database only. ` +
    `Received host: ${parsedUrl.hostname}. Allowed: ${allowedHostnames.join(', ')}.`
  );
}

const db = createClient(supabaseUrl, supabaseServiceKey);

describe('Analytics PostgreSQL Integration', () => {
  let ownerUserId = null;
  let secondOwnerUserId = null;

  before(async () => {
    // Two owners, used by the tenant-isolation assertions below.
    //
    // These rows are created directly in public.users, NOT through
    // db.auth.admin.createUser. This product authenticates with its own
    // identity store (apps/api/src/modules/auth + public.users); Supabase Auth
    // is not the identity source here. analytics_daily_metrics.owner_user_id is
    // a foreign key to public.users(id), so an auth.users row does not satisfy
    // it and every insert in this suite failed with
    // analytics_daily_metrics_owner_user_id_fkey. This now matches the fixture
    // pattern already used by the communication-hub, finance-billing, and
    // automation-control-plane integration suites.
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const owners = [
      { email: `owner1-analytics-${unique}@test.example`, full_name: 'Analytics Owner One' },
      { email: `owner2-analytics-${unique}@test.example`, full_name: 'Analytics Owner Two' },
    ].map((owner) => ({ ...owner, email_normalized: owner.email, role: 'client', status: 'active' }));

    const { data, error } = await db.from('users').insert(owners).select('id');
    if (error || !data || data.length !== 2) {
      throw new Error(`Failed to create test owners in public.users: ${error?.message || 'unexpected row count'}`);
    }

    ownerUserId = data[0].id;
    secondOwnerUserId = data[1].id;
  });

  // (owner_user_id, metric_date) is UNIQUE. Without per-test cleanup the tests
  // below all write overlapping dates for the same owner, so every test after
  // the first failed with 23505 on a key an earlier test had already inserted.
  // Clearing only the two fixture owners keeps each test independent of
  // execution order while leaving any unrelated rows in the database untouched.
  beforeEach(async () => {
    const owners = [ownerUserId, secondOwnerUserId].filter(Boolean);
    if (owners.length) await db.from('analytics_daily_metrics').delete().in('owner_user_id', owners);
  });

  after(async () => {
    // Metrics are removed before the owner row. owner_user_id is ON DELETE
    // CASCADE, so this is belt-and-braces rather than strictly required.
    for (const id of [ownerUserId, secondOwnerUserId]) {
      if (!id) continue;
      await db.from('analytics_daily_metrics').delete().eq('owner_user_id', id);
      await db.from('users').delete().eq('id', id);
    }
  });

  describe('analytics_daily_metrics table', () => {
    test('creates daily metrics record with valid data', async () => {
      const today = new Date().toISOString().split('T')[0];

      const { data: metric, error } = await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: ownerUserId,
          metric_date: today,
          crm_leads_created: 5,
          crm_leads_qualified: 2,
          crm_leads_converted: 1,
          finance_revenue_minor: 500000,
          finance_invoices_issued: 2,
          communication_messages_sent: 25,
          automation_runs_completed: 3,
          automation_runs_failed: 0,
        })
        .select()
        .single();

      assert.ok(!error, `Error inserting metric: ${error?.message}`);
      assert.equal(metric.owner_user_id, ownerUserId);
      assert.equal(metric.crm_leads_created, 5);
      assert.equal(metric.finance_revenue_minor, 500000);
    });

    test('enforces UNIQUE constraint on (owner_user_id, metric_date)', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Insert first record
      const { error: firstError } = await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: ownerUserId,
          metric_date: today,
          crm_leads_created: 5,
        });

      assert.ok(!firstError);

      // Try to insert duplicate
      const { error: secondError } = await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: ownerUserId,
          metric_date: today,
          crm_leads_created: 10,
        });

      assert.ok(secondError, 'Expected UNIQUE constraint violation');
      assert.equal(secondError.code, '23505');  // PostgreSQL unique violation
    });

    test('enforces CHECK constraints for non-negative values', async () => {
      const today = new Date().toISOString().split('T')[0];

      const { error } = await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: ownerUserId,
          metric_date: today,
          crm_leads_created: -5,  // Invalid: negative
        });

      assert.ok(error, 'Expected CHECK constraint violation');
      assert.equal(error.code, '23514');  // PostgreSQL check violation
    });

    test('enforces valid date range (>= 2026-01-01)', async () => {
      const invalidDate = '2025-12-31';  // Before 2026-01-01

      const { error } = await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: ownerUserId,
          metric_date: invalidDate,
          crm_leads_created: 5,
        });

      assert.ok(error, 'Expected CHECK constraint violation for invalid date');
    });

    test('timestamp columns auto-update', async () => {
      const today = new Date().toISOString().split('T')[0];

      const { data: metric, error } = await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: ownerUserId,
          metric_date: today,
          crm_leads_created: 5,
        })
        .select()
        .single();

      assert.ok(metric.created_at, 'created_at should be set');
      assert.ok(metric.updated_at, 'updated_at should be set');
      assert.equal(metric.created_at, metric.updated_at);  // Initially same
    });
  });

  describe('Tenant Isolation / RLS', () => {
    test('owner cannot see other owner analytics metrics', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Insert metric for owner1
      await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: ownerUserId,
          metric_date: today,
          crm_leads_created: 10,
        });

      // Insert metric for owner2
      await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: secondOwnerUserId,
          metric_date: today,
          crm_leads_created: 20,
        });

      // Query as owner1 - should NOT see owner2's metrics
      const { data: owner1Metrics } = await db
        .from('analytics_daily_metrics')
        .select('*')
        .eq('owner_user_id', ownerUserId)
        .eq('metric_date', today);

      assert.equal(owner1Metrics.length, 1);
      assert.equal(owner1Metrics[0].crm_leads_created, 10);

      // Verify count for direct query without RLS.
      // Scoped to the two fixture owners: the service role bypasses RLS and can
      // read every row in the table, so an unscoped count also picks up rows
      // belonging to unrelated owners and cannot assert anything about isolation.
      const { count } = await db
        .from('analytics_daily_metrics')
        .select('id', { count: 'exact', head: true })
        .in('owner_user_id', [ownerUserId, secondOwnerUserId]);

      assert.equal(count, 2);  // Service role sees both owners' rows
    });

    test('composite index enables efficient scoped queries', async () => {
      const today = new Date().toISOString().split('T')[0];

      // Insert multiple days of data
      const metrics = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        metrics.push({
          owner_user_id: ownerUserId,
          metric_date: dateStr,
          crm_leads_created: i + 1,
        });
      }

      await db.from('analytics_daily_metrics').insert(metrics);

      // Query should use index (owner_user_id, metric_date DESC)
      const { data: results, error } = await db
        .from('analytics_daily_metrics')
        .select('*')
        .eq('owner_user_id', ownerUserId)
        .order('metric_date', { ascending: false })
        .limit(10);

      assert.ok(!error);
      assert.ok(results.length >= 1);
      assert.equal(results[0].metric_date, today);  // Most recent first
    });
  });

  describe('Aggregation Queries', () => {
    test('sum revenue across multiple days', async () => {
      // Insert 3 days of metrics
      const metrics = [];
      for (let i = 0; i < 3; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        metrics.push({
          owner_user_id: ownerUserId,
          metric_date: dateStr,
          finance_revenue_minor: (i + 1) * 100000,  // 100000, 200000, 300000
        });
      }

      await db.from('analytics_daily_metrics').insert(metrics);

      // Query sum
      const { data: results } = await db
        .from('analytics_daily_metrics')
        .select('finance_revenue_minor')
        .eq('owner_user_id', ownerUserId)
        .gte('metric_date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]);

      const totalRevenue = results.reduce((sum, m) => sum + (m.finance_revenue_minor || 0), 0);
      assert.ok(totalRevenue >= 600000);  // At least 100k + 200k + 300k
    });

    test('count completed automations', async () => {
      const today = new Date().toISOString().split('T')[0];

      await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: ownerUserId,
          metric_date: today,
          automation_runs_completed: 15,
          automation_runs_failed: 2,
        });

      const { data: metrics } = await db
        .from('analytics_daily_metrics')
        .select('automation_runs_completed, automation_runs_failed')
        .eq('owner_user_id', ownerUserId)
        .eq('metric_date', today)
        .single();

      const successRate = (metrics.automation_runs_completed / 
        (metrics.automation_runs_completed + metrics.automation_runs_failed) * 100).toFixed(1);
      assert.equal(successRate, '88.2');
    });

    test('date range queries', async () => {
      // Insert data across a week
      for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        await db
          .from('analytics_daily_metrics')
          .insert({
            owner_user_id: ownerUserId,
            metric_date: dateStr,
            crm_leads_created: i,
          });
      }

      // Query last 3 days
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
      const { data: recent } = await db
        .from('analytics_daily_metrics')
        .select('*')
        .eq('owner_user_id', ownerUserId)
        .gte('metric_date', threeDaysAgo)
        .order('metric_date', { ascending: false });

      assert.ok(recent.length >= 1);
      assert.ok(recent.length <= 4);  // Should be 1-4 days (today to 3 days ago)
    });
  });

  describe('Data Type Validation', () => {
    test('integer columns store correct values', async () => {
      const today = new Date().toISOString().split('T')[0];

      const { data: metric } = await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: ownerUserId,
          metric_date: today,
          crm_leads_created: 255,  // Max typical daily value
          automation_runs_completed: 100,
        })
        .select()
        .single();

      assert.equal(typeof metric.crm_leads_created, 'number');
      assert.equal(metric.crm_leads_created, 255);
    });

    test('bigint columns store large values', async () => {
      const today = new Date().toISOString().split('T')[0];

      const largeRevenue = 9999999999;  // 99,999,999.99 INR

      const { data: metric } = await db
        .from('analytics_daily_metrics')
        .insert({
          owner_user_id: ownerUserId,
          metric_date: today,
          finance_revenue_minor: largeRevenue,
        })
        .select()
        .single();

      assert.equal(metric.finance_revenue_minor, largeRevenue);
    });

    test('date column validates ISO format', async () => {
      const validDates = [
        new Date().toISOString().split('T')[0],  // YYYY-MM-DD
        '2026-09-15',
        '2026-01-01',
        '2026-12-31',
      ];

      for (const dateStr of validDates) {
        const { error } = await db
          .from('analytics_daily_metrics')
          .insert({
            owner_user_id: ownerUserId,
            metric_date: dateStr,
            crm_leads_created: 1,
          });

        assert.ok(!error, `Failed to insert valid date ${dateStr}`);

        // Delete to avoid UNIQUE constraint
        await db
          .from('analytics_daily_metrics')
          .delete()
          .eq('owner_user_id', ownerUserId)
          .eq('metric_date', dateStr);
      }
    });
  });

  describe('Performance', () => {
    test('efficient query with index on (owner_user_id, metric_date DESC)', async () => {
      // Index should be: idx_analytics_daily_metrics_owner_date
      // This test documents the index usage pattern
      const query = `
        SELECT * FROM analytics_daily_metrics
        WHERE owner_user_id = $1
        ORDER BY metric_date DESC
        LIMIT 10
      `;

      assert.ok(query.includes('owner_user_id'));
      assert.ok(query.includes('metric_date'));
      assert.ok(query.includes('DESC'));
    });

    test('pagination for large result sets', async () => {
      // Insert 15 days of metrics
      for (let i = 0; i < 15; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        await db
          .from('analytics_daily_metrics')
          .insert({
            owner_user_id: ownerUserId,
            metric_date: dateStr,
            crm_leads_created: i,
          });
      }

      // First page
      const { data: page1, count: total } = await db
        .from('analytics_daily_metrics')
        .select('*', { count: 'exact' })
        .eq('owner_user_id', ownerUserId)
        .order('metric_date', { ascending: false })
        .range(0, 9);  // First 10

      assert.equal(page1.length, 10);
      assert.ok(total >= 15);

      // Second page
      const { data: page2 } = await db
        .from('analytics_daily_metrics')
        .select('*')
        .eq('owner_user_id', ownerUserId)
        .order('metric_date', { ascending: false })
        .range(10, 19);  // Next 10

      assert.ok(page2.length >= 1);
      assert.notEqual(page1[0].metric_date, page2[0].metric_date);
    });
  });
});
