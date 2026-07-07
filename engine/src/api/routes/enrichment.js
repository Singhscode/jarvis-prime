// Enrichment API
// Wraps enrichment-service for HTTP access

import express from 'express';
import { providerStatus } from '../../config.js';
import * as enrichmentService from '../services/enrichment-service.js';
import { validate } from '../../middleware/validate.js';

const router = express.Router();

router.post('/', validate({ action: 'string' }), async (req, res) => {
  try {
    const { action, params, dry_run } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Missing action' });
    }

    const status = providerStatus();
    let result;

    switch (action) {
      case 'search':
        if (!status.apollo) return res.status(503).json({ error: 'Apollo not configured' });
        result = await enrichmentService.searchProspects(params, { dryRun: dry_run });
        break;

      case 'find_agencies':
        if (!status.apollo) return res.status(503).json({ error: 'Apollo not configured' });
        result = await enrichmentService.findMarketingAgencies(params?.location, params?.limit);
        break;

      case 'enrich_batch':
        if (!status.apollo) return res.status(503).json({ error: 'Apollo not configured' });
        result = await enrichmentService.enrichBatch(params, { dryRun: dry_run });
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
    providers: { apollo: status.apollo, hunter: status.hunter },
    actions: ['search', 'find_agencies', 'enrich_batch'],
  });
});

export default router;
