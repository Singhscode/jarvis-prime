// Webhook API Route
// Receives inbound webhooks from external services.
// Routes: inbound email replies, calendar events, CRM sync, custom triggers.

import express from 'express';
import * as webhookService from '../integrations/webhook.service.js';

const router = express.Router();

// POST /webhooks/inbound-email — Process inbound email reply (from Resend/Postmark)
// REQUIRES CONFIGURATION: COMMUNICATION_RESEND_WEBHOOK_SECRET must be set
// For Resend: Uses verifyResendWebhook() in communications.webhooks.js (not this route)
router.post('/inbound-email', async (req, res) => {
  // Fail closed if webhook signatures are not configured
  const hasResendSecret = !!process.env.COMMUNICATION_RESEND_WEBHOOK_SECRET;
  if (!hasResendSecret) {
    return res.status(503).json({ 
      success: false, 
      error: 'Webhook signature verification not configured. Set COMMUNICATION_RESEND_WEBHOOK_SECRET.' 
    });
  }
  
  // For Resend webhooks, use the dedicated email webhook route which verifies signatures
  // This route is a fallback for non-Resend providers (not yet implemented)
  return res.status(501).json({
    success: false,
    error: 'Inbound email webhook not implemented for this provider. Use /api/communications/webhooks/email/resend'
  });
});

// POST /webhooks/calendar — Cal.com booking events
// REQUIRES CONFIGURATION: Cal.com webhook secret must be configured
// NOTE: Not yet implemented - requires external webhook signature verification
router.post('/calendar', async (req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Cal.com webhook not yet implemented. Requires webhook secret configuration.'
  });
});

// POST /webhooks/crm — CRM sync events (HubSpot, Pipedrive, etc.)
// REQUIRES CONFIGURATION: CRM webhook secret must be configured
// NOTE: Not yet implemented - requires external webhook signature verification
router.post('/crm', async (req, res) => {
  return res.status(501).json({
    success: false,
    error: 'CRM webhook not yet implemented. Requires webhook secret configuration.'
  });
});

// POST /webhooks/custom — Custom n8n/Zapier triggers
// REQUIRES CONFIGURATION: Custom webhook secret must be configured
// NOTE: Not yet implemented - requires external webhook signature verification
router.post('/custom', async (req, res) => {
  return res.status(501).json({
    success: false,
    error: 'Custom webhook not yet implemented. Requires webhook secret configuration.'
  });
});

// GET /webhooks/history — View recent webhook events
router.get('/history', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const source = req.query.source || null;
  const events = webhookService.getEventHistory(limit, source);
  return res.json({ success: true, data: { count: events.length, events } });
});

// GET /webhooks — Status endpoint
router.get('/', (req, res) => {
  return res.json({
    status: 'ok',
    endpoints: [
      'POST /webhooks/inbound-email',
      'POST /webhooks/calendar',
      'POST /webhooks/crm',
      'POST /webhooks/custom',
      'GET /webhooks/history?limit=50&source=',
    ],
  });
});

export default router;
