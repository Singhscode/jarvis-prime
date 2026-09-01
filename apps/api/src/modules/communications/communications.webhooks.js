import express, { Router } from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../middleware/error-handler.js';
import * as repository from './communications.repository.js';

const MAX_WEBHOOK_BYTES = 256 * 1024;
const TOLERANCE_SECONDS = 5 * 60;

function webhookError(statusCode, code) {
  return new AppError('Communication provider webhook was rejected.', statusCode, code);
}

function parseSigningSecret(secret) {
  const raw = secret?.startsWith('whsec_') ? secret.slice(6) : secret;
  const key = raw ? Buffer.from(raw, 'base64') : null;
  return key?.length ? key : null;
}

function safeEqual(left, right) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyResendWebhook(req) {
  const secret = parseSigningSecret(process.env.COMMUNICATION_RESEND_WEBHOOK_SECRET);
  if (!secret) throw webhookError(503, 'COMMUNICATION_WEBHOOK_UNAVAILABLE');
  if (!Buffer.isBuffer(req.body) || req.body.length > MAX_WEBHOOK_BYTES) throw webhookError(400, 'COMMUNICATION_WEBHOOK_INVALID');
  const id = req.get('svix-id'); const timestamp = req.get('svix-timestamp'); const signatures = req.get('svix-signature');
  if (!id || !timestamp || !signatures || !/^\d+$/.test(timestamp)) throw webhookError(401, 'COMMUNICATION_WEBHOOK_INVALID');
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() - timestampSeconds * 1000) > TOLERANCE_SECONDS * 1000) {
    throw webhookError(401, 'COMMUNICATION_WEBHOOK_STALE');
  }
  const expected = createHmac('sha256', secret).update(`${id}.${timestamp}.${req.body.toString('utf8')}`).digest('base64');
  const candidates = signatures.split(/\s+/).map((item) => item.trim())
    .filter((item) => item.startsWith('v1,')).map((item) => item.slice(3));
  if (!candidates.some((candidate) => safeEqual(candidate, expected))) throw webhookError(401, 'COMMUNICATION_WEBHOOK_INVALID');
  return { id, occurredAt: new Date(timestampSeconds * 1000).toISOString() };
}

function normalizeResendEvent(payload, fallbackOccurredAt) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.data || typeof payload.data !== 'object') {
    throw webhookError(400, 'COMMUNICATION_WEBHOOK_INVALID');
  }
  const eventMap = {
    'email.sent': 'accepted', 'email.delivered': 'delivered', 'email.failed': 'failed',
    'email.bounced': 'bounced', 'email.complained': 'complained',
  };
  const eventType = eventMap[payload.type];
  const providerMessageId = payload.data.email_id;
  const occurredAt = payload.data.created_at && !Number.isNaN(Date.parse(payload.data.created_at))
    ? new Date(payload.data.created_at).toISOString() : fallbackOccurredAt;
  if (!eventType || typeof providerMessageId !== 'string' || !providerMessageId.trim() || providerMessageId.length > 240) {
    throw webhookError(400, 'COMMUNICATION_WEBHOOK_INVALID');
  }
  return { eventType, providerMessageId: providerMessageId.trim(), occurredAt };
}

function mapRepositoryError(error) {
  if (error instanceof AppError) return error;
  const message = error?.message || '';
  if (error?.code === 'P0001' && message.includes('WEBHOOK_EVIDENCE_CONFLICT')) {
    return webhookError(409, 'COMMUNICATION_WEBHOOK_EVIDENCE_CONFLICT');
  }
  if (error?.code === 'P0001' && message.includes('DELIVERY_NOT_FOUND')) {
    return webhookError(404, 'COMMUNICATION_DELIVERY_NOT_FOUND');
  }
  if (error?.code === 'P0001' && message.includes('VALIDATION')) {
    return webhookError(400, 'COMMUNICATION_WEBHOOK_INVALID');
  }
  return webhookError(503, 'COMMUNICATION_WEBHOOK_UNAVAILABLE');
}

export function createCommunicationWebhookRouter() {
  const router = Router();
  router.post('/:provider', express.raw({ type: 'application/json', limit: MAX_WEBHOOK_BYTES }), async (req, res, next) => {
    try {
      if (req.params.provider !== 'resend') throw webhookError(404, 'COMMUNICATION_PROVIDER_NOT_FOUND');
      const verified = verifyResendWebhook(req);
      let payload;
      try { payload = JSON.parse(req.body.toString('utf8')); } catch { throw webhookError(400, 'COMMUNICATION_WEBHOOK_INVALID'); }
      const normalized = normalizeResendEvent(payload, verified.occurredAt);
      let result;
      try {
        result = await repository.recordDeliveryEvent({
          provider: 'resend', providerEventId: verified.id, providerMessageId: normalized.providerMessageId,
          eventType: normalized.eventType, occurredAt: normalized.occurredAt,
          payloadSha256: createHash('sha256').update(req.body).digest('hex'),
        });
      } catch (error) { throw mapRepositoryError(error); }
      return res.status(200).json({ received: true, duplicate: Boolean(result?.duplicate) });
    } catch (error) { return next(error); }
  });
  return router;
}
