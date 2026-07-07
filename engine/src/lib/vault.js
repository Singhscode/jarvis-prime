// HashiCorp Vault KV-V2 Client for dynamic secrets retrieval.
//
// Authenticates using Token or Userpass (username + password) credentials.
//
// Setup env variables:
//   VAULT_ADDR         e.g., http://127.0.0.1:8200
//   VAULT_SECRET_PATH  e.g., secret/data/jarvis-prime/dev (KV-V2 path)
//   VAULT_TOKEN        Vault token (used if no username/password provided)
//   VAULT_USERNAME     Vault username (for Userpass authentication)
//   VAULT_PASSWORD     Vault password (for Userpass authentication)

import { log } from './logger.js';

/**
 * Dynamically authenticate and fetch secrets from HashiCorp Vault.
 * Returns an empty object on missing configuration or errors to allow fallback to env variables.
 *
 * @returns {Promise<Record<string, string>>} Resolved secrets map
 */
export async function fetchVaultSecrets() {
  const vaultAddr = process.env.VAULT_ADDR;
  const secretPath = process.env.VAULT_SECRET_PATH;

  if (!vaultAddr || !secretPath) {
    // Vault is not configured. Silently return empty object to fallback to env/dotenv.
    return {};
  }

  log.info(`[Vault] Attempting secrets retrieval from ${vaultAddr} (path: ${secretPath})`);

  try {
    let token = process.env.VAULT_TOKEN;

    // Check if userpass authentication credentials are provided
    const username = process.env.VAULT_USERNAME;
    const password = process.env.VAULT_PASSWORD;

    if (username && password) {
      log.info(`[Vault] Authenticating via Userpass backend for user: ${username}`);
      const loginUrl = `${cleanUrl(vaultAddr)}/v1/auth/userpass/login/${encodeURIComponent(username)}`;

      const authRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!authRes.ok) {
        throw new Error(`Authentication failed with status ${authRes.status}`);
      }

      const authJson = await authRes.json();
      token = authJson.auth?.client_token;

      if (!token) {
        throw new Error('Vault login succeeded but client_token was missing from response');
      }
      log.ok('[Vault] Authenticated successfully via Userpass.');
    }

    if (!token) {
      log.warn('[Vault] No token or userpass credentials provided. Skipping Vault integration.');
      return {};
    }

    // Load secrets from path
    const readUrl = `${cleanUrl(vaultAddr)}/v1/${secretPath}`;
    const res = await fetch(readUrl, {
      method: 'GET',
      headers: {
        'X-Vault-Token': token,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to read secrets (status ${res.status})`);
    }

    const json = await res.json();
    
    // Support KV V2 data wrapping (data.data) as well as KV V1 (data)
    const secrets = json.data?.data || json.data;

    if (!secrets || typeof secrets !== 'object') {
      log.warn('[Vault] Returned secrets structure is invalid or empty.');
      return {};
    }

    const secretCount = Object.keys(secrets).length;
    log.ok(`[Vault] Successfully retrieved ${secretCount} secret(s) from Vault.`);
    return secrets;
  } catch (err) {
    log.error(`[Vault] Integration error: ${err.message}. Falling back to environment variables.`);
    return {};
  }
}

/**
 * Remove trailing slashes from Vault URL.
 */
function cleanUrl(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
