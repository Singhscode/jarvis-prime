// Migration runner — applies SQL migrations in order.
//
// Usage:
//   node scripts/migrate.js              Apply all pending migrations
//   node scripts/migrate.js --status     Show migration status
//
// Migrations are SQL files in engine/sql/migrations/ named like:
//   001_initial_schema.sql
//   002_add_client_config.sql
//
// Applied migrations are tracked in a _migrations table.
// Safe to run multiple times — already-applied migrations are skipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'database', 'migrations');

async function main() {
  const showStatus = process.argv.includes('--status');

  // Check if migrations directory exists
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('No migrations directory found at:', MIGRATIONS_DIR);
    console.log('Create sql/migrations/ and add .sql files to get started.');
    return;
  }

  // Load config for DB connection
  const { config } = await import('../src/config.js');

  if (!config.supabaseUrl || !config.supabaseKey) {
    console.log('No Supabase credentials configured. Migrations require a database connection.');
    console.log('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in engine/.env');
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false },
  });

  // Ensure _migrations table exists
  await db.rpc('query', {
    query: `CREATE TABLE IF NOT EXISTS public._migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
  }).catch(() => {
    // RPC might not exist — try raw SQL via a simpler approach
    console.log('Note: _migrations table creation via RPC failed. You may need to create it manually.');
  });

  // Get already-applied migrations
  const { data: applied } = await db.from('_migrations').select('name').order('name');
  const appliedSet = new Set((applied || []).map((m) => m.name));

  // Get migration files
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (showStatus) {
    console.log('\nMigration Status:');
    console.log('─'.repeat(50));
    for (const file of files) {
      const status = appliedSet.has(file) ? '✅ Applied' : '⏳ Pending';
      console.log(`  ${status}  ${file}`);
    }
    console.log(`\nTotal: ${files.length} | Applied: ${appliedSet.size} | Pending: ${files.length - appliedSet.size}`);
    return;
  }

  // Apply pending migrations
  const pending = files.filter((f) => !appliedSet.has(f));

  if (pending.length === 0) {
    console.log('✅ All migrations are up to date.');
    return;
  }

  console.log(`Found ${pending.length} pending migration(s):\n`);

  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`  ▶ Applying: ${file}...`);
    try {
      // Execute the migration SQL
      const { error } = await db.rpc('query', { query: sql });
      if (error) throw new Error(error.message);

      // Record the migration
      await db.from('_migrations').insert({ name: file });
      console.log(`  ✅ Applied: ${file}`);
    } catch (err) {
      console.error(`  ❌ Failed: ${file} — ${err.message}`);
      console.error('  Stopping. Fix the issue and re-run.');
      process.exit(1);
    }
  }

  console.log(`\n✅ Applied ${pending.length} migration(s) successfully.`);
}

main().catch((err) => {
  console.error('Migration runner failed:', err.message);
  process.exit(1);
});
