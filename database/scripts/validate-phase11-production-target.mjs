import { fileURLToPath } from 'node:url';

const EXPECTED_PROJECT_REF = 'fytnwpnnvqecjmyhrzcx';
const EXPECTED_HOST = `db.${EXPECTED_PROJECT_REF}.supabase.co`;

function status(value) {
  return value ? 'PASS' : 'FAIL';
}

function yesNo(value) {
  return value ? 'YES' : 'NO';
}

/**
 * Parses a protected connection-string value locally and returns only fixed,
 * non-sensitive diagnostic statuses. It never opens a database client or emits
 * any parsed URL component.
 */
export function evaluateProductionTarget({ connectionString, projectRef } = {}) {
  const secretPresent = typeof connectionString === 'string' && connectionString.length > 0;
  let target;
  try {
    target = secretPresent ? new URL(connectionString) : null;
  } catch {
    target = null;
  }

  const parsed = target !== null;
  const poolerEndpoint = parsed && target.hostname.endsWith('.pooler.supabase.com');
  const checks = {
    secretPresent,
    scheme: parsed && target.protocol === 'postgresql:',
    host: parsed && target.hostname === EXPECTED_HOST,
    port: parsed && (!target.port || target.port === '5432'),
    sslmode: parsed && target.searchParams.get('sslmode') === 'verify-full',
    projectRef: projectRef === EXPECTED_PROJECT_REF,
    poolerEndpoint,
  };

  return Object.freeze({
    ...checks,
    overallTarget: checks.secretPresent
      && checks.scheme
      && checks.host
      && checks.port
      && checks.sslmode
      && checks.projectRef
      && !checks.poolerEndpoint,
  });
}

export function formatProductionTargetDiagnostic(result) {
  return [
    `SECRET_PRESENT: ${yesNo(result.secretPresent)}`,
    `SCHEME: ${status(result.scheme)}`,
    `HOST: ${status(result.host)}`,
    `PORT: ${status(result.port)}`,
    `SSLMODE: ${status(result.sslmode)}`,
    `PROJECT_REF: ${status(result.projectRef)}`,
    `POOLER_ENDPOINT: ${yesNo(result.poolerEndpoint)}`,
    `OVERALL_TARGET: ${status(result.overallTarget)}`,
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = evaluateProductionTarget({
    connectionString: process.env.PHASE11_PRODUCTION_DATABASE_URL,
    projectRef: process.env.PHASE11_PRODUCTION_PROJECT_REF,
  });
  process.stdout.write(`${formatProductionTargetDiagnostic(result)}\n`);
  process.exitCode = result.overallTarget ? 0 : 1;
}
