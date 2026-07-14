import { Router } from 'express';
import { createAuthMiddleware } from '../../middleware/auth-middleware.js';
import { validate } from '../../middleware/validate.js';
import * as crm from './crm.service.js';

const router = Router();

function handle(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

router.use(createAuthMiddleware());

router.get('/companies', handle(async (req, res) => {
  const data = await crm.listCompanies(req.user.sub);
  res.json({ success: true, data });
}));

router.post('/companies', validate({ name: 'string' }), handle(async (req, res) => {
  const data = await crm.createCompany(req.user.sub, req.body);
  res.status(201).json({ success: true, data });
}));

router.patch('/companies/:id', handle(async (req, res) => {
  const data = await crm.updateCompany(req.user.sub, req.params.id, req.body);
  res.json({ success: true, data });
}));

router.delete('/companies/:id', handle(async (req, res) => {
  await crm.deleteCompany(req.user.sub, req.params.id);
  res.json({ success: true });
}));

router.get('/contacts', handle(async (req, res) => {
  const data = await crm.listContacts(req.user.sub);
  res.json({ success: true, data });
}));

router.post('/contacts', validate({
  name: 'string', email: 'string?', phone: 'string?', title: 'string?', company_id: 'string?',
}), handle(async (req, res) => {
  const data = await crm.createContact(req.user.sub, req.body);
  res.status(201).json({ success: true, data });
}));

router.patch('/contacts/:id', handle(async (req, res) => {
  const data = await crm.updateContact(req.user.sub, req.params.id, req.body);
  res.json({ success: true, data });
}));

router.delete('/contacts/:id', handle(async (req, res) => {
  await crm.deleteContact(req.user.sub, req.params.id);
  res.json({ success: true });
}));

router.get('/leads', handle(async (req, res) => {
  const data = await crm.listLeads(req.user.sub);
  res.json({ success: true, data });
}));

router.post('/leads', validate({ contact_id: 'string' }), handle(async (req, res) => {
  const data = await crm.createLead(req.user.sub, req.body.contact_id);
  res.status(201).json({ success: true, data });
}));

router.delete('/leads/:id', handle(async (req, res) => {
  await crm.deleteLead(req.user.sub, req.params.id);
  res.json({ success: true });
}));

export default router;
