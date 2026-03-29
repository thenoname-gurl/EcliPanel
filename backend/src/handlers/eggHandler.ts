import { AppDataSource } from '../config/typeorm';
import { Egg } from '../models/egg.entity';
import { User } from '../models/user.entity';
import { authenticate } from '../middleware/auth';
import { t } from 'elysia';
import { nodeService } from '../services/nodeService';

function requireAdminCtx(ctx: any): boolean {
  const user = ctx.user as User | undefined;
  const apiKey = ctx.apiKey;
  if (apiKey?.type === 'admin') return true;
  if (!user) {
    ctx.set.status = 401;
    ctx.body = { error: 'Unauthorized' };
    return false;
  }
  const adminRoles = ['admin', 'rootAdmin', '*'];
  if (!adminRoles.includes(user.role ?? '')) {
    ctx.set.status = 403;
    ctx.body = { error: 'Admin access required.' };
    return false;
  }
  return true;
}

export async function eggRoutes(app: any, prefix = '') {
  const repo = () => AppDataSource.getRepository(Egg);

  app.get(prefix + '/eggs', async (ctx) => {
    const user = (ctx as any).user;
    const isAdmin = user && (user.role === 'admin' || user.role === 'rootAdmin' || user.role === '*');
    if (isAdmin) {
      return await repo().find({ order: { name: 'ASC' } });
    }
    return await repo().find({ where: { visible: true }, order: { name: 'ASC' } });
  }, {
   beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List visible eggs (admins see all)', tags: ['Eggs'] },
  });

  app.get(prefix + '/eggs/:id', async (ctx) => {
    const egg = await repo().findOneBy({ id: Number(ctx.params.id) });
    if (!egg) {
      ctx.set.status = 404;
      return { error: 'Egg not found' };
    }
    return egg;
  }, {
   beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Get a specific egg', tags: ['Eggs'] },
  });

  app.get(prefix + '/admin/eggs', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    //scary
    const rows = await AppDataSource.manager.query('SELECT * FROM egg ORDER BY name ASC');
    const jsonFields = ['dockerImages', 'envVars', 'configFiles', 'processConfig', 'installScript', 'features', 'fileDenylist', 'allowedPortals'];
    const eggs = (rows as any[]).map((r: any) => {
      for (const f of jsonFields) {
        if (r[f] === null || r[f] === undefined) continue;
        if (typeof r[f] === 'string') {
          try { r[f] = JSON.parse(r[f]); } catch { r[f] = null; }
        }
      }
      return r;
    });
    return eggs;
  }, {
   beforeHandle: authenticate,
    response: {
      200: t.Array(t.Any()),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'List all eggs (admin)', tags: ['Eggs'] },
  });

  app.post(prefix + '/admin/eggs', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const { name, description, dockerImage, startup, envVars, configFiles, visible, allowedPortals, rootless } = ctx.body as any;
    if (!name || !dockerImage || !startup) {
      ctx.set.status = 400;
      return { error: 'name, dockerImage and startup are required' };
    }
    const egg = repo().create({ name, description, dockerImage, startup, envVars, configFiles, visible: visible ?? true, allowedPortals, rootless: !!rootless });
    await repo().save(egg);
    ctx.set.status = 201;

    void (async () => {
      try {
        const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
        const configs = await cfgRepo.findBy({ eggId: egg.id });
        for (const c of configs) {
          try {
            if (c.autoSyncOnEggChange === false) continue;
            const svc = await nodeService.getServiceForNode(c.nodeId).catch(() => null);
            if (!svc) continue;
            await svc.syncServer(c.uuid, {}).catch(() => {});
          } catch (_) {}
        }
      } catch (_) {}
    })();

    return egg;
  }, {
   beforeHandle: authenticate,
    schema: {
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        dockerImage: t.String(),
        startup: t.String(),
        envVars: t.Optional(t.Any()),
        configFiles: t.Optional(t.Any()),
        visible: t.Optional(t.Boolean()),
        allowedPortals: t.Optional(t.Array(t.String())),
      }),
      response: {
        201: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Create a new egg', tags: ['Eggs'] },
  });

  app.put(prefix + '/admin/eggs/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const egg = await repo().findOneBy({ id: Number(ctx.params.id) });
    if (!egg) {
      ctx.set.status = 404;
      return { error: 'Egg not found' };
    }

    const {
      name, description, author, dockerImage, dockerImages, startup,
      envVars, configFiles, processConfig, installScript, features,
      fileDenylist, updateUrl, visible, allowedPortals,
      rootless,
    } = ctx.body as any;
    if (name !== undefined) egg.name = name;
    if (description !== undefined) egg.description = description;
    if (author !== undefined) egg.author = author;
    if (dockerImage !== undefined) egg.dockerImage = dockerImage;
    if (dockerImages !== undefined) egg.dockerImages = dockerImages;
    if (startup !== undefined) egg.startup = startup;
    if (envVars !== undefined) egg.envVars = envVars;
    if (configFiles !== undefined) egg.configFiles = configFiles;
    if (processConfig !== undefined) egg.processConfig = processConfig;
    if (installScript !== undefined) egg.installScript = installScript;
    if (features !== undefined) egg.features = features;
    if (fileDenylist !== undefined) egg.fileDenylist = fileDenylist;
    if (updateUrl !== undefined) egg.updateUrl = updateUrl;
    if (visible !== undefined) egg.visible = visible;
    if (allowedPortals !== undefined) egg.allowedPortals = allowedPortals;
    if (rootless !== undefined) egg.rootless = !!rootless;

    await repo().save(egg);

    void (async () => {
      try {
        const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
        const configs = await cfgRepo.findBy({ eggId: egg.id });
        for (const c of configs) {
          try {
            if (c.autoSyncOnEggChange === false) continue;
            const svc = await nodeService.getServiceForNode(c.nodeId).catch(() => null);
            if (!svc) continue;
            await svc.syncServer(c.uuid, {}).catch(() => {});
          } catch (_) {}
        }
      } catch (_) {}
    })();

    return egg;
  }, {
   beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Any(),
      response: {
        200: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Edit an egg', tags: ['Eggs'] },
  });

  app.delete(prefix + '/admin/eggs/:id', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const egg = await repo().findOneBy({ id: Number(ctx.params.id) });
    if (!egg) {
      ctx.set.status = 404;
      return { error: 'Egg not found' };
    }
    await repo().remove(egg);
    return { success: true };
  }, {
   beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Delete an egg', tags: ['Eggs'] },
  });

  app.post(prefix + '/admin/eggs/:id/sync', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    const eggId = Number(ctx.params.id);
    const { respectOptOut = false } = ctx.body as any;
    const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
    const configs = await cfgRepo.findBy({ eggId });
    const results: any[] = [];
    for (const c of configs) {
      try {
        if (respectOptOut && c.autoSyncOnEggChange === false) {
          results.push({ uuid: c.uuid, status: 'skipped_opt_out' });
          continue;
        }
        const svc = await nodeService.getServiceForNode(c.nodeId).catch(() => null);
        if (!svc) {
          results.push({ uuid: c.uuid, status: 'node_service_unavailable' });
          continue;
        }
        await svc.syncServer(c.uuid, {});
        results.push({ uuid: c.uuid, status: 'synced' });
      } catch (e: any) {
        results.push({ uuid: c.uuid, status: 'error', error: e?.message ?? String(e) });
      }
    }
    return { total: configs.length, results };
  }, {
    beforeHandle: authenticate,
    schema: {
      params: t.Object({ id: t.String() }),
      body: t.Object({ respectOptOut: t.Optional(t.Boolean()) }),
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Force-sync all servers for an egg (admin)', tags: ['Eggs'] },
  });

  app.delete(prefix + '/admin/eggs', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;
    await repo().createQueryBuilder().delete().execute();
    return { success: true };
  }, {
   beforeHandle: authenticate,
    response: {
      200: t.Object({ success: t.Boolean() }),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
    },
    detail: { summary: 'Delete all eggs', tags: ['Eggs'] },
  });


  app.post(prefix + '/admin/eggs/import', async (ctx) => {
    if (!requireAdminCtx(ctx)) return;

    let raw: Record<string, any>;
    const body = ctx.body as any;

    if (body?.url) {
      try {
        const response = await fetch(body.url as string);
        if (!response.ok) {
          ctx.set.status = 400;
          return { error: `Failed to fetch egg from URL: HTTP ${response.status}` };
        }
        raw = await response.json() as Record<string, any>;
      } catch (err: any) {
        ctx.set.status = 400;
        return { error: `Could not fetch or parse egg URL: ${err?.message ?? err}` };
      }
    } else if (body?.json) {
      raw = body.json as Record<string, any>;
    } else {
      ctx.set.status = 400;
      return { error: 'Provide either json or url in the request body' };
    }

    const version: string = raw?.meta?.version ?? 'PTDL_v1';

    const name: string = raw.name ?? 'Imported Egg';
    const description: string = raw.description ?? '';
    const author: string = raw.author ?? '';
    const updateUrl: string | undefined = raw?.meta?.update_url ?? undefined;

    let dockerImage: string;
    let dockerImages: Record<string, string> | undefined;

    if (version === 'PTDL_v2' && raw.docker_images && typeof raw.docker_images === 'object') {
      dockerImages = raw.docker_images as Record<string, string>;
      const values = Object.values(dockerImages);
      dockerImage = values[values.length - 1] as string;
    } else {
      dockerImage = (raw.docker_images as any) ?? raw.image ?? '';
      if (typeof dockerImage === 'object') {
        // Somehow got an object anyway??? MF WHAT???
        // I SWEAR THIS IS DIABOLICALLLLLLLLY STUPID 
        // BUT IM TOO SCARED TO QUESTION IT BECAUSE 
        // IT SEEMS SOME EGGS OUT THERE ACTUALLY DO THIS SH
        const vals = Object.values(dockerImage as any) as string[];
        dockerImage = vals[vals.length - 1] ?? '';
        dockerImages = (raw.docker_images as Record<string, string>) ?? undefined;
      }
    }

    if (!dockerImage) {
      ctx.set.status = 400;
      return { error: 'Egg JSON does not contain a docker image' };
    }

    const startup: string = raw.startup ?? '';

    // PTDL_v2 uses "variables" while PTDL_v1 uses "env"
    // JUST WHYYYYYY
    const rawVars: Record<string, any>[] = raw.variables ?? raw.env ?? [];
    const envVars = rawVars.map((v: any) => ({
      name: v.name ?? '',
      description: v.description ?? '',
      env_variable: v.env_variable ?? '',
      default_value: v.default_value ?? '',
      user_viewable: v.user_viewable ?? true,
      user_editable: v.user_editable ?? true,
      rules: v.rules ?? '',
      field_type: v.field_type ?? 'text',
    }));

    let configFiles: Record<string, string> | undefined;
    if (raw.config?.files) {
      try {
        configFiles = typeof raw.config.files === 'string'
          ? JSON.parse(raw.config.files)
          : raw.config.files;
      } catch {
        configFiles = undefined;
      }
    }

    let processConfig: Record<string, any> | undefined;
    const cfgStartup: Record<string, any> = (() => {
      if (!raw.config?.startup) return {};
      try {
        return typeof raw.config.startup === 'string'
          ? JSON.parse(raw.config.startup)
          : raw.config.startup;
      } catch { return {}; }
    })();

    const cfgLogs: Record<string, any> = (() => {
      if (!raw.config?.logs) return {};
      try {
        return typeof raw.config.logs === 'string'
          ? JSON.parse(raw.config.logs)
          : raw.config.logs;
      } catch { return {}; }
    })();

    const stopValue: string = raw.config?.stop ?? 'stop';

    processConfig = {
      startup: {
        done: cfgStartup.done ?? [],
        user_interaction: cfgStartup.userInteraction ?? cfgStartup.user_interaction ?? [],
        strip_ansi: cfgStartup.strip_ansi ?? false,
      },
      stop: {
        type: stopValue === 'SIGKILL' ? 'kill'
          : stopValue === 'SIGTERM' ? 'stop'
          : 'command',
        value: stopValue,
      },
      configs: cfgLogs.custom ?? [],
    };

    let installScript: Record<string, any> | undefined;
    if (raw.scripts?.installation) {
      installScript = {
        container: raw.scripts.installation.container ?? 'ghcr.io/pterodactyl/installers:debian',
        entrypoint: raw.scripts.installation.entrypoint ?? 'bash',
        script: raw.scripts.installation.script ?? '',
      };
    }

    const features: string[] | undefined = Array.isArray(raw.features) ? raw.features : undefined;
    const fileDenylist: string[] | undefined = Array.isArray(raw.file_denylist) ? raw.file_denylist : undefined;

    const egg = repo().create({
      name,
      description,
      author,
      dockerImage,
      dockerImages,
      startup,
      envVars,
      configFiles,
      processConfig,
      installScript,
      features,
      fileDenylist,
      updateUrl,
      rootless: Boolean(raw?.meta?.rootless ?? raw?.rootless ?? false),
      visible: true,
    });

    await repo().save(egg);
    ctx.set.status = 201;

    void (async () => {
      try {
        const cfgRepo = AppDataSource.getRepository(require('../models/serverConfig.entity').ServerConfig);
        const configs = await cfgRepo.findBy({ eggId: egg.id });
        for (const c of configs) {
          try {
            if (c.autoSyncOnEggChange === false) continue;
            const svc = await nodeService.getServiceForNode(c.nodeId).catch(() => null);
            if (!svc) continue;
            await svc.syncServer(c.uuid, {}).catch(() => {});
          } catch (_) {}
        }
      } catch (_) {}
    })();

    return egg;
  }, {
   beforeHandle: authenticate,
    schema: {
      body: t.Object({ url: t.Optional(t.String()), json: t.Optional(t.Any()) }),
      response: {
        201: t.Any(),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
    },
    detail: { summary: 'Import an egg from JSON or URL', tags: ['Eggs'] },
  });
}
