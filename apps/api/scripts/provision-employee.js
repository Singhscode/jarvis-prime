import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword, isValidEmailFormat, normalizeEmail } from '../src/modules/auth/crypto.js';

const { Client } = pg;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireValue(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertProvisionTarget(connectionString, confirmation) {
  if (confirmation !== 'provision-employee') {
    throw new Error('Set EMPLOYEE_PROVISION_CONFIRM=provision-employee to continue.');
  }
  const hostname = new URL(connectionString).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
    && process.env.NODE_ENV !== 'production') {
    throw new Error('Non-local provisioning requires NODE_ENV=production.');
  }
}

export async function provisionEmployee({ connectionString, email, password, ownerUserId, fullName }) {
  if (!isValidEmailFormat(email)) throw new Error('EMPLOYEE_EMAIL must be valid.');
  if (!UUID_PATTERN.test(ownerUserId)) throw new Error('EMPLOYEE_OWNER_USER_ID must be a UUID.');
  const passwordHash = await hashPassword(password);
  const normalizedEmail = normalizeEmail(email);
  const db = new Client({ connectionString });
  await db.connect();
  try {
    await db.query('begin');
    const owner = await db.query(`select id from public.users
      where id = $1 and status = 'active' for update`, [ownerUserId]);
    if (owner.rowCount !== 1) throw new Error('The active owner user was not found.');

    const existing = await db.query(`select id, role from public.users
      where email_normalized = $1 for update`, [normalizedEmail]);
    let employeeId;
    if (existing.rowCount === 1) {
      if (existing.rows[0].role !== 'employee') {
        throw new Error('The requested email already belongs to a non-employee user.');
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

async function main() {
  const connectionString = requireValue('EMPLOYEE_PROVISION_DATABASE_URL');
  assertProvisionTarget(connectionString, process.env.EMPLOYEE_PROVISION_CONFIRM);
  const employee = await provisionEmployee({
    connectionString,
    email: requireValue('EMPLOYEE_EMAIL'),
    password: requireValue('EMPLOYEE_PASSWORD'),
    ownerUserId: requireValue('EMPLOYEE_OWNER_USER_ID'),
    fullName: process.env.EMPLOYEE_FULL_NAME,
  });
  console.log(`Employee provisioned: ${employee.email} (${employee.id})`);
}

if (process.argv[1]?.endsWith('provision-employee.js')) {
  main().catch((error) => {
    console.error(`Employee provisioning failed: ${error.message}`);
    process.exitCode = 1;
  });
}