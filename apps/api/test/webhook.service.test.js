// Webhook Service Tests
// Tests signature verification for webhook security

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature, parseSigningSecret } from '../src/integrations/webhook.service.js';

describe('Webhook Service - Signature Verification', () => {
  // Helper to generate expected signatures
  function generateResendSignature(payload, secretBase64) {
    const key = Buffer.from(secretBase64, 'base64');
    return 'v1,' + createHmac('sha256', key).update(payload).digest('base64');
  }

  function generateGenericHmac(payload, secretBase64) {
    const key = Buffer.from(secretBase64, 'base64');
    return createHmac('sha256', key).update(payload).digest('hex');
  }

  const testPayload = JSON.stringify({ event: 'test', data: { id: '123' } });
  const testSecretBase64 = 'test-signing-secret-base64-encoded';
  const testSecretResend = 'whsec_' + testSecretBase64;

  describe('parseSigningSecret', () => {
    test('parses Resend-style secret with whsec_ prefix', () => {
      const key = parseSigningSecret(testSecretResend);
      assert.ok(key);
      assert.ok(key.length > 0);
    });

    test('parses raw base64 secret without prefix', () => {
      const key = parseSigningSecret(testSecretBase64);
      assert.ok(key);
      assert.ok(key.length > 0);
    });

    test('rejects null/undefined/empty string', () => {
      assert.strictEqual(parseSigningSecret(null), null);
      assert.strictEqual(parseSigningSecret(undefined), null);
      assert.strictEqual(parseSigningSecret(''), null);
      assert.strictEqual(parseSigningSecret('whsec_'), null);
    });

    test('returns valid key for base64 strings (graceful handling of padding)', () => {
      // Node.js base64 decoder is lenient with padding - this is acceptable
      const key = parseSigningSecret('aGVsbG8gd29ybGQ='); // "hello world"
      assert.ok(key);
      assert.ok(key.length > 0);
      assert.strictEqual(key.toString(), 'hello world');
    });
  });

  describe('verifySignature', () => {
    test('accepts webhook when no secret is configured (development mode)', () => {
      const result = verifySignature(testPayload, 'any-signature', '');
      assert.strictEqual(result, true);
    });

    test('rejects webhook when secret is configured but signature is missing', () => {
      const result = verifySignature(testPayload, '', testSecretResend);
      assert.strictEqual(result, false);
    });

    describe('Resend signature format (v1,<base64>)', () => {
      test('accepts valid Resend signature', () => {
        const signature = generateResendSignature(testPayload, testSecretBase64);
        const result = verifySignature(testPayload, signature, testSecretResend);
        assert.strictEqual(result, true);
      });

      test('rejects invalid Resend signature (tampered payload)', () => {
        const signature = generateResendSignature('tampered-payload', testSecretBase64);
        const result = verifySignature(testPayload, signature, testSecretResend);
        assert.strictEqual(result, false);
      });

      test('rejects malformed signature (missing v1,)', () => {
        const signature = 'invalid-format';
        const result = verifySignature(testPayload, signature, testSecretResend);
        assert.strictEqual(result, false);
      });

      test('rejects signature with tampered base64', () => {
        const validSig = generateResendSignature(testPayload, testSecretBase64);
        const tampered = validSig.replace('v1,', 'v1,TAMPERED_');
        const result = verifySignature(testPayload, tampered, testSecretResend);
        assert.strictEqual(result, false);
      });
    });

    describe('Generic HMAC-SHA256 (hex)', () => {
      test('accepts valid hex HMAC signature', () => {
        const signature = generateGenericHmac(testPayload, testSecretBase64);
        const result = verifySignature(testPayload, signature, testSecretBase64);
        assert.strictEqual(result, true);
      });

      test('rejects invalid hex HMAC signature', () => {
        const signature = generateGenericHmac('tampered-payload', testSecretBase64);
        const result = verifySignature(testPayload, signature, testSecretBase64);
        assert.strictEqual(result, false);
      });

      test('rejects non-hex signature', () => {
        const signature = 'not-a-hex-signature!!!';
        const result = verifySignature(testPayload, signature, testSecretBase64);
        assert.strictEqual(result, false);
      });
    });
  });
});