import { DataSource } from 'typeorm';
import { SlowQueryRecord, addSlowQuery } from '../utils/slowQueryCollector';

function getDataSourceOptions() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const u = new URL(url);
    const type = u.protocol.replace(/:$/, '');
    const driver = type === 'postgres' || type === 'postgresql' ? 'postgres' : type;

    const opts: any = {
      type: driver as any,
      host: u.hostname,
      port: Number(u.port) || (driver === 'postgres' ? 5432 : 3306),
      username: u.username,
      password: u.password,
      database: u.pathname.replace(/^\//, ''),
    };

    if (u.searchParams.has('ssl')) {
      const raw = u.searchParams.get('ssl')!;
      try {
        opts.ssl = JSON.parse(raw);
      } catch {
        opts.ssl = raw;
      }
    }

    return opts;
  }

  const base: any = {
    type: (process.env.DB_TYPE as any) || 'mariadb',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'panel',
  };

  if (process.env.DB_SSL) {
    try {
      base.ssl = JSON.parse(process.env.DB_SSL);
    } catch {
      base.ssl = process.env.DB_SSL;
    }
  }

  return base;
}

class SlowQueryLogger {
  logQuery(): void {}
  logQueryError(error: string | Error, query: string, parameters?: any[]) {}
  logQuerySlow(time: number, query: string, parameters?: any[]) {
    addSlowQuery({
      timestamp: new Date().toISOString(),
      durationMs: time,
      query,
      parameters,
    });
    if (process.env.DB_LOG_QUERIES) {
      console.warn(`[slow-query] ${time}ms`, query, parameters);
    }
  }
  logSchemaBuild(message: string): void {}
  logMigration(message: string): void {}
  log(level: 'log' | 'info' | 'warn', message: any): void {}
}

export const AppDataSource = new DataSource({
  ...getDataSourceOptions(),
  synchronize: true,
  logging: process.env.DB_LOG_QUERIES ? ['error'] : false,
  logger: new SlowQueryLogger(),
  maxQueryExecutionTime: Number(process.env.DB_MAX_QUERY_MS || 200),
  entities: [
    require('../models/user.entity').User,
    require('../models/organisation.entity').Organisation,
    require('../models/organisationInvite.entity').OrganisationInvite,
    require('../models/order.entity').Order,
    require('../models/userLog.entity').UserLog,
    require('../models/idVerification.entity').IDVerification,
    require('../models/legalDocument.entity').LegalDocument,
    require('../models/deletionRequest.entity').DeletionRequest,
    require('../models/role.entity').Role,
    require('../models/permission.entity').Permission,
    require('../models/userRole.entity').UserRole,
    require('../models/passkey.entity').Passkey,
    require('../models/plan.entity').Plan,
    require('../models/socData.entity').SocData,
    require('../models/aiModel.entity').AIModel,
    require('../models/aiModelUser.entity').AIModelUser,
    require('../models/aiModelOrg.entity').AIModelOrg,
    require('../models/apiRequestLog.entity').ApiRequestLog,
    require('../models/aiUsage.entity').AIUsage,
    require('../models/node.entity').Node,
    require('../models/serverMapping.entity').ServerMapping,
    require('../models/apiKey.entity').ApiKey,
    require('../models/ticket.entity').Ticket,
    require('../models/egg.entity').Egg,
    require('../models/serverConfig.entity').ServerConfig,
    require('../models/nodeHeartbeat.entity').NodeHeartbeat,
    require('../models/oauthApp.entity').OAuthApp,
    require('../models/oauthAuthCode.entity').OAuthAuthCode,
    require('../models/oauthToken.entity').OAuthToken,
    require('../models/panelSetting.entity').PanelSetting,
    require('../models/mount.entity').Mount,
    require('../models/serverMount.entity').ServerMount,
    require('../models/databaseHost.entity').DatabaseHost,
    require('../models/serverDatabase.entity').ServerDatabase,
    require('../models/serverSubuser.entity').ServerSubuser,
    require('../models/sshKey.entity').SshKey,
  ],
});