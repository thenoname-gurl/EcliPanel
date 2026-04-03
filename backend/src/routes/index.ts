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
import { serverSubuserRoutes } from '../handlers/serverSubuserHandler';
import { wsProxyRoutes } from '../handlers/wsProxyHandler';
import { sshKeyRoutes } from '../handlers/sshKeyHandler';
import { publicRoutes } from '../handlers/publicHandler';
import { applicationRoutes } from '../handlers/applicationHandler';
import { isFeatureEnabled } from '../utils/featureToggles';
// Migrating  to Elysia was a mistake but now its bulletproof?

export function registerRoutes(app: any) {
    app.onRequest(async (ctx: any) => {
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
        { prefix: '/api/plans', feature: 'billing' },
        { prefix: '/api/infrastructure/code-instances', feature: 'codeInstances' },
        { prefix: '/api/oauth', feature: 'oauth' },
        { prefix: '/api/users/register', feature: 'registration' },
      ];

      for (const check of checks) {
        if (path.startsWith(check.prefix)) {
          const enabled = await isFeatureEnabled(check.feature);
          if (!enabled) {
            ctx.set.status = 503;
            return { error: `Feature '${check.feature}' is disabled` };
          }
        }
      }

      if (path.startsWith('/api/organisations/') && path.includes('/dns/')) {
        const enabled = await isFeatureEnabled('dns');
        if (!enabled) {
          ctx.set.status = 503;
          return { error: "Feature 'dns' is disabled" };
        }
      }

      if (path.startsWith('/.well-known/oauth-authorization-server')) {
        const enabled = await isFeatureEnabled('oauth');
        if (!enabled) {
          ctx.set.status = 503;
          return { error: "Feature 'oauth' is disabled" };
        }
      }
    });

    app.get('/favicon.ico', () => new Response(null, { status: 204 }));
    userRoutes(app, '/api');
    sessionRoutes(app, '/api');
    authRoutes(app, '/api');
    logRoutes(app, '/api');
    deletionRoutes(app, '/api');
    idVerificationRoutes(app, '/api');
    roleRoutes(app, '/api');
    organisationRoutes(app, '/api');
    orderRoutes(app, '/api');
    socRoutes(app, '/api');
    aiRoutes(app, '/api');
    serverRoutes(app, '/api');
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
    wsProxyRoutes(app, '/api');
    sshKeyRoutes(app, '/api');
    serverSubuserRoutes(app, '/api');
    publicRoutes(app, '');
    applicationRoutes(app, '/api');
}