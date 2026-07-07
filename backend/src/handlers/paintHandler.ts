import { AppDataSource } from '../config/typeorm';
import { Paint } from '../models/paint.entity';
import { PaintBrush } from '../models/paintBrush.entity';
import { authenticate } from '../middleware/auth';
import { createActivityLog } from './logHandler';

export async function paintRoutes(app: any, prefix = '') {
  const repo = () => AppDataSource.getRepository(Paint);

  app.get(prefix + '/paints', async (ctx: any) => {
    const userId = ctx.user.id;
    const page = parseInt(String(ctx.query.page || '1'));
    const limit = parseInt(String(ctx.query.limit || '20'));
    const search = ctx.query.search || '';

    const qb = (await repo()).createQueryBuilder('paint')
      .where('paint.userId = :userId', { userId })
      .orderBy('paint.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere('paint.title LIKE :search', { search: `%${search}%` });
    }

    const [paintings, total] = await qb.getManyAndCount();

    return {
      data: paintings.map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        thumbnail: p.thumbnail,
        width: p.width,
        height: p.height,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      total,
      page,
      limit,
    };
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'List user paintings' },
  });

  app.get(prefix + '/paints/:id', async (ctx: any) => {
    const userId = ctx.user.id;
    const id = parseInt(ctx.params.id);

    const painting = await (await repo()).findOneBy({ id, userId });
    if (!painting) {
      ctx.set.status = 404;
      return { error: 'Painting not found' };
    }

    return painting;
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Get painting by id' },
  });

  app.post(prefix + '/paints', async (ctx: any) => {
    const userId = ctx.user.id;
    const { title, description, canvasData, width, height, thumbnail } = ctx.body || {};

    const painting = new Paint();
    painting.userId = userId;
    painting.title = title || 'Untitled';
    painting.description = description || null;
    painting.canvasData = canvasData || null;
    painting.width = width || 800;
    painting.height = height || 600;
    painting.thumbnail = thumbnail || null;

    const saved = await (await repo()).save(painting);

    createActivityLog({ userId, action: 'paint:create', targetId: String(saved.id), targetType: 'paint', metadata: { title: saved.title } }).catch(() => {});

    return saved;
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Create new painting' },
  });

  app.put(prefix + '/paints/:id', async (ctx: any) => {
    const userId = ctx.user.id;
    const id = parseInt(ctx.params.id);
    const { title, description, canvasData, width, height, thumbnail } = ctx.body || {};

    const painting = await (await repo()).findOneBy({ id, userId });
    if (!painting) {
      ctx.set.status = 404;
      return { error: 'Painting not found' };
    }

    if (title !== undefined) painting.title = title;
    if (description !== undefined) painting.description = description;
    if (canvasData !== undefined) painting.canvasData = canvasData;
    if (width !== undefined) painting.width = width;
    if (height !== undefined) painting.height = height;
    if (thumbnail !== undefined) painting.thumbnail = thumbnail;

    const saved = await (await repo()).save(painting);

    createActivityLog({ userId, action: 'paint:update', targetId: String(saved.id), targetType: 'paint', metadata: { title: saved.title } }).catch(() => {});

    return saved;
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Update painting' },
  });

  app.delete(prefix + '/paints/:id', async (ctx: any) => {
    const userId = ctx.user.id;
    const id = parseInt(ctx.params.id);

    const painting = await (await repo()).findOneBy({ id, userId });
    if (!painting) {
      ctx.set.status = 404;
      return { error: 'Painting not found' };
    }

    await (await repo()).remove(painting);

    createActivityLog({ userId, action: 'paint:delete', targetId: String(id), targetType: 'paint', metadata: { title: painting.title } }).catch(() => {});

    return { success: true };
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Delete painting' },
  });

  app.post(prefix + '/paints/:id/duplicate', async (ctx: any) => {
    const userId = ctx.user.id;
    const id = parseInt(ctx.params.id);

    const original = await (await repo()).findOneBy({ id, userId });
    if (!original) {
      ctx.set.status = 404;
      return { error: 'Painting not found' };
    }

    const copy = new Paint();
    copy.userId = userId;
    copy.title = `${original.title} (Copy)`;
    copy.description = original.description;
    copy.canvasData = original.canvasData;
    copy.thumbnail = original.thumbnail;
    copy.width = original.width;
    copy.height = original.height;

    const saved = await (await repo()).save(copy);

    createActivityLog({ userId, action: 'paint:duplicate', targetId: String(saved.id), targetType: 'paint', metadata: { title: original.title } }).catch(() => {});

    return saved;
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Duplicate painting' },
  });

  const brushRepo = () => AppDataSource.getRepository(PaintBrush);

  app.get(prefix + '/paints/brushes', async (ctx: any) => {
    const userId = ctx.user.id;
    const brushes = await (await brushRepo()).find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
    return brushes.map(b => ({
      id: b.id, name: b.name, tipShape: b.tipShape,
      settings: typeof b.settings === 'string' ? JSON.parse(b.settings as string) : b.settings,
      isPublic: b.isPublic, downloads: b.downloads, previewData: b.previewData,
      createdAt: b.createdAt, updatedAt: b.updatedAt,
    }));
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'List user brushes' },
  });

  app.get(prefix + '/paints/brushes/community', async (ctx: any) => {
    const page = parseInt(String(ctx.query.page || '1'));
    const limit = parseInt(String(ctx.query.limit || '20'));
    const search = ctx.query.search || '';

    const qb = (await brushRepo()).createQueryBuilder('brush')
      .where('brush.isPublic = :pub', { pub: true })
      .orderBy('brush.downloads', 'DESC')
      .addOrderBy('brush.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere('brush.name LIKE :search', { search: `%${search}%` });
    }

    const [brushes, total] = await qb.getManyAndCount();

    return {
      data: brushes.map(b => ({
        id: b.id, name: b.name, tipShape: b.tipShape,
        settings: typeof b.settings === 'string' ? JSON.parse(b.settings as string) : b.settings,
        downloads: b.downloads, previewData: b.previewData,
        createdAt: b.createdAt, updatedAt: b.updatedAt,
        userId: b.userId,
      })),
      total, page, limit,
    };
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Browse community brushes' },
  });

  app.post(prefix + '/paints/brushes', async (ctx: any) => {
    const userId = ctx.user.id;
    const { name, tipShape, settings, isPublic, previewData } = ctx.body || {};

    const brush = new PaintBrush();
    brush.userId = userId;
    brush.name = name || 'Custom Brush';
    brush.tipShape = tipShape || 'round';
    brush.settings = JSON.stringify(settings || {});
    brush.isPublic = isPublic || false;
    brush.previewData = previewData || null;

    const saved = await (await brushRepo()).save(brush);
    return {
      id: saved.id, name: saved.name, tipShape: saved.tipShape,
      settings: typeof saved.settings === 'string' ? JSON.parse(saved.settings as string) : saved.settings,
      isPublic: saved.isPublic, downloads: saved.downloads, previewData: saved.previewData,
      createdAt: saved.createdAt, updatedAt: saved.updatedAt,
    };
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Create custom brush' },
  });

  app.put(prefix + '/paints/brushes/:id', async (ctx: any) => {
    const userId = ctx.user.id;
    const id = parseInt(ctx.params.id);
    const { name, tipShape, settings, isPublic, previewData } = ctx.body || {};

    const brush = await (await brushRepo()).findOneBy({ id, userId });
    if (!brush) {
      ctx.set.status = 404;
      return { error: 'Brush not found' };
    }

    if (name !== undefined) brush.name = name;
    if (tipShape !== undefined) brush.tipShape = tipShape;
    if (settings !== undefined) brush.settings = JSON.stringify(settings);
    if (isPublic !== undefined) brush.isPublic = isPublic;
    if (previewData !== undefined) brush.previewData = previewData;

    const saved = await (await brushRepo()).save(brush);
    return {
      id: saved.id, name: saved.name, tipShape: saved.tipShape,
      settings: typeof saved.settings === 'string' ? JSON.parse(saved.settings as string) : saved.settings,
      isPublic: saved.isPublic, downloads: saved.downloads, previewData: saved.previewData,
      createdAt: saved.createdAt, updatedAt: saved.updatedAt,
    };
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Update brush' },
  });

  app.delete(prefix + '/paints/brushes/:id', async (ctx: any) => {
    const userId = ctx.user.id;
    const id = parseInt(ctx.params.id);

    const brush = await (await brushRepo()).findOneBy({ id, userId });
    if (!brush) {
      ctx.set.status = 404;
      return { error: 'Brush not found' };
    }

    await (await brushRepo()).remove(brush);
    return { success: true };
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Delete brush' },
  });

  app.post(prefix + '/paints/brushes/:id/publish', async (ctx: any) => {
    const userId = ctx.user.id;
    const id = parseInt(ctx.params.id);

    const brush = await (await brushRepo()).findOneBy({ id, userId });
    if (!brush) {
      ctx.set.status = 404;
      return { error: 'Brush not found' };
    }

    brush.isPublic = !brush.isPublic;
    const saved = await (await brushRepo()).save(brush);
    return { isPublic: saved.isPublic };
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Toggle brush publish status' },
  });

  app.post(prefix + '/paints/brushes/:id/download', async (ctx: any) => {
    const id = parseInt(ctx.params.id);

    const brush = await (await brushRepo()).findOneBy({ id });
    if (!brush) {
      ctx.set.status = 404;
      return { error: 'Brush not found' };
    }

    brush.downloads += 1;
    await (await brushRepo()).save(brush);

    return {
      id: brush.id, name: brush.name, tipShape: brush.tipShape,
      settings: typeof brush.settings === 'string' ? JSON.parse(brush.settings as string) : brush.settings,
      previewData: brush.previewData,
    };
  }, {
    beforeHandle: [authenticate],
    detail: { tags: ['Paint'], summary: 'Download a community brush' },
  });
}