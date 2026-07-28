import { X509Certificate } from 'node:crypto';
import { accessSync, constants as fsConstants, readFileSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Writable } from 'node:stream';
import { normalizeEmail } from '../src/modules/auth/crypto.js';
import {
  OwnerBootstrapError,
  OwnerBootstrapService,
  ProjectMismatchError,
  ValidationError,
} from '../src/modules/auth/owner-bootstrap.service.js';

export const PRODUCTION_PROJECT_REF = 'fytnwpnnvqecjmyhrzcx';
export const SUPABASE_ROOT_2021_FINGERPRINT256 =
  '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';
export const MAX_PRODUCTION_DATABASE_CA_FILE_BYTES = 64 * 1024;

const PEM_CERTIFICATE = /^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----$/;

export function loadProductionDatabaseCa(
  caPath,
  expectedFingerprint = SUPABASE_ROOT_2021_FINGERPRINT256
) {
  if (typeof caPath !== 'string' || !caPath || !isAbsolute(caPath)) {
    throw new ValidationError('VALIDATION_DATABASE_CA_PATH');
  }

  let metadata;
  try {
    metadata = statSync(caPath);
    accessSync(caPath, fsConstants.R_OK);
  } catch {
    throw new ValidationError('VALIDATION_DATABASE_CA_PATH');
  }
  if (!metadata.isFile() || metadata.size <= 0
    || metadata.size >= MAX_PRODUCTION_DATABASE_CA_FILE_BYTES) {
    throw new ValidationError('VALIDATION_DATABASE_CA_FILE');
  }

  let pem;
  try {
    pem = readFileSync(caPath, 'utf8');
  } catch {
    throw new ValidationError('VALIDATION_DATABASE_CA_FILE');
  }
  const normalizedPem = pem.trim();
  if (!PEM_CERTIFICATE.test(normalizedPem)) {
    throw new ValidationError('VALIDATION_DATABASE_CA_FILE');
  }

  let certificate;
  try {
    certificate = new X509Certificate(normalizedPem);
  } catch {
    throw new ValidationError('VALIDATION_DATABASE_CA_FILE');
  }
  if (!certificate.ca || certificate.fingerprint256 !== expectedFingerprint) {
    throw new ValidationError('VALIDATION_DATABASE_CA_FILE');
  }
  return `${normalizedPem}\n`;
}

export function validateBootstrapEnvironment(env, { loadCa = loadProductionDatabaseCa } = {}) {
  if (env.NODE_ENV !== 'production' || !env.PRODUCTION_DATABASE_URL) {
    throw new ProjectMismatchError();
  }
  let target;
  try {
    target = new URL(env.PRODUCTION_DATABASE_URL);
  } catch {
    throw new ProjectMismatchError();
  }
  const allowedSearch = target.search === '' || target.search === '?sslmode=require';
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || target.pathname !== '/postgres' || target.port !== '5432'
    || !target.username || !target.password || !allowedSearch || target.hash) {
    throw new ProjectMismatchError();
  }
  let username;
  let password;
  try {
    username = decodeURIComponent(target.username);
    password = decodeURIComponent(target.password);
  } catch {
    throw new ProjectMismatchError();
  }
  if (!username || !password) throw new ProjectMismatchError();

  const poolerRef = username.startsWith('postgres.') ? username.slice('postgres.'.length) : null;
  const directRef = target.hostname.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] || null;
  const isPoolerHost = /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(target.hostname);
  const validPooler = isPoolerHost && poolerRef === PRODUCTION_PROJECT_REF;
  const validDirect = Boolean(directRef) && username === 'postgres'
    && directRef === PRODUCTION_PROJECT_REF;
  if (!validPooler && !validDirect) throw new ProjectMismatchError();

  return {
    host: target.hostname,
    port: 5432,
    database: 'postgres',
    user: username,
    password,
    ssl: { ca: loadCa(env.PRODUCTION_DATABASE_CA_PATH), rejectUnauthorized: true },
    application_name: 'jarvis-prime-owner-bootstrap',
  };
}

export function createPrompts() {
  if (!input.isTTY || !output.isTTY) throw new ValidationError('VALIDATION_TTY');
  const mutedOutput = new Writable({
    write(chunk, encoding, callback) {
      if (!mutedOutput.muted) output.write(chunk, encoding);
      callback();
    },
  });
  mutedOutput.muted = false;
  const prompts = createInterface({ input, output: mutedOutput, terminal: true });
  const hiddenQuestion = async (label) => {
    output.write(label);
    mutedOutput.muted = true;
    try {
      return await prompts.question('');
    } finally {
      mutedOutput.muted = false;
      output.write('\n');
    }
  };
  return { question: (label) => prompts.question(label), hiddenQuestion, close: () => prompts.close() };
}
export async function runOwnerBootstrapCli({
  env = process.env,
  prompts,
  validateEnvironment = validateBootstrapEnvironment,
  serviceFactory = (connectionConfig) => new OwnerBootstrapService({ connectionConfig }),
  writeOutput = (line) => console.log(line),
  writeError = (line) => console.error(line),
}) {
  try {
    const connectionConfig = validateEnvironment(env);
    const fullName = (await prompts.question('Owner Full Name: ')).trim();
    const email = (await prompts.question('Owner Email: ')).trim();
    const password = await prompts.hiddenQuestion('Owner Password: ');
    const confirmationPassword = await prompts.hiddenQuestion('Confirm Password: ');
    if (password !== confirmationPassword) {
      throw new ValidationError('VALIDATION_PASSWORD_CONFIRMATION');
    }

    const normalizedEmail = normalizeEmail(email);
    const expectedConfirmation = `CREATE FIRST OWNER ${normalizedEmail} IN ${PRODUCTION_PROJECT_REF}`;
    const confirmation = await prompts.question(`Type "${expectedConfirmation}" to continue: `);
    if (confirmation.trim() !== expectedConfirmation) {
      throw new ValidationError('VALIDATION_CONFIRMATION');
    }

    const result = await serviceFactory(connectionConfig).bootstrap({ fullName, email, password });
    writeOutput('OWNER_BOOTSTRAP=PASS');
    writeOutput(`OWNER_ID=${result.ownerId}`);
    writeOutput(`AUDIT_ID=${result.auditId}`);
    return 0;
  } catch (error) {
    const code = error instanceof OwnerBootstrapError ? error.code : 'TRANSACTION_FAILED';
    const stage = ['CONNECT', 'BEGIN', 'SET_LOCK_TIMEOUT', 'SET_STATEMENT_TIMEOUT',
      'ADVISORY_LOCK', 'LOCK_USERS', 'LOCK_CLIENT_PORTAL_MEMBERSHIPS',
      'CHECK_EXISTING_OWNER', 'CHECK_EMAIL', 'INSERT_OWNER', 'INSERT_AUDIT',
      'VERIFY_OWNER', 'COMMIT', 'POST_COMMIT_RECONCILIATION', 'VALIDATION']
      .includes(error?.failedStage)
      ? error.failedStage
      : 'VALIDATION';
    writeError('OWNER_BOOTSTRAP=FAIL');
    writeError(`FAILED_STAGE=${stage}`);
    writeError(`ERROR_CODE=${code}`);
    return 1;
  }
}

async function main() {
  let prompts;
  try {
    prompts = createPrompts();
    process.exitCode = await runOwnerBootstrapCli({ prompts });
  } catch (error) {
    const code = error instanceof OwnerBootstrapError ? error.code : 'CLI_FAILED';
    console.error('OWNER_BOOTSTRAP=FAIL');
    console.error('FAILED_STAGE=VALIDATION');
    console.error(`ERROR_CODE=${code}`);
    process.exitCode = 1;
  } finally {
    prompts?.close();
  }
}

if (process.argv[1]?.endsWith('bootstrap-owner.js')) {
  void main();
}
