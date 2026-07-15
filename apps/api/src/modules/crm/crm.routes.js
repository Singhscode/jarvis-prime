import { Router } from 'express';
import { createAuthMiddleware } from '../../middleware/auth-middleware.js';
import { validate } from '../../middleware/validate.js';
import * as crm from './crm.service.js';

const router = Router();
export const projectsRouter = Router();

function handle(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

router.use(createAuthMiddleware());
projectsRouter.use(createAuthMiddleware());

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

router.get('/clients', handle(async (req, res) => {
  const data = await crm.listClients(req.user.sub);
  res.json({ success: true, data });
}));

router.post('/clients', validate({ lead_id: 'string', name: 'string' }), handle(async (req, res) => {
  const data = await crm.createClient(req.user.sub, req.body);
  res.status(201).json({ success: true, data });
}));

router.patch('/clients/:id', handle(async (req, res) => {
  const data = await crm.updateClient(req.user.sub, req.params.id, req.body);
  res.json({ success: true, data });
}));

router.delete('/clients/:id', handle(async (req, res) => {
  await crm.deleteClient(req.user.sub, req.params.id);
  res.json({ success: true });
}));

router.get('/clients/:clientId/contacts', handle(async (req, res) => {
  const data = await crm.listClientContacts(req.user.sub, req.params.clientId);
  res.json({ success: true, data });
}));

router.post('/clients/:clientId/contacts', validate({
  name: 'string', email: 'string?', phone: 'string?', title: 'string?',
}), handle(async (req, res) => {
  const data = await crm.createClientContact(req.user.sub, req.params.clientId, req.body);
  res.status(201).json({ success: true, data });
}));

router.patch('/clients/:clientId/contacts/:contactId', handle(async (req, res) => {
  const data = await crm.updateClientContact(
    req.user.sub, req.params.clientId, req.params.contactId, req.body
  );
  res.json({ success: true, data });
}));

router.delete('/clients/:clientId/contacts/:contactId', handle(async (req, res) => {
  await crm.deleteClientContact(req.user.sub, req.params.clientId, req.params.contactId);
  res.json({ success: true });
}));

projectsRouter.get('/', handle(async (req, res) => {
  const data = await crm.listProjects(req.user.sub);
  res.json({ success: true, data });
}));

projectsRouter.post('/', validate({ client_id: 'string', name: 'string' }), handle(async (req, res) => {
  const data = await crm.createProject(req.user.sub, req.body);
  res.status(201).json({ success: true, data });
}));

projectsRouter.patch('/:id', handle(async (req, res) => {
  const data = await crm.updateProject(req.user.sub, req.params.id, req.body);
  res.json({ success: true, data });
}));

projectsRouter.delete('/:id', handle(async (req, res) => {
  await crm.deleteProject(req.user.sub, req.params.id);
  res.json({ success: true });
}));

export default router;
