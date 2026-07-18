import pg from 'pg';
import { config } from '../src/config/config.js';
import { hashPassword, normalizeEmail } from '../src/modules/auth/crypto.js';

const { Client } = pg;

const EMPLOYEE_EMAIL = 'employee@jarvis.test';
const OWNER_EMAIL = 'portal-owner@jarvis.test';
const LOGIN_URL = 'http://localhost:3000/employee';
const ids = {
  owner: '91000000-0000-4000-8000-000000000001',
  employee: '91000000-0000-4000-8000-000000000002',
  client: '92000000-0000-4000-8000-000000000001',
  contact: '93000000-0000-4000-8000-000000000001',
  lead: '94000000-0000-4000-8000-000000000001',
  project: '95000000-0000-4000-8000-000000000001',
  task: '96000000-0000-4000-8000-000000000001',
};

function assertLocalDevelopment(connectionString) {
  if (config.env !== 'development') {
    throw new Error('Employee Portal seed is restricted to NODE_ENV=development.');
  }
  if (!connectionString) throw new Error('EMPLOYEE_PORTAL_SEED_DATABASE_URL is required.');
  const hostname = new URL(connectionString).hostname;
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
    throw new Error('Employee Portal seed requires a loopback PostgreSQL URL.');
  }
}

async function seed() {
  const password = process.env.EMPLOYEE_PORTAL_SEED_PASSWORD;
  const connectionString = process.env.EMPLOYEE_PORTAL_SEED_DATABASE_URL;
  assertLocalDevelopment(connectionString);
  if (!password) {
    throw new Error('EMPLOYEE_PORTAL_SEED_PASSWORD is required and must be 12-128 characters.');
  }

  const passwordHash = await hashPassword(password);
  const db = new Client({ connectionString });
  await db.connect();
  try {
    await db.query('begin');
    await db.query(`insert into public.users
      (id, email, email_normalized, full_name, status, role, email_verified_at)
      values ($1, $2, $3, 'Development CRM Owner', 'active', 'client', $4)
      on conflict (id) do update set email = excluded.email,
        email_normalized = excluded.email_normalized, full_name = excluded.full_name,
        status = excluded.status, role = excluded.role,
        email_verified_at = excluded.email_verified_at`,
    [ids.owner, OWNER_EMAIL, normalizeEmail(OWNER_EMAIL), '2026-01-01T00:00:00.000Z']);
    await db.query(`insert into public.users
      (id, email, email_normalized, full_name, password_hash, status, role,
       email_verified_at, failed_login_attempts, last_failed_login_at,
       account_locked_until, portal_owner_user_id)
      values ($1, $2, $3, 'Development Employee', $4, 'active', 'employee',
        $5, 0, null, null, $6)
      on conflict (id) do update set email = excluded.email,
        email_normalized = excluded.email_normalized, full_name = excluded.full_name,
        password_hash = excluded.password_hash, status = excluded.status,
        role = excluded.role, email_verified_at = excluded.email_verified_at,
        failed_login_attempts = 0, last_failed_login_at = null,
        account_locked_until = null, portal_owner_user_id = excluded.portal_owner_user_id`,
    [ids.employee, EMPLOYEE_EMAIL, normalizeEmail(EMPLOYEE_EMAIL), passwordHash,
      '2026-01-01T00:00:00.000Z', ids.owner]);
    await db.query(`insert into public.crm_clients (id, owner_user_id, name)
      values ($1, $2, 'Development Client')
      on conflict (id) do update set owner_user_id = excluded.owner_user_id,
        name = excluded.name`, [ids.client, ids.owner]);
    await db.query(`insert into public.contacts
      (id, owner_user_id, name, email, title)
      values ($1, $2, 'Development Lead', 'development-lead@jarvis.test', 'Operations Lead')
      on conflict (id) do update set owner_user_id = excluded.owner_user_id,
        name = excluded.name, email = excluded.email, title = excluded.title`,
    [ids.contact, ids.owner]);
    await db.query(`insert into public.crm_leads
      (id, owner_user_id, contact_id, client_id) values ($1, $2, $3, null)
      on conflict (id) do update set owner_user_id = excluded.owner_user_id,
        contact_id = excluded.contact_id, client_id = null`,
    [ids.lead, ids.owner, ids.contact]);
    await db.query(`insert into public.crm_projects
      (id, owner_user_id, client_id, name) values ($1, $2, $3, 'Employee Portal Demo')
      on conflict (id) do update set owner_user_id = excluded.owner_user_id,
        client_id = excluded.client_id, name = excluded.name`,
    [ids.project, ids.owner, ids.client]);
    await db.query(`insert into public.crm_tasks
      (id, owner_user_id, project_id, name, completed, assigned_user_id)
      values ($1, $2, $3, 'Review the Employee Portal demo task', false, $4)
      on conflict (id) do update set owner_user_id = excluded.owner_user_id,
        project_id = excluded.project_id, name = excluded.name,
        completed = false, assigned_user_id = excluded.assigned_user_id`,
    [ids.task, ids.owner, ids.project, ids.employee]);
    await db.query('commit');
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }

  console.log('Employee Portal development seed completed.');
  console.log(`Employee email: ${EMPLOYEE_EMAIL}`);
  console.log(`Employee password: ${password}`);
  console.log(`Owner email: ${OWNER_EMAIL}`);
  console.log(`Login URL: ${LOGIN_URL}`);
}

seed().catch((error) => {
  console.error(`Employee Portal seed failed: ${error.message}`);
  process.exitCode = 1;
});