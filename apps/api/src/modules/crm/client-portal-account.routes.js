import { Router } from 'express';
import { createRateLimiter } from '../../middleware/rate-limiter.js';
import * as crm from './crm.service.js';

const router = Router();
const activationLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 5,
  keyFn: (req) => `client-account-activation:${req.ip}`,
  message: 'Too many account activation attempts. Try again later.',
});

router.post('/account-activate', activationLimiter, async (req, res) => {
  try {
    const data = await crm.activateProvisionedClientAccount(req.body);
    res.set('Cache-Control', 'no-store').json({ success: true, data });
  } catch {
    res.set('Cache-Control', 'no-store').status(400).json({
      error: { code: 'INVALID_ACCOUNT_ACTIVATION', message: 'Account activation could not be completed.' },
    });
  }
});

export default router;
