import { AppDataSource } from '../config/typeorm';
import { t } from 'elysia';
import { DatabaseHost } from '../models/databaseHost.entity';
import { ServerDatabase } from '../models/serverDatabase.entity';
import { ServerConfig } from '../models/serverConfig.entity';
import { Node } from '../models/node.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { Not } from 'typeorm';
import * as mariadb from 'mariadb';
import crypto from 'crypto';

function hostRepo() { return AppDataSource.getRepository(DatabaseHost); }
function dbRepo() { return AppDataSource.getRepository(ServerDatabase); }
function cfgRepo() { return AppDataSource.getRepository(ServerConfig); }

async function rootConn(host: DatabaseHost) {
  return mariadb.createConnection({
    host: host.host,
    port: host.port,
    user: host.username,
    password: host.password,
  });
}

function randStr(len: number) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

function uuidSlug(uuid: string) {
  return uuid.replace(/-/g, '').slice(0, 8);
}

export async function databaseRoutes(app: any, prefix = '') {

  app.get(prefix + '/admin/database-hosts', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const hosts = await hostRepo().find({ order: { id: 'ASC' } });
    return hosts.map(h => ({ ...h, password: '***' }));
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'List database hosts (admin)', tags: ['Admin'] },
    response: { 200: t.Array(t.Any()), 403: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/admin/database-hosts', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const { name, host, port = 3306, username, password, nodeId, maxDatabases = 0 } = ctx.body as any;
    if (!name || !host || !username || !password) {
      ctx.set.status = 400;
      return { error: 'name, host, username and password are required' };
    }
    try {
      const conn = await mariadb.createConnection({ host, port, user: username, password });
      await conn.end();
    } catch (e: any) {
      ctx.set.status = 400;
      return { error: `Cannot connect to database server: ${e.message}` };
    }
    const record = hostRepo().create({ name, host, port, username, password, nodeId, maxDatabases });
    await hostRepo().save(record);
    ctx.set.status = 201;
    return { ...record, password: '***' };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Create a database host', tags: ['Admin'] },
    response: { 201: t.Any(), 400: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) }
  });

  app.put(prefix + '/admin/database-hosts/:id', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const { id } = ctx.params as any;
    const h = await hostRepo().findOneBy({ id: Number(id) });
    if (!h) {
      ctx.set.status = 404;
      return { error: 'Database host not found' };
    }
    const { name, host, port, username, password, nodeId, maxDatabases } = ctx.body as any;
    if (name !== undefined) h.name = name;
    if (host !== undefined) h.host = host;
    if (port !== undefined) h.port = port;
    if (username !== undefined) h.username = username;
    if (password !== undefined && password !== '***') h.password = password;
    if (nodeId !== undefined) h.nodeId = nodeId || undefined;
    if (maxDatabases !== undefined) h.maxDatabases = maxDatabases;
    await hostRepo().save(h);
    return { ...h, password: '***' };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Update a database host', tags: ['Admin'] },
    response: { 200: t.Any(), 400: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });

  app.delete(prefix + '/admin/database-hosts/:id', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const { id } = ctx.params as any;
    const h = await hostRepo().findOneBy({ id: Number(id) });
    if (!h) {
      ctx.set.status = 404;
      return { error: 'Database host not found' };
    }
    const inUse = await dbRepo().count({ where: { hostId: h.id } });
    if (inUse > 0) {
      ctx.set.status = 409;
      return { error: `Cannot delete: ${inUse} database(s) are using this host` };
    }
    await hostRepo().delete(h.id);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Delete a database host', tags: ['Admin'] },
    response: { 200: t.Object({ success: t.Boolean() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/admin/database-hosts/:id/test', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const { id } = ctx.params as any;
    const h = await hostRepo().findOneBy({ id: Number(id) });
    if (!h) {
      ctx.set.status = 404;
      return { error: 'Database host not found' };
    }
    try {
      const conn = await rootConn(h);
      await conn.query('SELECT 1');
      await conn.end();
      return { success: true, message: 'Connection successful' };
    } catch (e: any) {
      ctx.set.status = 400;
      return { error: `Connection failed: ${e.message}` };
    }
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Test database host connection (admin)', tags: ['Admin'] },
    response: { 200: t.Object({ success: t.Boolean(), message: t.String() }), 400: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });

  app.get(prefix + '/admin/databases', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const dbs = await dbRepo().find({ order: { createdAt: 'DESC' } });
    return dbs.map(d => ({ ...d, password: '***' }));
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'List all databases (admin)', tags: ['Admin'] },
    response: { 200: t.Array(t.Any()), 403: t.Object({ error: t.String() }) }
  });

  // TODO: Recheck if they work as planned 
  app.get(prefix + '/servers/:id/databases', async (ctx) => {
    const { id } = ctx.params as any;
    const dbs = await dbRepo().findBy({ serverUuid: id });
    return dbs.map(d => ({ ...d, password: '***' }));
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
    detail: { summary: 'List databases for a server', tags: ['Servers'] },
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/servers/:id/databases', async (ctx) => {
    const { id } = ctx.params as any;
    const { label, hostId } = ctx.body as any;

    const cfg = await cfgRepo().findOneBy({ uuid: id });
    if (!cfg) {
      ctx.set.status = 404;
      return { error: 'Server not found' };
    }

    if (cfg.maxDatabases > 0) {
      const existing = await dbRepo().count({ where: { serverUuid: id } });
      if (existing >= cfg.maxDatabases) {
        ctx.set.status = 429;
        return { error: `Database limit reached (${cfg.maxDatabases})` };
      }
    }

    let host: DatabaseHost | null = null;
    if (hostId) {
      host = await hostRepo().findOneBy({ id: Number(hostId) });
    } else {
      const all = await hostRepo().find();
      host = all.find(h => h.nodeId === cfg.nodeId) || all.find(h => !h.nodeId) || null;
    }
    if (!host) {
      ctx.set.status = 400;
      return { error: 'No database host available. Ask an admin to add one.' };
    }

    if (host.maxDatabases > 0) {
      const hostUsed = await dbRepo().count({ where: { hostId: host.id } });
      if (hostUsed >= host.maxDatabases) {
        ctx.set.status = 429;
        return { error: 'Selected database host is at capacity' };
      }
    }

    const slug = uuidSlug(id);
    const suffix = randStr(6);
    const dbName = `s${slug}_${suffix}`; // Unlike pterodactyl we going nuts
    const dbUser = `u${slug}_${suffix}`; // Unlike pterodactyl we going nuts
    const dbPass = randStr(24);

    let conn;
    try {
      conn = await rootConn(host);
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
      await conn.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPass}'`);
      await conn.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
      await conn.query(`FLUSH PRIVILEGES`);
    } catch (e: any) {
      if (conn) await conn.end().catch(() => {});
      ctx.set.status = 500;
      return { error: `Failed to create database: ${e.message}` };
    }
    await conn.end();

    const record = dbRepo().create({
      serverUuid: id,
      hostId: host.id,
      name: dbName,
      username: dbUser,
      password: dbPass,
      label: label || null,
    });
    await dbRepo().save(record);

    ctx.set.status = 201;
    return {
      ...record,
      host: host.host,
      port: host.port,
      jdbc: `jdbc:mysql://${host.host}:${host.port}/${dbName}`,
    };
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    detail: { summary: 'Create a database for a server', tags: ['Servers'] },
    response: { 201: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }), 429: t.Object({ error: t.String() }), 500: t.Object({ error: t.String() }) }
  });

  app.delete(prefix + '/servers/:id/databases/:dbId', async (ctx) => {
    const { id, dbId } = ctx.params as any;
    const db = await dbRepo().findOneBy({ id: Number(dbId), serverUuid: id });
    if (!db) {
      ctx.set.status = 404;
      return { error: 'Database not found' };
    }

    const host = await hostRepo().findOneBy({ id: db.hostId });
    if (host) {
      let conn;
      try {
        conn = await rootConn(host);
        await conn.query(`DROP DATABASE IF EXISTS \`${db.name}\``);
        await conn.query(`DROP USER IF EXISTS '${db.username}'@'%'`);
        await conn.query(`FLUSH PRIVILEGES`);
      } catch {
        // meow
      } finally {
        if (conn) await conn.end().catch(() => {});
      }
    }
    await dbRepo().delete(db.id);
    return { success: true };
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    detail: { summary: 'Delete a database for a server', tags: ['Servers'] },
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });

  app.get(prefix + '/servers/:id/databases/:dbId/credentials', async (ctx) => {
    const { id, dbId } = ctx.params as any;
    const db = await dbRepo().findOneBy({ id: Number(dbId), serverUuid: id });
    if (!db) {
      ctx.set.status = 404;
      return { error: 'Database not found' };
    }
    const host = await hostRepo().findOneBy({ id: db.hostId });
    return {
      host: host?.host || '',
      port: host?.port || 3306,
      name: db.name,
      username: db.username,
      password: db.password,
      jdbc: `jdbc:mysql://${host?.host || ''}:${host?.port || 3306}/${db.name}`,
    };
  }, {
    beforeHandle: [authenticate, authorize('servers:read')],
    detail: { summary: 'Get database credentials', tags: ['Servers'] },
    response: { 200: t.Object({ host: t.String(), port: t.Number(), name: t.String(), username: t.String(), password: t.String(), jdbc: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });

  app.put(prefix + '/servers/:id/databases/:dbId', async (ctx) => {
    const { id, dbId } = ctx.params as any;
    const { label } = ctx.body as any;
    const db = await dbRepo().findOneBy({ id: Number(dbId), serverUuid: id });
    if (!db) {
      ctx.set.status = 404;
      return { error: 'Database not found' };
    }
    db.label = label;
    await dbRepo().save(db);
    return { ...db, password: '***' };
  }, {
    beforeHandle: [authenticate, authorize('servers:write')],
    detail: { summary: 'Update a database label', tags: ['Servers'] },
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });
}

function isAdmin(ctx: any): boolean {
  const user = (ctx as any).user as any;
  if (!user) { ctx.set.status = 401; (ctx as any).body = { error: 'Unauthorized' }; return false; }
  if (!['admin', 'rootAdmin', '*'].includes(user.role ?? '')) {
    ctx.set.status = 403; (ctx as any).body = { error: 'Admin access required' };
    return false;
  }
  return true;
}
