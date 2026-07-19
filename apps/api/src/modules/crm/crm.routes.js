import { Router } from 'express';
import {
  createAuthMiddleware,
  createAuthorizationMiddleware,
} from '../../middleware/auth-middleware.js';
import { validate } from '../../middleware/validate.js';
import * as crm from './crm.service.js';

const router = Router();
export const projectsRouter = Router();
export const employeePortalRouter = Router();

function handle(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

router.use(createAuthMiddleware());
projectsRouter.use(createAuthMiddleware());
employeePortalRouter.use(createAuthMiddleware());
employeePortalRouter.use(createAuthorizationMiddleware('employee'));

employeePortalRouter.get('/', handle(async (req, res) => {
  const data = await crm.getEmployeePortal(req.user.sub);
  res.json({ success: true, data });
}));

employeePortalRouter.patch('/tasks/:taskId', validate({
  completed: 'boolean', justification: 'string',
}), handle(async (req, res) => {
  const data = await crm.completeEmployeeTask(req.user.sub, req.params.taskId, req.body);
  res.json({ success: true, data });
}));

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

projectsRouter.get('/:projectId/tasks', handle(async (req, res) => {
  const data = await crm.listTasks(req.user.sub, req.params.projectId);
  res.json({ success: true, data });
}));

projectsRouter.post('/:projectId/tasks', validate({ name: 'string' }), handle(async (req, res) => {
  const data = await crm.createTask(req.user.sub, req.params.projectId, req.body);
  res.status(201).json({ success: true, data });
}));

projectsRouter.patch('/:projectId/tasks/:taskId', validate({
  name: 'string?', completed: 'boolean?', assigned_user_id: 'string?',
}), handle(async (req, res) => {
  const data = await crm.updateTask(
    req.user.sub, req.params.projectId, req.params.taskId, req.body
  );
  res.json({ success: true, data });
}));

projectsRouter.delete('/:projectId/tasks/:taskId', handle(async (req, res) => {
  await crm.deleteTask(req.user.sub, req.params.projectId, req.params.taskId);
  res.json({ success: true });
}));

export default router;

export const clientPortalRouter = Router();

function clientPortalValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

function parseClientPortalDocument(req, _res, next) {
  if (!req.is('multipart/form-data')) {
    return next(clientPortalValidationError('Client Portal document upload requires multipart/form-data.'));
  }

  void (async () => {
    const { default: Busboy } = await import('busboy');
    const parser = Busboy({
      headers: req.headers,
      limits: { files: 1, fields: 3, fileSize: 10 * 1024 * 1024 },
    });
    const fields = {};
    let uploadedFile = null;
    let parseError = null;
    const fail = (message) => {
      if (!parseError) parseError = clientPortalValidationError(message);
    };

    parser.on('field', (name, value) => {
      if (Object.hasOwn(fields, name)) fail('Duplicate document metadata field.');
      else fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      if (name !== 'file' || uploadedFile) {
        fail('Only one document file is permitted.');
        stream.resume();
        return;
      }
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => fail('Document file exceeds the permitted size.'));
      stream.on('error', () => fail('Document upload failed.'));
      stream.on('end', () => {
        uploadedFile = { buffer: Buffer.concat(chunks), mimeType: info.mimeType };
      });
    });
    parser.on('filesLimit', () => fail('Only one document file is permitted.'));
    parser.on('fieldsLimit', () => fail('Too many document metadata fields.'));
    parser.on('error', () => fail('Document upload failed.'));
    parser.on('finish', () => {
      if (parseError) return next(parseError);
      if (!uploadedFile) return next(clientPortalValidationError('One document file is required.'));
      req.body = fields;
      req.clientPortalDocument = uploadedFile;
      return next();
    });
    req.pipe(parser);
  })().catch(next);
}

clientPortalRouter.use(createAuthMiddleware());
clientPortalRouter.use(createAuthorizationMiddleware('client'));

clientPortalRouter.get('/', handle(async (req, res) => {
  const data = await crm.getClientPortal(req.user.sub);
  res.json({ success: true, data });
}));

clientPortalRouter.post('/activate', validate({ invitation: 'string' }), handle(async (req, res) => {
  const data = await crm.activateClientPortalMembership(req.user.sub, req.body);
  res.json({ success: true, data });
}));

clientPortalRouter.get('/documents/:documentId/download', handle(async (req, res) => {
  const data = await crm.getClientPortalDocumentDownload(req.user.sub, req.params.documentId);
  res.json({ success: true, data });
}));

router.post('/clients/:clientId/portal-invitations', validate({ contact_id: 'string' }), handle(async (req, res) => {
  const data = await crm.inviteClientPortalMember(req.user.sub, req.params.clientId, req.body);
  res.status(201).json({ success: true, data });
}));

router.post('/clients/:clientId/portal-members/:membershipId/resend', handle(async (req, res) => {
  const data = await crm.resendClientPortalInvitation(req.user.sub, req.params.clientId, req.params.membershipId);
  res.json({ success: true, data });
}));

router.delete('/clients/:clientId/portal-members/:membershipId', handle(async (req, res) => {
  await crm.revokeClientPortalMembership(req.user.sub, req.params.clientId, req.params.membershipId);
  res.json({ success: true });
}));

router.post('/clients/:clientId/portal-documents', parseClientPortalDocument, handle(async (req, res) => {
  const data = await crm.publishClientPortalDocument(
    req.user.sub, req.params.clientId, req.clientPortalDocument, req.body
  );
  res.status(201).json({ success: true, data });
}));

router.delete('/clients/:clientId/portal-documents/:documentId', handle(async (req, res) => {
  await crm.revokeClientPortalDocument(req.user.sub, req.params.clientId, req.params.documentId);
  res.json({ success: true });
}));
