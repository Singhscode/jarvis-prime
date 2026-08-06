import { Router } from 'express';
import { createAuthMiddleware } from '../../middleware/auth-middleware.js';
import { createRateLimiter } from '../../middleware/rate-limiter.js';
import { parseClientPortalDocument } from '../../middleware/client-portal-document-parser.js';
import * as workspace from './owner-workspace.service.js';

const router = Router();
const handle = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const respond = (res, data, status = 200) => { res.set('Cache-Control', 'private, no-store'); res.status(status).json({ success: true, data }); };
const authorize = (req, _res, next) => Promise.resolve(workspace.assertOwnerWorkspaceAccess(req.user.sub)).then(() => next(), next);
const employeeInvitationLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 5, keyFn: (req) => `owner-employee-invitation:${req.user?.sub || req.ip}`, message: 'Too many employee invitation attempts. Try again later.' });
const automationRunLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10, keyFn: (req) => `owner-automation-run:${req.user?.sub || req.ip}`, message: 'Too many automation requests. Try again later.' });
router.use(createAuthMiddleware());
router.use(authorize);

router.get('/bootstrap', handle(async (req, res) => respond(res, workspace.getBootstrap(req.user))));
router.get('/dashboard', handle(async (req, res) => respond(res, await workspace.getDashboard(req.user.sub))));

router.get('/crm/companies', handle(async (req, res) => respond(res, await workspace.listCrmCompanies(req.user.sub, req.query))));
router.post('/crm/companies', handle(async (req, res) => respond(res, await workspace.createCrmCompany(req.user.sub, req.body), 201)));
router.get('/crm/companies/:id', handle(async (req, res) => respond(res, await workspace.getCrmCompany(req.user.sub, req.params.id))));
router.patch('/crm/companies/:id', handle(async (req, res) => respond(res, await workspace.updateCrmCompany(req.user.sub, req.params.id, req.body))));
router.get('/crm/contacts', handle(async (req, res) => respond(res, await workspace.listCrmContacts(req.user.sub, req.query))));
router.post('/crm/contacts', handle(async (req, res) => respond(res, await workspace.createCrmContact(req.user.sub, req.body), 201)));
router.get('/crm/contacts/:id', handle(async (req, res) => respond(res, await workspace.getCrmContact(req.user.sub, req.params.id))));
router.patch('/crm/contacts/:id', handle(async (req, res) => respond(res, await workspace.updateCrmContact(req.user.sub, req.params.id, req.body))));
router.get('/crm/leads', handle(async (req, res) => respond(res, await workspace.listCrmLeads(req.user.sub, req.query))));
router.post('/crm/leads', handle(async (req, res) => respond(res, await workspace.createCrmLead(req.user.sub, req.body?.contact_id), 201)));
router.get('/crm/leads/:id', handle(async (req, res) => respond(res, await workspace.getCrmLead(req.user.sub, req.params.id))));

router.get('/clients', handle(async (req, res) => respond(res, await workspace.listClients(req.user.sub, req.query))));
router.post('/clients', handle(async (req, res) => respond(res, await workspace.createClient(req.user.sub, req.body), 201)));
router.get('/clients/:clientId', handle(async (req, res) => respond(res, await workspace.getClientDetail(req.user.sub, req.params.clientId, req.query))));
router.patch('/clients/:clientId', handle(async (req, res) => respond(res, await workspace.updateClient(req.user.sub, req.params.clientId, req.body))));
router.get('/clients/:clientId/contacts', handle(async (req, res) => respond(res, (await workspace.getClientDetail(req.user.sub, req.params.clientId, req.query)).contacts)));
router.post('/clients/:clientId/contacts', handle(async (req, res) => respond(res, await workspace.createClientContact(req.user.sub, req.params.clientId, req.body), 201)));
router.patch('/clients/:clientId/contacts/:contactId', handle(async (req, res) => respond(res, await workspace.updateClientContact(req.user.sub, req.params.clientId, req.params.contactId, req.body))));
router.delete('/clients/:clientId/contacts/:contactId', handle(async (req, res) => { await workspace.deleteClientContact(req.user.sub, req.params.clientId, req.params.contactId); respond(res, {}); }));
router.get('/clients/:clientId/portal', handle(async (req, res) => respond(res, await workspace.getClientPortalAdministration(req.user.sub, req.params.clientId, req.query))));
router.post('/clients/:clientId/portal-invitations', handle(async (req, res) => respond(res, await workspace.inviteClientPortalMember(req.user.sub, req.params.clientId, req.body), 201)));
router.post('/clients/:clientId/portal-members/:membershipId/resend', handle(async (req, res) => respond(res, await workspace.resendClientPortalInvitation(req.user.sub, req.params.clientId, req.params.membershipId))));
router.delete('/clients/:clientId/portal-members/:membershipId', handle(async (req, res) => { await workspace.revokeClientPortalMembership(req.user.sub, req.params.clientId, req.params.membershipId); respond(res, {}); }));

router.get('/projects', handle(async (req, res) => respond(res, await workspace.listProjects(req.user.sub, req.query))));
router.post('/projects', handle(async (req, res) => respond(res, await workspace.createProject(req.user.sub, req.body), 201)));
router.get('/projects/:projectId', handle(async (req, res) => respond(res, await workspace.getProjectDetail(req.user.sub, req.params.projectId, req.query))));
router.patch('/projects/:projectId', handle(async (req, res) => respond(res, await workspace.updateProject(req.user.sub, req.params.projectId, req.body))));
router.get('/projects/:projectId/tasks', handle(async (req, res) => respond(res, (await workspace.getProjectDetail(req.user.sub, req.params.projectId, req.query)).tasks)));
router.post('/projects/:projectId/tasks', handle(async (req, res) => respond(res, await workspace.createProjectTask(req.user.sub, req.params.projectId, req.body), 201)));
router.patch('/projects/:projectId/tasks/:taskId', handle(async (req, res) => respond(res, await workspace.updateProjectTask(req.user.sub, req.params.projectId, req.params.taskId, req.body))));
router.get('/tasks', handle(async (req, res) => respond(res, await workspace.listTasks(req.user.sub, req.query))));
router.get('/tasks/:taskId', handle(async (req, res) => respond(res, await workspace.getTaskDetail(req.user.sub, req.params.taskId))));
router.get('/employees', handle(async (req, res) => respond(res, await workspace.listEmployees(req.user.sub, req.query))));
router.post('/employees', employeeInvitationLimiter, handle(async (req, res) => respond(res, await workspace.createEmployeeInvitation(req.user.sub, req.body), 201)));
router.post('/employees/:employeeId/resend-invitation', employeeInvitationLimiter, handle(async (req, res) => respond(res, await workspace.resendEmployeeInvitation(req.user.sub, req.params.employeeId))));
router.get('/employees/:employeeId', handle(async (req, res) => respond(res, await workspace.getEmployeeDetail(req.user.sub, req.params.employeeId, req.query))));
router.post('/automation-runs', automationRunLimiter, handle(async (req, res) => respond(res, await workspace.createAutomationRun(req.user.sub, req.body, req.get('Idempotency-Key')), 202)));
router.get('/automation-runs/:runId', handle(async (req, res) => respond(res, await workspace.getAutomationRun(req.user.sub, req.params.runId))));

router.get('/documents', handle(async (req, res) => respond(res, await workspace.listDocuments(req.user.sub, req.query))));
router.post('/documents', parseClientPortalDocument, handle(async (req, res) => respond(res, await workspace.publishDocument(req.user.sub, req.body, req.clientPortalDocument), 201)));
router.get('/documents/:documentId', handle(async (req, res) => respond(res, await workspace.getDocumentDetail(req.user.sub, req.params.documentId))));
router.delete('/documents/:documentId', handle(async (req, res) => respond(res, await workspace.revokeDocument(req.user.sub, req.params.documentId))));
router.get('/audit', handle(async (req, res) => respond(res, await workspace.listAuditEvents(req.user.sub, req.query))));
router.get('/settings/status', handle(async (_req, res) => respond(res, workspace.getSettingsStatus())));
router.get('/search', handle(async (req, res) => respond(res, await workspace.globalSearch(req.user.sub, req.query))));

export default router;
