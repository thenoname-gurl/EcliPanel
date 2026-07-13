import { Elysia } from 'elysia';

import { userRoutes } from '../handlers/userHandler';
import { sessionRoutes } from '../handlers/sessionHandler';
import { authRoutes } from '../handlers/authHandler';
import { logRoutes } from '../handlers/logHandler';
import { idVerificationRoutes } from '../handlers/idVerificationHandler';
import { deletionRoutes } from '../handlers/deletionHandler';
import { roleRoutes } from '../handlers/roleHandler';
import { organisationRoutes } from '../handlers/organisationHandler';
import { orderRoutes } from '../handlers/orderHandler';
import { couponRoutes } from '../handlers/couponHandler';
import { socRoutes } from '../handlers/socHandler';
import { aiRoutes } from '../handlers/aiHandler';
import { serverRoutes } from '../handlers/serverHandler';
import { nodeRoutes } from '../handlers/nodeHandler';
import { apiKeyRoutes } from '../handlers/apiKeyHandler';
import { ticketRoutes } from '../handlers/ticketHandler';
import { adminRoutes } from '../handlers/adminHandler';
import { eggRoutes } from '../handlers/eggHandler';
import { remoteRoutes } from '../handlers/remoteHandler';
import { oauthRoutes, oauthWellKnownRoutes } from '../handlers/oauthHandler';
import { databaseRoutes } from '../handlers/databaseHandler';
import { planRoutes } from '../handlers/planHandler';
import { regionalPriceRoutes } from '../handlers/regionalPriceHandler';
import { serverSubuserRoutes } from '../handlers/serverSubuserHandler';
import { wsProxyRoutes } from '../handlers/wsProxyHandler';
import { tunnelRoutes } from '../handlers/tunnelHandler';
import { sshKeyRoutes } from '../handlers/sshKeyHandler';
import { rolloutRoutes } from '../handlers/rolloutHandler';
import { feedbackRoutes } from '../handlers/feedbackHandler';
import { calendarRoutes } from '../handlers/calendarHandler';
import { chatRoutes } from '../handlers/chatHandler';
import { publicRoutes } from '../handlers/publicHandler';
import { applicationRoutes } from '../handlers/applicationHandler';
import { visualEditorRoutes } from '../handlers/visualEditorHandler';
import { sharedFileRoutes, publicSharedFileRoutes } from '../handlers/sharedFileHandler';
import { paymentRoutes } from '../handlers/paymentHandler';
import { eloRoutes } from '../handlers/eloHandler';
import { slackRoutes } from '../handlers/slackHandler';
import { proxyRoutes } from '../handlers/proxyHandler';
import { isFeatureEnabled } from '../utils/featureToggles';
// Migrating  to Elysia was a mistake but now its bulletproof?
// Elysia 2 is amazing but hell they did a lot of changes :sob:
export function registerRoutes(app: any) {
  // Elysia 2 swapped argument order: (path, handler, opts) > (path, opts, handler)
  // Shim the HTTP methods to accept both orders for backward compat cuz I don't want to rewrite all the routes
  const compatMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'all'];
  for (const m of compatMethods) {
    const orig = app[m];
    app[m] = function (path: string, ...args: any[]) {
      // Old: (path, handler, opts?) > first arg after path is a function
      // New: (path, opts?, handler) > first arg after path is an object
      if (args.length >= 1 && typeof args[0] === 'function') {
        const [handler, ...rest] = args;
        return orig.call(this, path, ...rest, handler);
      }
      return orig.call(this, path, ...args);
    };
  }

  app.request(async (ctx: any) => {
    const requestUrl = String(ctx.request.url || '');
    let path = requestUrl;
    try {
      path = new URL(requestUrl, 'http://localhost').pathname;
    } catch {
      // skip
    }

    const checks: Array<{ prefix: string; feature: string; matcher?: (p: string) => boolean }> = [
      { prefix: '/api/ai', feature: 'ai' },
      { prefix: '/api/tickets', feature: 'ticketing' },
      { prefix: '/api/admin/tickets', feature: 'ticketing' },
      { prefix: '/api/applications', feature: 'applications' },
      { prefix: '/api/admin/applications', feature: 'applications' },
      { prefix: '/api/public/applications', feature: 'applications' },
      { prefix: '/api/orders', feature: 'billing' },
      { prefix: '/api/admin/orders', feature: 'billing' },
      { prefix: '/api/payments', feature: 'billing' },
      { prefix: '/api/plans', feature: 'billing' },
      { prefix: '/api/coupons', feature: 'billing' },
      { prefix: '/api/admin/coupons', feature: 'billing' },
      { prefix: '/api/oauth', feature: 'oauth' },
      { prefix: '/api/tunnel', feature: 'tunnels' },
      { prefix: '/api/users/register', feature: 'registration' },
      { prefix: '/api/elo', feature: 'elo' },
      { prefix: '/api/admin/elo', feature: 'elo' },
      { prefix: '/api/calendar', feature: 'calendar' },
      { prefix: '/api/chat', feature: 'chat' },
      { prefix: '/api/ws/chat', feature: 'chat' },
    ];

    for (const check of checks) {
      if (path.startsWith(check.prefix)) {
        const enabled = await isFeatureEnabled(check.feature);
        if (!enabled) {
          ctx.set.status = 503;
          return { error: ctx.t('common.featureDisabled', `Feature '${check.feature}' is disabled`) };
        }
      }
    }

    if (path.startsWith('/api/organisations/') && path.includes('/dns/')) {
      const enabled = await isFeatureEnabled('dns');
      if (!enabled) {
        ctx.set.status = 503;
        return { error: ctx.t('organisation.featureDnsIsDisabled') };
      }
    }

    if (path.startsWith('/.well-known/oauth-authorization-server')) {
      const enabled = await isFeatureEnabled('oauth');
      if (!enabled) {
        ctx.set.status = 503;
        return { error: ctx.t('auth.featureOauthIsDisabled') };
      }
    }
  });

  app.get('/favicon.ico', () => new Response(null, { status: 204 }));

  // Bro, they like fr joking, elysia 2 openapi plugin moved /api/openapi.json to /openapi/json
  app.get('/api/openapi.json', async () => {
    const res = await app.handle(new Request('http://localhost/openapi/json'));
    return new Response(res.body, { headers: { 'Content-Type': 'application/json' } });
  });

  userRoutes(app, '/api');
  sessionRoutes(app, '/api');
  authRoutes(app, '/api');
  logRoutes(app, '/api');
  deletionRoutes(app, '/api');
  idVerificationRoutes(app, '/api');
  roleRoutes(app, '/api');
  organisationRoutes(app, '/api');
  orderRoutes(app, '/api');
  couponRoutes(app, '/api');
  socRoutes(app, '/api');
  aiRoutes(app, '/api');
  serverRoutes(app, '/api');
  sharedFileRoutes(app, '/api');
  nodeRoutes(app, '/api');
  apiKeyRoutes(app, '/api');
  ticketRoutes(app, '/api');
  adminRoutes(app, '/api');
  eggRoutes(app, '/api');
  remoteRoutes(app, '/api');
  oauthRoutes(app, '/api');
  oauthWellKnownRoutes(app, '/api');
  databaseRoutes(app, '/api');
  planRoutes(app, '/api');
  regionalPriceRoutes(app, '/api');
  wsProxyRoutes(app, '/api');
  tunnelRoutes(app, '/api');
  sshKeyRoutes(app, '/api');
  serverSubuserRoutes(app, '/api');
  rolloutRoutes(app, '/api');
  feedbackRoutes(app, '/api');
  publicRoutes(app, '');
  publicSharedFileRoutes(app, '');
  applicationRoutes(app, '/api');
  visualEditorRoutes(app, '/api');
  paymentRoutes(app, '/api');
  eloRoutes(app, '/api');
  slackRoutes(app, '/api');
  calendarRoutes(app, '/api');
  chatRoutes(app, '/api');
  proxyRoutes(app, '/api');
}