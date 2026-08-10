import { Router } from 'express';
import { createAuthMiddleware } from '../../middleware/auth-middleware.js';
import { createRateLimiter } from '../../middleware/rate-limiter.js';
import * as finance from './finance.service.js';

const router = Router();
const handle = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const respond = (res, data, status = 200) => {
  res.set('Cache-Control', 'private, no-store');
  res.status(status).json({ success: true, data });
};
const mutationLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 60,
  keyFn: (req) => `finance-mutation:${req.user?.sub || req.ip}`,
  message: 'Too many finance update attempts. Try again later.',
});

router.use(createAuthMiddleware());

router.get('/access', handle(async (req, res) => respond(res, await finance.getFinanceWorkspaceAccess(req.user.sub, req.user))));
router.get('/clients', handle(async (req, res) => respond(res, await finance.listFinanceClients(req.user.sub, req.query))));
router.get('/overview', handle(async (req, res) => respond(res, await finance.getOverview(req.user.sub))));
router.get('/billing-profile', handle(async (req, res) => respond(res, await finance.getBillingProfile(req.user.sub))));
router.put('/billing-profile', mutationLimiter, handle(async (req, res) => respond(res, await finance.upsertBillingProfile(req.user.sub, req.body))));

router.get('/invoices', handle(async (req, res) => respond(res, await finance.listInvoices(req.user.sub, req.query))));
router.get('/invoices/:invoiceId', handle(async (req, res) => respond(res, await finance.getInvoice(req.user.sub, req.params.invoiceId))));
router.post('/invoices', mutationLimiter, handle(async (req, res) => respond(res, await finance.createInvoice(req.user.sub, req.body), 201)));
router.patch('/invoices/:invoiceId', mutationLimiter, handle(async (req, res) => respond(res, await finance.updateInvoice(req.user.sub, req.params.invoiceId, req.body))));
router.patch('/invoices/:invoiceId/status', mutationLimiter, handle(async (req, res) => respond(res, await finance.updateInvoiceStatus(req.user.sub, req.params.invoiceId, req.body))));

router.get('/payments', handle(async (req, res) => respond(res, await finance.listPayments(req.user.sub, req.query))));
router.get('/payments/:paymentId', handle(async (req, res) => respond(res, await finance.getPayment(req.user.sub, req.params.paymentId))));
router.post('/payments', mutationLimiter, handle(async (req, res) => respond(res, await finance.createPayment(req.user.sub, req.body), 201)));
router.patch('/payments/:paymentId/status', mutationLimiter, handle(async (req, res) => respond(res, await finance.updatePaymentStatus(req.user.sub, req.params.paymentId, req.body))));

router.get('/expenses', handle(async (req, res) => respond(res, await finance.listExpenses(req.user.sub, req.query))));
router.get('/expenses/:expenseId', handle(async (req, res) => respond(res, await finance.getExpense(req.user.sub, req.params.expenseId))));
router.post('/expenses', mutationLimiter, handle(async (req, res) => respond(res, await finance.createExpense(req.user.sub, req.body), 201)));
router.patch('/expenses/:expenseId', mutationLimiter, handle(async (req, res) => respond(res, await finance.updateExpense(req.user.sub, req.params.expenseId, req.body))));
router.patch('/expenses/:expenseId/status', mutationLimiter, handle(async (req, res) => respond(res, await finance.updateExpenseStatus(req.user.sub, req.params.expenseId, req.body))));

export default router;
