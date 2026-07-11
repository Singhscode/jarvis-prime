// A/B Testing Engine.
// Creates, manages, and evaluates split tests for email subjects, bodies,
// and LinkedIn messages to optimize conversion rates.

import { log } from 'jarvis-logger';
import { config } from '../config.js';

// In-memory fallback for A/B test tracking
const memTests = new Map();
const memAssignments = new Map(); // prospectId:testId -> variant

/**
 * Create a new A/B test.
 * @param {object} params
 * @param {string} params.name         Test name
 * @param {string} params.clientId     Client ID
 * @param {string} params.testType     'subject' | 'body' | 'full_email' | 'linkedin_note'
 * @param {object} params.variants     { A: { subject, body }, B: { subject, body } }
 * @param {number} [params.minSample]  Min sends per variant before declaring winner
 */
export function createTest({ name, clientId, testType = 'subject', variants, minSample }) {
  const id = `ab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const test = {
    id,
    clientId,
    name,
    testType,
    status: 'running',
    variants,
    results: {},
    winner: null,
    minSample: minSample || config.abTestMinSample,
    created_at: new Date().toISOString(),
  };

  // Initialize results for each variant
  for (const key of Object.keys(variants)) {
    test.results[key] = { sent: 0, opens: 0, replies: 0, clicks: 0, meetings: 0 };
  }

  memTests.set(id, test);
  log.ok(`A/B test created: "${name}" (${id}) with variants: ${Object.keys(variants).join(', ')}`);
  return test;
}

/**
 * Deterministically assign a prospect to a test variant.
 * Uses a hash of prospect ID + test ID for consistent assignment.
 */
export function assignVariant(prospectId, testId) {
  const key = `${prospectId}:${testId}`;

  // Check if already assigned
  if (memAssignments.has(key)) {
    return memAssignments.get(key);
  }

  const test = memTests.get(testId);
  if (!test || test.status !== 'running') return null;

  const variantKeys = Object.keys(test.variants);

  // Simple deterministic hash for even distribution
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % variantKeys.length;
  const variant = variantKeys[idx];

  memAssignments.set(key, variant);
  return variant;
}

/**
 * Get the content for a prospect's assigned variant.
 */
export function getVariantContent(prospectId, testId) {
  const variant = assignVariant(prospectId, testId);
  if (!variant) return null;

  const test = memTests.get(testId);
  if (!test) return null;

  return { variant, content: test.variants[variant] };
}

/**
 * Record an event result for a variant.
 * @param {string} testId
 * @param {string} variant    'A' | 'B' etc
 * @param {string} event      'sent' | 'open' | 'reply' | 'click' | 'meeting'
 */
export function recordResult(testId, variant, event) {
  const test = memTests.get(testId);
  if (!test || !test.results[variant]) return;

  if (test.results[variant][`${event}s`] !== undefined) {
    test.results[variant][`${event}s`]++;
  } else if (test.results[variant][event] !== undefined) {
    test.results[variant][event]++;
  }

  // Check if we have enough data to determine a winner
  checkForWinner(test);
}

/**
 * Check if a test has a statistically meaningful winner.
 * Uses a simplified approach: requires min sample AND ≥20% relative improvement.
 */
function checkForWinner(test) {
  if (test.status !== 'running') return;

  const variants = Object.keys(test.results);
  const allAboveMin = variants.every((v) => test.results[v].sent >= test.minSample);
  if (!allAboveMin) return;

  // Compare reply rates
  const rates = {};
  for (const v of variants) {
    const r = test.results[v];
    rates[v] = r.sent > 0 ? r.replies / r.sent : 0;
  }

  // Find best variant
  let bestVariant = variants[0];
  let bestRate = rates[variants[0]];
  for (const v of variants.slice(1)) {
    if (rates[v] > bestRate) {
      bestVariant = v;
      bestRate = rates[v];
    }
  }

  // Require ≥20% relative improvement over worst
  const worstRate = Math.min(...Object.values(rates));
  if (worstRate > 0 && bestRate / worstRate >= 1.2) {
    test.winner = bestVariant;
    test.status = 'completed';
    log.ok(`A/B test "${test.name}" winner: Variant ${bestVariant} (${(bestRate * 100).toFixed(1)}% reply rate)`);
  }
}

/**
 * Get results for a specific test.
 */
export function getTestResults(testId) {
  const test = memTests.get(testId);
  if (!test) return null;

  const results = { ...test };
  const variants = Object.keys(test.results);
  results.rates = {};
  for (const v of variants) {
    const r = test.results[v];
    results.rates[v] = {
      openRate: r.sent > 0 ? ((r.opens / r.sent) * 100).toFixed(1) + '%' : '0%',
      replyRate: r.sent > 0 ? ((r.replies / r.sent) * 100).toFixed(1) + '%' : '0%',
      clickRate: r.sent > 0 ? ((r.clicks / r.sent) * 100).toFixed(1) + '%' : '0%',
      meetingRate: r.sent > 0 ? ((r.meetings / r.sent) * 100).toFixed(1) + '%' : '0%',
    };
  }
  return results;
}

/**
 * List all tests, optionally filtered by client.
 */
export function listTests(clientId) {
  const all = Array.from(memTests.values());
  if (clientId) return all.filter((t) => t.clientId === clientId);
  return all;
}

/**
 * Pause or resume a test.
 */
export function toggleTest(testId, status) {
  const test = memTests.get(testId);
  if (!test) return null;
  test.status = status || (test.status === 'running' ? 'paused' : 'running');
  return test;
}
