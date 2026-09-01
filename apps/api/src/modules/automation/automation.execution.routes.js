import { Router } from 'express';
import { createAuthMiddleware } from '../../middleware/auth-middleware.js';
import { createRateLimiter } from '../../middleware/rate-limiter.js';
import * as automation from './automation.execution.service.js';

const router = Router();
const handle = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const respond = (res, data, status = 200) => { res.set('Cache-Control', 'private, no-store'); res.status(status).json({ success: true, data }); };
const mutationLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 30, keyFn: (req) => `automation-control:${req.user?.sub || req.ip}`, message: 'Too many automation control attempts. Try again later.' });

router.use(createAuthMiddleware());
router.get('/access', handle(async (req, res) => respond(res, await automation.getAccess(req.user.sub, req.user))));
router.get('/readiness', handle(async (_req, res) => respond(res, await automation.getReadiness())));
router.post('/runs', mutationLimiter, handle(async (req, res) => respond(res, await automation.createManualRun(req.user.sub, req.body, req.get('Idempotency-Key')), 202)));
router.get('/runs', handle(async (req, res) => respond(res, await automation.listRuns(req.user.sub, req.query))));
router.get('/runs/:runId', handle(async (req, res) => respond(res, await automation.getRunHistory(req.user.sub, req.params.runId))));
router.post('/runs/:runId/pause', mutationLimiter, handle(async (req, res) => respond(res, await automation.pauseEmployeeRun(req.user.sub, req.params.runId))));
router.post('/runs/:runId/resume', mutationLimiter, handle(async (req, res) => respond(res, await automation.resumeEmployeeRun(req.user.sub, req.params.runId))));
router.post('/runs/:runId/cancel', mutationLimiter, handle(async (req, res) => respond(res, await automation.cancelRun(req.user.sub, req.params.runId, req.body))));
router.post('/work/:workItemId/retry', mutationLimiter, handle(async (req, res) => respond(res, await automation.resumeRetry(req.user.sub, req.params.workItemId, req.body, req.get('Idempotency-Key')))));
router.post('/work/:workItemId/review-resolution', mutationLimiter, handle(async (req, res) => respond(res, await automation.resolveHumanReview(req.user.sub, req.params.workItemId, req.body, req.get('Idempotency-Key')))));
router.put('/controls', mutationLimiter, handle(async (req, res) => respond(res, await automation.setOwnerControl(req.user.sub, req.body))));
router.post('/schedules/daily', mutationLimiter, handle(async (req, res) => respond(res, await automation.createDailySchedule(req.user.sub, req.body), 201)));

export default router;
