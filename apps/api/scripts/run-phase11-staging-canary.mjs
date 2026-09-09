#!/usr/bin/env node
import { createStagingCanary, buildStagingCanaryRequest, resolveStagingCanaryRuntimeConfig } from '../src/modules/automation/automation.staging-canary.service.js';

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--execute' || key === '--dry-run') { values[key.slice(2)] = true; continue; }
    if (!['--owner-id', '--actor-id', '--source-event-id', '--due-at'].includes(key) || values[key.slice(2)] !== undefined) throw new Error('AUTOMATION_CANARY_INVALID');
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('AUTOMATION_CANARY_INVALID');
    values[key.slice(2)] = value; index += 1;
  }
  if (values.execute && values['dry-run']) throw new Error('AUTOMATION_CANARY_INVALID');
  return buildStagingCanaryRequest({ ownerUserId: values['owner-id'], actorUserId: values['actor-id'], sourceEventId: values['source-event-id'], dueAt: values['due-at'] });
}

const request = parse(process.argv.slice(2));
if (!process.argv.includes('--execute')) {
  console.log(JSON.stringify({ mode: 'dry-run', request }, null, 2));
} else {
  if (process.env.PHASE11_STAGING_CANARY_EXECUTE !== '1') throw new Error('AUTOMATION_CANARY_EXECUTE_NOT_CONFIRMED');
  const runtimeConfig = resolveStagingCanaryRuntimeConfig();
  console.log(JSON.stringify({ runtimeTarget: runtimeConfig.runtimeTarget, projectReferenceValidation: 'pass' }));
  const canary = createStagingCanary({ runtimeConfig });
  const admitted = await canary.admit(request);
  const lineage = await canary.awaitCompletion({ ownerUserId: request.ownerUserId, runId: admitted.run_id, dueAt: request.dueAt });
  console.log(JSON.stringify({ mode: 'executed', admitted, lineage }, null, 2));
}
