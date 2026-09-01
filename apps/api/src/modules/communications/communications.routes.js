import { Router } from 'express';
import { createAuthMiddleware } from '../../middleware/auth-middleware.js';
import { createRateLimiter } from '../../middleware/rate-limiter.js';
import { parseCommunicationMessage } from './communications-message-parser.js';
import * as communications from './communications.service.js';

const router = Router();
const handle = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const respond = (res, data, status = 200) => {
  res.set('Cache-Control', 'private, no-store');
  res.status(status).json({ success: true, data });
};
const mutationLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 60,
  keyFn: (req) => `communications-mutation:${req.user?.sub || req.ip}`,
  message: 'Too many Communication Hub updates. Try again later.',
});

router.use(createAuthMiddleware());
router.get('/threads', handle(async (req, res) => respond(res, await communications.listThreads(req.user.sub, req.query))));
router.post('/threads', mutationLimiter, handle(async (req, res) => respond(res, await communications.createThread(req.user.sub, req.body, req.get('Idempotency-Key')), 201)));
router.get('/threads/:threadId', handle(async (req, res) => respond(res, await communications.getThread(req.user.sub, req.params.threadId, req.query))));
router.post('/threads/:threadId/messages', mutationLimiter, parseCommunicationMessage, handle(async (req, res) => {
  const message = req.communicationMessage || { body: req.body?.body, files: [] };
  const values = req.communicationMessage ? { body: message.body } : req.body;
  return respond(res, await communications.sendMessage(req.user.sub, req.params.threadId, values, message.files, req.get('Idempotency-Key')), 201);
}));
router.put('/threads/:threadId/read', mutationLimiter, handle(async (req, res) => respond(res, await communications.markRead(req.user.sub, req.params.threadId, req.body))));
router.get('/threads/:threadId/attachments/:attachmentId/download', handle(async (req, res) => respond(res, await communications.getAttachmentDownload(req.user.sub, req.params.threadId, req.params.attachmentId))));
router.get('/notifications', handle(async (req, res) => respond(res, await communications.listNotifications(req.user.sub, req.query))));
router.patch('/notifications/:notificationId', mutationLimiter, handle(async (req, res) => respond(res, await communications.setNotificationState(req.user.sub, req.params.notificationId, req.body))));
router.get('/preferences', handle(async (req, res) => respond(res, await communications.getPreferences(req.user.sub))));
router.put('/preferences', mutationLimiter, handle(async (req, res) => respond(res, await communications.updatePreferences(req.user.sub, req.body))));

export default router;
