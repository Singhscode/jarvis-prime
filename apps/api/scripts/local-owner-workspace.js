import pg from 'pg';
import { config } from '../src/config/config.js';
import { hashPassword, isValidEmailFormat, normalizeEmail } from '../src/modules/auth/crypto.js';

const { Client } = pg;
const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const fixture = { company: '81000000-0000-4000-8000-000000000001', contact: '82000000-0000-4000-8000-000000000001', client: '83000000-0000-4000-8000-000000000001', project: '84000000-0000-4000-8000-000000000001', task: '85000000-0000-4000-8000-000000000001', employee: '86000000-0000-4000-8000-000000000001' };

export function localSettings(env = process.env, confirmation) {
  if (env.NODE_ENV !== 'development' || env.DRY_RUN !== 'true' || env.SCHEDULER_ENABLED !== 'false') throw new Error('Local Owner Workspace scripts require NODE_ENV=development, DRY_RUN=true, and SCHEDULER_ENABLED=false.');
  if (env[confirmation] !== '1') throw new Error(`Set ${confirmation}=1 to confirm a disposable local operation.`);
  if (!env.LOCAL_OWNER_DATABASE_URL) throw new Error('LOCAL_OWNER_DATABASE_URL is required.');
  let target; try { target = new URL(env.LOCAL_OWNER_DATABASE_URL); } catch { throw new Error('LOCAL_OWNER_DATABASE_URL must be a PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !localHosts.has(target.hostname)) throw new Error('Local Owner Workspace scripts require a loopback PostgreSQL URL.');
  const email = normalizeEmail(env.LOCAL_OWNER_EMAIL); const password = env.LOCAL_OWNER_PASSWORD || '';
  if (!isValidEmailFormat(email) || !email.endsWith('@jarvis.test') || password.length < 12 || password.length > 128) throw new Error('LOCAL_OWNER_EMAIL must use @jarvis.test and LOCAL_OWNER_PASSWORD must be 12-128 characters.');
  return { connectionString: env.LOCAL_OWNER_DATABASE_URL, email, password, name: (env.LOCAL_OWNER_NAME || 'Local Owner').trim() || 'Local Owner', employeePassword: env.LOCAL_EMPLOYEE_PASSWORD || password };
}

async function withDatabase(settings, work) { const database = new Client({ connectionString: settings.connectionString }); await database.connect(); try { return await work(database); } finally { await database.end(); } }

export async function bootstrapLocalOwner(settings) {
  const passwordHash = await hashPassword(settings.password);
  return withDatabase(settings, async (database) => { await database.query('begin'); try {
    const { rows: existingOwners } = await database.query(`select u.id, u.email_normalized from public.users u join public.owner_workspace_entitlements e on e.user_id=u.id and e.revoked_at is null where u.role='client' and u.status='active' for update`);
    if (existingOwners.some((owner) => owner.email_normalized !== settings.email)) throw new Error('A different local Owner Workspace owner already exists; reset only the disposable local database before replacing it.');
    const { rows: [owner] } = await database.query(`insert into public.users (email,email_normalized,full_name,password_hash,status,role,email_verified_at,failed_login_attempts,last_failed_login_at,account_locked_until,created_at,updated_at) values ($1,$1,$2,$3,'active','client',now(),0,null,null,now(),now()) on conflict (email_normalized) do update set email=excluded.email,full_name=excluded.full_name,password_hash=excluded.password_hash,status='active',role='client',email_verified_at=now(),failed_login_attempts=0,last_failed_login_at=null,account_locked_until=null,updated_at=now() returning id`, [settings.email, settings.name, passwordHash]);
    await database.query(`insert into public.owner_workspace_entitlements (user_id,source,granted_at,revoked_at) values ($1,'initial_owner_bootstrap',now(),null) on conflict (user_id) do update set source='initial_owner_bootstrap',granted_at=excluded.granted_at,revoked_at=null`, [owner.id]);
    await database.query(`insert into public.audit_logs (user_id,event_type,action,resource_type,resource_id,success,details) select $1,'local.owner_bootstrapped','create','user',$1,true,'{"source":"local-owner-workspace","version":1}'::jsonb where not exists (select 1 from public.audit_logs where user_id=$1 and event_type='local.owner_bootstrapped' and success=true)`, [owner.id]);
    await database.query('commit'); return owner.id;
  } catch (error) { await database.query('rollback').catch(() => {}); throw error; } });
}

export async function seedLocalOwnerWorkspace(settings) {
  const employeeHash = await hashPassword(settings.employeePassword);
  return withDatabase(settings, async (database) => { await database.query('begin'); try {
    const { rows: [owner] } = await database.query(`select u.id from public.users u join public.owner_workspace_entitlements e on e.user_id=u.id and e.revoked_at is null where u.email_normalized=$1 and u.role='client' and u.status='active' for update`, [settings.email]);
    if (!owner) throw new Error('Create the local Owner first.');
    await database.query(`insert into public.users (id,email,email_normalized,full_name,password_hash,status,role,email_verified_at,failed_login_attempts,portal_owner_user_id) values ($1,'seeded-employee@jarvis.test','seeded-employee@jarvis.test','Seeded Employee',$2,'active','employee',now(),0,$3) on conflict (id) do update set password_hash=excluded.password_hash,status='active',role='employee',portal_owner_user_id=excluded.portal_owner_user_id`, [fixture.employee, employeeHash, owner.id]);
    await database.query(`insert into public.companies (id,owner_user_id,name) values ($1,$2,'Local Verification Company') on conflict (id) do update set owner_user_id=excluded.owner_user_id,name=excluded.name`, [fixture.company, owner.id]);
    await database.query(`insert into public.contacts (id,owner_user_id,company_id,name,email,title) values ($1,$2,$3,'Local Verification Contact','seed-contact@jarvis.test','Operations') on conflict (id) do update set owner_user_id=excluded.owner_user_id,company_id=excluded.company_id,name=excluded.name,email=excluded.email,title=excluded.title`, [fixture.contact, owner.id, fixture.company]);
    await database.query(`insert into public.crm_leads (owner_user_id,contact_id,client_id) values ($1,$2,null) on conflict (owner_user_id,contact_id) do update set client_id=null`, [owner.id, fixture.contact]);
    await database.query(`insert into public.crm_clients (id,owner_user_id,name) values ($1,$2,'Seeded Local Client') on conflict (id) do update set owner_user_id=excluded.owner_user_id,name=excluded.name`, [fixture.client, owner.id]);
    await database.query(`insert into public.crm_projects (id,owner_user_id,client_id,name) values ($1,$2,$3,'Seeded Local Project') on conflict (id) do update set owner_user_id=excluded.owner_user_id,client_id=excluded.client_id,name=excluded.name`, [fixture.project, owner.id, fixture.client]);
    await database.query(`insert into public.crm_tasks (id,owner_user_id,project_id,name,completed,assigned_user_id) values ($1,$2,$3,'Seeded Local Task',false,$4) on conflict (id) do update set owner_user_id=excluded.owner_user_id,project_id=excluded.project_id,name=excluded.name,completed=false,assigned_user_id=excluded.assigned_user_id`, [fixture.task, owner.id, fixture.project, fixture.employee]);
    await database.query('commit'); return owner.id;
  } catch (error) { await database.query('rollback').catch(() => {}); throw error; } });
}

async function main() { const mode = process.argv[2]; const confirmation = mode === 'bootstrap' ? 'JARVIS_LOCAL_OWNER_BOOTSTRAP' : mode === 'seed' ? 'JARVIS_LOCAL_OWNER_SEED' : null; if (!confirmation) throw new Error('Usage: local-owner-workspace.js <bootstrap|seed>'); const settings = localSettings(process.env, confirmation); const ownerId = mode === 'bootstrap' ? await bootstrapLocalOwner(settings) : await seedLocalOwnerWorkspace(settings); console.log(`${mode === 'bootstrap' ? 'Local Owner' : 'Local Owner Workspace fixtures'} ready: ${ownerId}`); }
if (process.argv[1]?.endsWith('local-owner-workspace.js')) main().catch((error) => { console.error(`Local Owner Workspace setup failed: ${error.message}`); process.exitCode = 1; });
