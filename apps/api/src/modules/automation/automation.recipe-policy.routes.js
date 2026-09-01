import { Router } from 'express';
import { createAuthMiddleware } from '../../middleware/auth-middleware.js';
import { createRateLimiter } from '../../middleware/rate-limiter.js';
import * as recipes from './automation.recipe-policy.service.js';

const router = Router();
const handle = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const respond = (res, data, status = 200) => { res.set('Cache-Control', 'private, no-store'); res.status(status).json({ success: true, data }); };
const mutationLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 30, keyFn: (req) => `automation-recipe:${req.user?.sub || req.ip}`, message: 'Too many recipe governance attempts. Try again later.' });

router.use(createAuthMiddleware());
router.get('/policies', handle(async (req, res) => respond(res, await recipes.getPolicyRegistry(req.user.sub))));
router.post('/policies/score/evaluations', mutationLimiter, handle(async (req, res) => respond(res, await recipes.evaluateScorePolicy(req.user.sub, req.body, req.get('Idempotency-Key')), 201)));
router.get('/recipes', handle(async (req, res) => respond(res, await recipes.listRecipes(req.user.sub, req.query))));
router.get('/recipes/assigned', handle(async (req, res) => respond(res, await recipes.listAssignedRecipes(req.user.sub))));
router.get('/recipes/assigned/:recipeCode', handle(async (req, res) => respond(res, await recipes.getAssignedRecipe(req.user.sub, req.params.recipeCode))));
router.get('/assignments', handle(async (req, res) => respond(res, await recipes.getOwnerAssignmentProjection(req.user.sub))));
router.get('/automation-health', handle(async (req, res) => respond(res, await recipes.getOwnerAutomationHealth(req.user.sub))));
router.post('/recipes', mutationLimiter, handle(async (req, res) => respond(res, await recipes.createRecipe(req.user.sub, req.body), 201)));
router.get('/recipes/:recipeId', handle(async (req, res) => respond(res, await recipes.getRecipe(req.user.sub, req.params.recipeId))));
router.post('/recipes/:recipeId/versions', mutationLimiter, handle(async (req, res) => respond(res, await recipes.createRecipeVersion(req.user.sub, req.params.recipeId, req.body), 201)));
router.post('/recipes/:recipeId/lifecycle', mutationLimiter, handle(async (req, res) => respond(res, await recipes.transitionRecipe(req.user.sub, req.params.recipeId, req.body))));
router.put('/recipe-versions/:recipeVersionId/assignment', mutationLimiter, handle(async (req, res) => respond(res, await recipes.upsertAssignment(req.user.sub, req.params.recipeVersionId, req.body))));

export default router;
