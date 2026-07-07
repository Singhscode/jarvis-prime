// Script to sync local .env secrets into HashiCorp Vault.
//
// Usage:
//   node scripts/vault-sync.js
//
// This script:
//   1. Reads the local engine/.env file.
//   2. Extracts Vault settings (VAULT_ADDR, VAULT_SECRET_PATH, etc.).
//   3. Extracts all other sensitive secrets (SUPABASE_URL, API keys, etc.).
//   4. Authenticates with Vault (Token or Userpass).
//   5. Writes all non-Vault secrets into Vault at VAULT_SECRET_PATH.
//   6. Updates the local .env to keep ONLY Vault settings, migrating all secrets to Vault!

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('==================================================');
  console.log('  JARVIS PRIME — Vault Secrets Migration Utility  ');
  console.log('==================================================\n');

  if (!fs.existsSync(envPath)) {
    console.log(`[Error] Local .env file not found at: ${envPath}`);
    console.log('Please copy .env.example to .env and fill in configuration values first.');
    rl.close();
    return;
  }

  // Parse .env file
  const rawEnv = fs.readFileSync(envPath, 'utf8');
  const envLines = rawEnv.split('\n');
  const vaultKeys = ['VAULT_ADDR', 'VAULT_SECRET_PATH', 'VAULT_TOKEN', 'VAULT_USERNAME', 'VAULT_PASSWORD'];
  
  const vaultSettings = {};
  const secrets = {};
  const commentLines = [];

  for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      commentLines.push(line);
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      commentLines.push(line);
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();

    // Strip quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (vaultKeys.includes(key)) {
      vaultSettings[key] = val;
    } else {
      secrets[key] = val;
    }
  }

  // Validate Vault configuration exists
  const vaultAddr = vaultSettings.VAULT_ADDR || process.env.VAULT_ADDR;
  const secretPath = vaultSettings.VAULT_SECRET_PATH || process.env.VAULT_SECRET_PATH;

  if (!vaultAddr || !secretPath) {
    console.log('[Error] Vault settings are missing in your environment or .env file.');
    console.log('Please specify VAULT_ADDR and VAULT_SECRET_PATH in your .env file first.');
    rl.close();
    return;
  }

  const secretCount = Object.keys(secrets).length;
  console.log(`Found Vault endpoint: ${vaultAddr}`);
  console.log(`Target secret path  : ${secretPath}`);
  console.log(`Found ${secretCount} secret key-value pairs to migrate.\n`);

  const confirm = await question('Are you sure you want to write these secrets to Vault? (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('Migration cancelled.');
    rl.close();
    return;
  }

  try {
    let token = vaultSettings.VAULT_TOKEN || process.env.VAULT_TOKEN;
    const username = vaultSettings.VAULT_USERNAME || process.env.VAULT_USERNAME;
    const password = vaultSettings.VAULT_PASSWORD || process.env.VAULT_PASSWORD;

    // Login if Userpass method is set
    if (username && password) {
      console.log(`[Vault] Logging in via Userpass method for user: ${username}...`);
      const cleanAddr = vaultAddr.endsWith('/') ? vaultAddr.slice(0, -1) : vaultAddr;
      const loginUrl = `${cleanAddr}/v1/auth/userpass/login/${encodeURIComponent(username)}`;

      const authRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!authRes.ok) {
        throw new Error(`Authentication failed: Status ${authRes.status}`);
      }

      const authJson = await authRes.json();
      token = authJson.auth?.client_token;
      if (!token) throw new Error('client_token missing from response');
      console.log('[Vault] Userpass authentication successful.');
    }

    if (!token) {
      throw new Error('Vault token is missing. Set VAULT_TOKEN, or set VAULT_USERNAME and VAULT_PASSWORD.');
    }

    // Write secrets to Vault (KV-V2 data wrapper format)
    console.log('[Vault] Writing secrets to secret engine...');
    const cleanAddr = vaultAddr.endsWith('/') ? vaultAddr.slice(0, -1) : vaultAddr;
    const writeUrl = `${cleanAddr}/v1/${secretPath}`;

    const res = await fetch(writeUrl, {
      method: 'POST',
      headers: {
        'X-Vault-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: secrets,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Write failed (Status ${res.status}): ${errText}`);
    }

    console.log(`\n[Success] All ${secretCount} secrets successfully migrated to Vault!`);

    const cleanup = await question('\nDo you want to clean up your local .env to keep ONLY Vault config? (y/n): ');
    if (cleanup.toLowerCase() === 'y') {
      // Re-write .env file keeping only comments & Vault keys
      const newEnvContent = [];
      newEnvContent.push('# ============================================================');
      newEnvContent.push('# JARVIS PRIME ENGINE — Vault Integration Config');
      newEnvContent.push('# SENSITIVE API SECRETS HAVE BEEN MIGRATED TO VAULT.');
      newEnvContent.push('# ============================================================');
      newEnvContent.push('');

      for (const [key, val] of Object.entries(vaultSettings)) {
        newEnvContent.push(`${key}=${val}`);
      }
      newEnvContent.push('');

      fs.writeFileSync(envPath, newEnvContent.join('\n'));
      console.log('[Success] Local .env has been cleaned and secured. Sensitive secrets removed.');
    } else {
      console.log('Keeping local .env unchanged.');
    }

  } catch (err) {
    console.error(`\n[Error] Migration failed: ${err.message}`);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err);
  rl.close();
});
