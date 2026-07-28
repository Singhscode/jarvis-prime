import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localSettings } from '../scripts/local-owner-workspace.js';

const base = { NODE_ENV: 'development', DRY_RUN: 'true', SCHEDULER_ENABLED: 'false', JARVIS_LOCAL_OWNER_BOOTSTRAP: '1', LOCAL_OWNER_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', LOCAL_OWNER_EMAIL: 'local-owner@jarvis.test', LOCAL_OWNER_PASSWORD: 'LocalOwner!2026' };

test('local Owner Workspace setup accepts only explicit disposable loopback configuration', () => {
  const settings = localSettings(base, 'JARVIS_LOCAL_OWNER_BOOTSTRAP');
  assert.equal(settings.email, 'local-owner@jarvis.test');
  assert.throws(() => localSettings({ ...base, LOCAL_OWNER_DATABASE_URL: 'postgresql://postgres:password@db.example.test/postgres' }, 'JARVIS_LOCAL_OWNER_BOOTSTRAP'), /loopback/);
  assert.throws(() => localSettings({ ...base, LOCAL_OWNER_EMAIL: 'owner@example.com' }, 'JARVIS_LOCAL_OWNER_BOOTSTRAP'), /@jarvis\.test/);
  assert.throws(() => localSettings({ ...base, DRY_RUN: 'false' }, 'JARVIS_LOCAL_OWNER_BOOTSTRAP'), /DRY_RUN=true/);
  assert.throws(() => localSettings({ ...base, JARVIS_LOCAL_OWNER_BOOTSTRAP: undefined }, 'JARVIS_LOCAL_OWNER_BOOTSTRAP'), /confirm/);
});
