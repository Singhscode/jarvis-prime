// Webhook API Route
// Receives inbound webhooks from external services.
// Routes: inbound email replies, calendar events, CRM sync, custom triggers.

import express from 'express';
import * as webhookService from '../integrations/webhook.service.js';

const router = express.Router();

// POST /webhooks/inbound-email — Process inbound email reply (from Resend/Postmark)
router.post('/inbound-email', async (req, res) => {
  try {
    const result = await webhookService.processInboundEmail(req.body);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /webhooks/calendar — Cal.com booking events
router.post('/calendar', async (req, res) => {
  try {
    const result = await webhookService.processCalendarWebhook(req.body);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /webhooks/crm — CRM sync events (HubSpot, Pipedrive, etc.)
router.post('/crm', async (req, res) => {
  try {
    const result = await webhookService.processCRMWebhook(req.body);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /webhooks/custom — Custom n8n/Zapier triggers
router.post('/custom', async (req, res) => {
  try {
    const result = await webhookService.processCustomWebhook(req.body);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
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
