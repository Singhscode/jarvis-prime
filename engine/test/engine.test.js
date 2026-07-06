// Unit tests for the pure logic pieces (no network, no DB).
// Run with: npm test   (uses Node's built-in test runner)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreProspect } from '../src/scoring/icp-scorer.js';
import { classifyReply } from '../src/agents/inbound-agent.js';

const client = {
  name: 'Demo Agency',
  icp_titles: ['Founder', 'Head of Sales'],
  icp_industries: ['Marketing'],
  icp_locations: ['India'],
  icp_keywords: ['agency', 'outbound', 'b2b'],
};

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

test('classifyReply detects intents', () => {
  assert.equal(classifyReply('Please unsubscribe me'), 'unsubscribe');
  assert.equal(classifyReply('Out of office until Monday'), 'auto_reply');
  assert.equal(classifyReply('Not interested, thanks'), 'negative');
  assert.equal(classifyReply("Sure, let's talk — send a calendar link"), 'positive');
  assert.equal(classifyReply('What exactly do you do?'), 'question');
});
