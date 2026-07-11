// Outreach API
// Wraps outreach-service for HTTP access

import express from 'express';
import { providerStatus } from '../../config.js';
import * as outreachService from '../services/outreach-service.js';
import { validate } from '../../middleware/validate.js';

const router = express.Router();

router.post('/', validate({ action: 'string' }), async (req, res) => {
  try {
    const { action, prospect, step, dry_run } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Missing action' });
    }

    const status = providerStatus();
    let result;

    switch (action) {
      case 'send_email':
        if (!status.resend) return res.status(503).json({ error: 'Email not configured' });
        result = await outreachService.sendEmail(prospect, step, { dryRun: dry_run });
        break;

      case 'send_followup':
        if (!status.resend) return res.status(503).json({ error: 'Email not configured' });
        result = await outreachService.sendFollowup(prospect, step, { dryRun: dry_run });
        break;

      case 'send_alert':
        if (!status.telegram) return res.status(503).json({ error: 'Telegram not configured' });
        result = await outreachService.sendAlert(prospect, { dryRun: dry_run });
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', (req, res) => {
  const status = providerStatus();
  return res.json({
    status: 'ok',
    providers: { resend: status.resend, telegram: status.telegram, groq: status.groq },
    actions: ['send_email', 'send_followup', 'send_alert'],
  });
});

export default router;
