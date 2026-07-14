// LinkedIn API Route
// HTTP interface for LinkedIn automation actions.

import express from 'express';
import { providerStatus } from '../../config/config.js';
import * as linkedinService from './linkedin.service.js';

const router = express.Router();

// POST /api/linkedin — Execute a LinkedIn action
router.post('/', async (req, res) => {
  try {
    const { action, prospect, client, options } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Missing action. Valid: visit, connect, message, bulk' });
    }

    if (!providerStatus().linkedin && action !== 'bulk') {
      // Still allow in dry-run mode
    }

    let result;
    switch (action) {
      case 'visit':
      case 'connect':
      case 'message':
        if (!prospect) return res.status(400).json({ error: 'Missing prospect' });
        result = await linkedinService.executeAction(action, prospect, client, options || {});
        break;

      case 'bulk':
        if (!req.body.prospects) return res.status(400).json({ error: 'Missing prospects array' });
        result = await linkedinService.bulkOutreach(req.body.prospects, client, options || {});
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/linkedin — Status and daily limits
router.get('/', (req, res) => {
  return res.json({
    status: 'ok',
    ...linkedinService.getStatus(),
    actions: ['visit', 'connect', 'message', 'bulk'],
  });
});

export default router;
