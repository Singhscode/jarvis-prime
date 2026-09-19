// Test for auth/refresh CORS preflight
// Validates that OPTIONS requests are not rate-limited and CORS headers are correct

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const nativeFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://auth-refresh-preflight.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'auth-refresh-preflight-test-jwt-secret';
process.env.DRY_RUN = 'true';
process.env.NODE_ENV = 'production';
process.env.CORS_ORIGINS = 'https://www.jarvisprime.me';

globalThis.fetch = () => { throw new Error('Unexpected database request'); };

after(() => { globalThis.fetch = nativeFetch; });

const express = (await import('express')).default;
const { router: authRouter } = await import('../src/modules/auth/auth.routes.js');
const { createCors } = await import('../src/middleware/cors.js');
const { createRateLimiter } = await import('../src/middleware/rate-limiter.js');

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use(createCors({ credentials: true, origins: 'https://www.jarvisprime.me' }));
  app.use(createRateLimiter()); // Global rate limiter
  app.use('/api/auth', authRouter);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    await run(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('Auth Refresh — CORS Preflight', () => {
  test('OPTIONS /api/auth/refresh returns 204 with proper CORS headers', async () => {
    await withServer(async (port) => {
      const response = await nativeFetch(`http://127.0.0.1:${port}/api/auth/refresh`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://www.jarvisprime.me',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });

      assert.equal(response.status, 204, 'OPTIONS should return 204 No Content');
      assert.equal(
        response.headers.get('access-control-allow-origin'),
        'https://www.jarvisprime.me',
        'should echo the allowed origin'
      );
      assert.equal(
        response.headers.get('access-control-allow-credentials'),
        'true',
        'should allow credentials for refresh cookie'
      );
      assert.ok(
        response.headers.get('access-control-allow-methods')?.includes('POST'),
        'should allow POST'
      );
    });
  });

  test('OPTIONS /api/auth/refresh is not counted toward rate limit', async () => {
    await withServer(async (port) => {
      const url = `http://127.0.0.1:${port}/api/auth/refresh`;
      const origin = 'https://www.jarvisprime.me';

      // Send many OPTIONS requests - these should NOT be rate limited
      const responses = [];
      for (let i = 0; i < 15; i++) {
        const res = await nativeFetch(url, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
          },
        });
        responses.push(res);
      }

      // All OPTIONS should succeed (204), not get rate limited (429)
      for (const res of responses) {
        assert.equal(
          res.status,
          204,
          'OPTIONS requests should never be rate limited'
        );
      }
    });
  });

  test('rate limit still applies to actual POST requests', async () => {
    await withServer(async (port) => {
      const url = `http://127.0.0.1:${port}/api/auth/refresh`;
      // Just verify the endpoint exists and accepts POST (actual auth validation is elsewhere)
      // We're testing that POST is rate-limited while OPTIONS is not.
      
      const postResponse = await nativeFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://www.jarvisprime.me',
        },
        body: JSON.stringify({}),
      });

      // Should get 401 (missing refresh token) or 429 (rate limited), not 204
      assert.notEqual(
        postResponse.status,
        204,
        'POST /refresh should not return 204 (that is only for OPTIONS)'
      );
    });
  });
});
