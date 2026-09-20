/**
 * Canonical migration policy registry loader.
 * 
 * This module provides centralized access to the migration ownership policy.
 * Later phases (Phase 12+) register their approved production migrations via
 * the migration-policy.json file without modifying the Phase 11 gate logic.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..', '..');

/**
 * Load the canonical migration policy.
 * 
 * @param {string} root - Repository root (default: derived from module location)
 * @returns {Promise<Object>} Parsed migration policy
 * @throws {Error} If policy file is missing or invalid
 */
export async function loadMigrationPolicy(root = defaultRoot) {
  const policyPath = path.join(root, 'database', 'migration-policy.json');
  const content = await readFile(policyPath, 'utf8');
  const policy = JSON.parse(content);
  
  // Validate structure
  if (!policy.policyVersion) {
    throw new Error('migration-policy.json missing policyVersion');
  }
  if (!policy.phases?.PHASE11?.predecessors?.versions) {
    throw new Error('migration-policy.json missing PHASE11 predecessors');
  }
  if (!policy.phases?.PHASE11?.productionRequired?.versions) {
    throw new Error('migration-policy.json missing PHASE11 productionRequired');
  }
  if (!policy.phases?.PHASE11?.retiredSentinel?.version) {
    throw new Error('migration-policy.json missing PHASE11 retiredSentinel');
  }
  if (!Array.isArray(policy.allProductionApprovedMigrations)) {
    throw new Error('migration-policy.json missing allProductionApprovedMigrations');
  }
  if (!Array.isArray(policy.stagingOnlyMigrations)) {
    throw new Error('migration-policy.json missing stagingOnlyMigrations');
  }
  
  return Object.freeze({
    policy,
    phase11Predecessors: Object.freeze(policy.phases.PHASE11.predecessors.versions),
    phase11Required: Object.freeze(policy.phases.PHASE11.productionRequired.versions),
    stagingOnlySentinelVersion: policy.phases.PHASE11.retiredSentinel.version,
    stagingOnlySentinelName: policy.phases.PHASE11.retiredSentinel.sentinelName,
    allApprovedMigrations: Object.freeze(new Set(policy.allProductionApprovedMigrations)),
    stagingOnlyMigrations: Object.freeze(new Set(policy.stagingOnlyMigrations)),
    historicalApprovedVersions: Object.freeze(buildHistoricalApprovedSet(policy)),
    laterPhasesByVersion: buildLaterPhaseIndex(policy),
  });
}

/**
 * Build the set of HISTORICAL_APPROVED versions from the HISTORICAL phase entry.
 */
function buildHistoricalApprovedSet(policy) {
  const entries = policy.phases?.HISTORICAL?.productionApproved?.entries || [];
  return new Set(entries.map((e) => e.version));
}

/**
 * Build a map of version → phase name for non-Phase 11 migrations.
 * Helps identify which later phase a migration belongs to.
 */
function buildLaterPhaseIndex(policy) {
  const index = new Map();
  const laterPhases = policy.phases.LATER_PHASES?.registeredPhases || {};
  
  for (const [phaseName, phaseData] of Object.entries(laterPhases)) {
    if (Array.isArray(phaseData.productionApproved)) {
      for (const version of phaseData.productionApproved) {
        if (!index.has(version)) {
          index.set(version, phaseName);
        }
      }
    }
  }
  
  return Object.freeze(index);
}

/**
 * Classify a single migration version according to the policy.
 * 
 * @param {string} version - Migration version (e.g., "20260810000035")
 * @param {Object} policyData - Loaded policy data from loadMigrationPolicy()
 * @returns {string} Classification: "PHASE11_REQUIRED" | "PHASE11_PREDECESSOR" | "HISTORICAL_APPROVED" | "LATER_PHASE_APPROVED" | "STAGING_ONLY" | "UNKNOWN"
 */
export function classifyMigration(version, policyData) {
  if (policyData.phase11Predecessors.includes(version)) {
    return 'PHASE11_PREDECESSOR';
  }
  if (policyData.phase11Required.includes(version)) {
    return 'PHASE11_REQUIRED';
  }
  if (policyData.stagingOnlyMigrations.has(version)) {
    return 'STAGING_ONLY';
  }
  // Historical baseline: explicitly registered pre-Phase-11 production migrations.
  // Check before allApprovedMigrations so these get their own classification.
  if (policyData.historicalApprovedVersions.has(version)) {
    return 'HISTORICAL_APPROVED';
  }
  if (policyData.allApprovedMigrations.has(version)) {
    return 'LATER_PHASE_APPROVED';
  }
  return 'UNKNOWN';
}

/**
 * Get the phase name for a later-phase migration.
 * Returns null if not a later-phase migration.
 */
export function getLaterPhaseName(version, policyData) {
  return policyData.laterPhasesByVersion.get(version) || null;
}
