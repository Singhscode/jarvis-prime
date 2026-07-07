// Unit tests for the Vault Secrets Manager client integration.
// Run with: npm test

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('Vault Integration Client', () => {
  let originalEnv;

  before(() => {
    // Backup original environment variables
    originalEnv = { ...process.env };
  });

  after(() => {
    // Restore environment variables
    process.env = originalEnv;
  });

  test('returns empty secrets mapping when unconfigured', async () => {
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_SECRET_PATH;

    const { fetchVaultSecrets } = await import('../src/lib/vault.js');
    const secrets = await fetchVaultSecrets();

    assert.deepEqual(secrets, {});
  });

  test('correctly fetches KV secrets from Vault via Token auth mock', async () => {
    process.env.VAULT_ADDR = 'http://mock-vault.local';
    process.env.VAULT_SECRET_PATH = 'secret/data/mock-app';
    process.env.VAULT_TOKEN = 'mock-token';
    delete process.env.VAULT_USERNAME;
    delete process.env.VAULT_PASSWORD;

    // Mock global fetch for Vault KV retrieval
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'http://mock-vault.local/v1/secret/data/mock-app');
      assert.equal(options.headers['X-Vault-Token'], 'mock-token');
      return {
        ok: true,
        json: async () => ({
          data: {
            data: {
              MOCK_SECRET_KEY: 'mock-secret-value',
            },
          },
        }),
      };
    };

    try {
      const { fetchVaultSecrets } = await import('../src/lib/vault.js?update=' + Date.now());
      const secrets = await fetchVaultSecrets();

      assert.equal(secrets.MOCK_SECRET_KEY, 'mock-secret-value');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('performs login before fetching KV when Userpass auth is provided', async () => {
    process.env.VAULT_ADDR = 'http://mock-vault.local';
    process.env.VAULT_SECRET_PATH = 'secret/data/mock-app';
    process.env.VAULT_USERNAME = 'mock-user';
    process.env.VAULT_PASSWORD = 'mock-password';
    delete process.env.VAULT_TOKEN;

    const originalFetch = globalThis.fetch;
    let loginCalled = false;
    let kvCalled = false;

    globalThis.fetch = async (url, options) => {
      if (url.includes('/auth/userpass/login/')) {
        loginCalled = true;
        assert.equal(url, 'http://mock-vault.local/v1/auth/userpass/login/mock-user');
        assert.deepEqual(JSON.parse(options.body), { password: 'mock-password' });
        return {
          ok: true,
          json: async () => ({
            auth: {
              client_token: 'generated-client-token',
            },
          }),
        };
      }

      if (url.includes('/v1/secret/data/mock-app')) {
        kvCalled = true;
        assert.equal(options.headers['X-Vault-Token'], 'generated-client-token');
        return {
          ok: true,
          json: async () => ({
            data: {
              data: {
                DB_USER: 'vault-db-user',
              },
            },
          }),
        };
      }

      throw new Error(`Unexpected URL called: ${url}`);
    };

    try {
      const { fetchVaultSecrets } = await import('../src/lib/vault.js?update=' + Date.now());
      const secrets = await fetchVaultSecrets();

      assert.equal(loginCalled, true);
      assert.equal(kvCalled, true);
      assert.equal(secrets.DB_USER, 'vault-db-user');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('gracefully fails and returns empty object on HTTP errors', async () => {
    process.env.VAULT_ADDR = 'http://mock-vault.local';
    process.env.VAULT_SECRET_PATH = 'secret/data/mock-app';
    process.env.VAULT_TOKEN = 'mock-token';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 500,
      };
    };

    try {
      const { fetchVaultSecrets } = await import('../src/lib/vault.js?update=' + Date.now());
      const secrets = await fetchVaultSecrets();

      assert.deepEqual(secrets, {});
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
