import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { hashPassword, isValidEmailFormat, normalizeEmail } from '../src/modules/auth/crypto.js';

const { Client } = pg;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cliError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function localDatabaseUrl() {
  try {
    const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
    const workspaceRoot = path.resolve(scriptDirectory, '../../..');
    const status = execFileSync('supabase', ['--workdir', 'database', 'status', '-o', 'env'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const databaseUrl = status.match(/^DB_URL="([^"]+)"$/m)?.[1];
    if (!databaseUrl) throw cliError('DATABASE_NOT_CONFIGURED');
    return databaseUrl;
  } catch {
    throw cliError('DATABASE_NOT_CONFIGURED');
  }
}

function connectionString() {
  const configured = process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return localDatabaseUrl();
  throw cliError('DATABASE_NOT_CONFIGURED');
}

function assertProvisionTarget(databaseUrl) {
  const hostname = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
    && process.env.NODE_ENV !== 'production') {
    throw cliError('NONLOCAL_DATABASE_REQUIRES_PRODUCTION');
  }
}

export async function findActiveCrmOwner(databaseUrl) {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const { rows } = await db.query(`select id from public.users
      where role = 'client' and status = 'active'
      order by email
      limit 2`);
    if (rows.length === 0) throw cliError('NO_ACTIVE_OWNER');
    if (rows.length > 1) throw cliError('MULTIPLE_ACTIVE_OWNERS');
    return rows[0].id;
  } finally {
    await db.end();
  }
}

export async function provisionEmployee({
  connectionString: databaseUrl,
  email,
  password,
  ownerUserId,
  fullName,
  rejectExistingEmployee = false,
}) {
  if (!isValidEmailFormat(email)) throw cliError('INVALID_EMAIL');
  if (!UUID_PATTERN.test(ownerUserId)) throw cliError('OWNER_NOT_FOUND');
  const passwordHash = await hashPassword(password);
  const normalizedEmail = normalizeEmail(email);
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    await db.query('begin');
    const owner = await db.query(`select id from public.users
      where id = $1 and status = 'active' for update`, [ownerUserId]);
    if (owner.rowCount !== 1) throw cliError('NO_ACTIVE_OWNER');

    const existing = await db.query(`select id, role from public.users
      where email_normalized = $1 for update`, [normalizedEmail]);
    let employeeId;
    if (existing.rowCount === 1) {
      if (rejectExistingEmployee || existing.rows[0].role !== 'employee') {
        throw cliError('EMAIL_ALREADY_EXISTS');
      }
      employeeId = existing.rows[0].id;
      await db.query(`update public.users set full_name = $1, password_hash = $2,
        status = 'active', email_verified_at = now(), failed_login_attempts = 0,
        last_failed_login_at = null, account_locked_until = null,
        portal_owner_user_id = $3, updated_at = now() where id = $4`,
      [fullName || null, passwordHash, ownerUserId, employeeId]);
    } else {
      employeeId = randomUUID();
      await db.query(`insert into public.users
        (id, email, email_normalized, full_name, password_hash, status, role,
         email_verified_at, failed_login_attempts, portal_owner_user_id)
        values ($1, $2, $3, $4, $5, 'active', 'employee', now(), 0, $6)`,
      [employeeId, email, normalizedEmail, fullName || null, passwordHash, ownerUserId]);
    }

    await db.query(`insert into public.audit_logs
      (user_id, event_type, action, resource_type, resource_id, success, details)
      values ($1, 'employee.provisioned', 'create', 'user', $1, true,
        jsonb_build_object('portal_owner_user_id', $2::uuid))`, [employeeId, ownerUserId]);
    await db.query('commit');
    return { id: employeeId, email: normalizedEmail };
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

function messageFor(error) {
  if (error.code === 'EMAIL_ALREADY_EXISTS') return '❌ Email already exists.';
  if (error.code === 'NO_ACTIVE_OWNER') return '❌ No active owner account found.';
  if (error.code === 'MULTIPLE_ACTIVE_OWNERS') return '❌ Multiple active owner accounts found.';
  if (error.code === 'INVALID_EMAIL') return '❌ Enter a valid employee email.';
  if (error.code === 'DATABASE_NOT_CONFIGURED') return '❌ Database connection is not configured.';
  if (error.message?.startsWith('Password must be')) return '❌ Password too weak.';
  return '❌ Employee was not created.';
}

function createPrompts() {
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
    const answer = await prompts.question('');
    mutedOutput.muted = false;
    output.write('\n');
    return answer;
  };
  return { prompts, hiddenQuestion };
}

async function main() {
  const { prompts, hiddenQuestion } = createPrompts();
  try {
    const fullName = (await prompts.question('Employee Full Name: ')).trim();
    const email = (await prompts.question('Employee Email: ')).trim();
    const password = await hiddenQuestion('Temporary Password: ');
    const confirmationPassword = await hiddenQuestion('Confirm Password: ');
    const confirmed = await prompts.question('Create employee? (Y/N) ');

    if (confirmed.trim().toUpperCase() !== 'Y') return;
    if (!fullName) throw cliError('NAME_REQUIRED');
    if (password !== confirmationPassword) throw cliError('PASSWORD_MISMATCH');

    const databaseUrl = connectionString();
    assertProvisionTarget(databaseUrl);
    const ownerUserId = await findActiveCrmOwner(databaseUrl);
    const employee = await provisionEmployee({
      connectionString: databaseUrl,
      email,
      password,
      ownerUserId,
      fullName,
      rejectExistingEmployee: true,
    });

    console.log(`\n====================================
Employee Created Successfully
====================================
Name: ${fullName}
Email: ${employee.email}
Role: Employee
Status: Active
Employee Portal: http://localhost:3000/employee`);
  } catch (error) {
    if (error.code === 'NAME_REQUIRED') console.error('❌ Employee full name is required.');
    else if (error.code === 'PASSWORD_MISMATCH') console.error('❌ Passwords do not match.');
    else console.error(messageFor(error));
    process.exitCode = 1;
  } finally {
    prompts.close();
  }
}

if (process.argv[1]?.endsWith('provision-employee.js')) {
  main();
}
