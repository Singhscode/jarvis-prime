// Campaigns API
// Campaign management and tracking

import express from 'express';
import * as campaignService from '../services/campaign-service.js';
import { validate } from '../../middleware/validate.js';

const router = express.Router();

router.post('/', validate({ clientId: 'string' }), async (req, res) => {
  try {
    const { clientId, campaignData } = req.body;
    if (!clientId) return res.status(400).json({ error: 'Missing clientId' });
    const result = await campaignService.startCampaign(clientId, campaignData);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:campaignId', async (req, res) => {
  try {
    const result = await campaignService.getCampaignStatus(req.params.campaignId);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:campaignId/track', async (req, res) => {
  try {
    const { prospectEmail, eventType } = req.body;
    if (!prospectEmail || !eventType) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const result = await campaignService.trackEmail(req.params.campaignId, prospectEmail, eventType);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
