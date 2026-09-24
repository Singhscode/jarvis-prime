import { fileURLToPath } from 'node:url';

const EXPECTED_PROJECT_REF = 'fytnwpnnvqecjmyhrzcx';

function status(value) {
  return value ? 'PASS' : 'FAIL';
}

function yesNo(value) {
  return value ? 'YES' : 'NO';
}

export function evaluateProductionTarget({
  connectionString,
  projectRef,
  dbMode = 'session-pooler',
} = {}) {
  const secretPresent =
    typeof connectionString === 'string' && connectionString.length > 0;

  let target = null;

  try {
    target = secretPresent ? new URL(connectionString) : null;
  } catch {
    target = null;
  }

  const parsed = target !== null;

  const poolerEndpoint =
    parsed && target.hostname.endsWith('.pooler.supabase.com');

  const sslmode = parsed ? target.searchParams.get('sslmode') : null;

  const scheme =
    parsed &&
    ['postgres:', 'postgresql:'].includes(target.protocol);

  const port =
    parsed &&
    (!target.port || target.port === '5432');

  const sslmodeAccepted =
    parsed &&
    (sslmode === null ||
      sslmode === 'verify-full' ||
      sslmode === 'require');

  const poolerAccepted =
    dbMode === 'session-pooler'
      ? poolerEndpoint
      : !poolerEndpoint;

  const projectRefMatch =
    projectRef === EXPECTED_PROJECT_REF;

  const checks = {
    secretPresent,
    scheme,
    host: parsed && (
      dbMode === 'session-pooler'
        ? poolerEndpoint
        : target.hostname === `db.${EXPECTED_PROJECT_REF}.supabase.co`
    ),
    port,
    sslmode: sslmodeAccepted,
    projectRef: projectRefMatch,
    poolerEndpoint,
    dbModeValid: ['direct', 'session-pooler'].includes(dbMode),
    poolerAccepted,
  };

  return Object.freeze({
    ...checks,
    overallTarget:
      checks.secretPresent &&
      checks.scheme &&
      checks.host &&
      checks.port &&
      checks.sslmode &&
      checks.projectRef &&
      checks.dbModeValid &&
      checks.poolerAccepted,
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
    `DB_MODE_VALID: ${status(result.dbModeValid)}`,
    `POOLER_ACCEPTED: ${status(result.poolerAccepted)}`,
    `OVERALL_TARGET: ${status(result.overallTarget)}`,
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = evaluateProductionTarget({
    connectionString: process.env.PHASE11_PRODUCTION_DATABASE_URL,
    projectRef: process.env.PHASE11_PRODUCTION_PROJECT_REF,
    dbMode: process.env.PHASE11_PRODUCTION_DB_MODE || 'session-pooler',
  });

  process.stdout.write(`${formatProductionTargetDiagnostic(result)}\n`);
  process.exitCode = result.overallTarget ? 0 : 1;
}
