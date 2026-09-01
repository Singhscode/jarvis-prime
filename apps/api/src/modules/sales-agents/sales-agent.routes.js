import { Router } from 'express';
import { createAuthMiddleware } from '../../middleware/auth-middleware.js';
import { createRateLimiter } from '../../middleware/rate-limiter.js';
import { assertOwnerWorkspaceAccess } from '../owner-workspace/owner-workspace.service.js';
import * as salesAgents from './sales-agent.service.js';

const router = Router();
const handle = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const respond = (res, data, status = 200) => {
  res.set('Cache-Control', 'private, no-store');
  res.status(status).json({ success: true, data });
};
const authorizeOwner = (req, _res, next) => Promise.resolve(assertOwnerWorkspaceAccess(req.user.sub)).then(() => next(), next);
const mutationLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 30,
  keyFn: (req) => `sales-agent-approval:${req.user?.sub || req.ip}`,
  message: 'Too many sales approval requests. Try again later.',
});

router.use(createAuthMiddleware());
router.use(authorizeOwner);

router.get('/approvals', handle(async (req, res) => respond(res, await salesAgents.listApprovals(req.user.sub, req.query))));
router.post('/approvals', mutationLimiter, handle(async (req, res) => respond(
  res,
  await salesAgents.prepareApproval(req.user.sub, req.body, req.get('Idempotency-Key')),
  201,
)));
router.post('/approvals/:actionId/revisions', mutationLimiter, handle(async (req, res) => respond(
  res,
  await salesAgents.reviseApproval(req.user.sub, req.params.actionId, req.body),
)));
router.post('/approvals/:actionId/decisions', mutationLimiter, handle(async (req, res) => respond(
  res,
  await salesAgents.decideApproval(req.user.sub, req.params.actionId, req.body),
)));
router.post('/approvals/:actionId/release-dry-run', mutationLimiter, handle(async (req, res) => respond(
  res,
  await salesAgents.releaseApprovalDryRun(req.user.sub, req.params.actionId, req.body, req.get('Idempotency-Key')),
)));

export default router;
