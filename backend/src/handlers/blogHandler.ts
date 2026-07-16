import { AppDataSource } from '../config/typeorm';
import { In, IsNull, LessThanOrEqual } from 'typeorm';
import { Blog } from '../models/blog.entity';
import { BlogPost } from '../models/blogPost.entity';
import { BlogMember } from '../models/blogMember.entity';
import { BlogSubscriber } from '../models/blogSubscriber.entity';
import { ChatChannel } from '../models/chatChannel.entity';
import { ChatMessage } from '../models/chatMessage.entity';
import { User } from '../models/user.entity';
import { Organisation } from '../models/organisation.entity';
import { OrganisationMember } from '../models/organisationMember.entity';
import { authenticate, optionalAuth } from '../middleware/auth';
import { authorize, hasPermissionSync } from '../middleware/authorize';
import { requireFeature } from '../middleware/featureToggle';
import { createActivityLog } from './logHandler';
import { t } from 'elysia';
import * as path from 'path';
import * as fs from 'fs';

const POST_PAGE_SIZE = 20;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

async function requireBlogFeature(ctx: any): Promise<true | { error: string }> {
  return requireFeature(ctx, 'blog');
}

async function canManageBlog(blogId: number, userId: number): Promise<boolean> {
  const blogRepo = AppDataSource.getRepository(Blog);
  const blog = await blogRepo.findOne({ where: { id: blogId } });
  if (!blog) return false;
  if (blog.userId === userId) return true;

  const memberRepo = AppDataSource.getRepository(BlogMember);
  const member = await memberRepo.findOne({ where: { blogId, userId } });
  return member?.role === 'owner' || member?.role === 'admin';
}

export async function blogRoutes(app: any, prefix = '') {
  app.get(
    prefix + '/public/blog/check-slug',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const raw = String(ctx.query?.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!raw || raw.length < 2) {
        return { available: false, reason: 'too_short' };
      }

      const reserved = ['new', 'edit', 'settings', 'admin', 'api', 'dashboard', 'login', 'register',
        'create', 'builder', 'members', 'posts', 'mine', 'check-slug', 'subscribe'];
      if (reserved.includes(raw)) {
        return { available: false, reason: 'reserved' };
      }

      const repo = AppDataSource.getRepository(Blog);
      const existing = await repo.findOne({ where: { slug: raw } });
      return { available: !existing, slug: raw };
    },
    {
      detail: { summary: 'Check if a blog slug is available', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/public/blog/:slug',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { slug: ctx.params.slug } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const userRepo = AppDataSource.getRepository(User);
      const owner = await userRepo.findOne({ where: { id: blog.userId } });
      const memberRepo = AppDataSource.getRepository(BlogMember);
      const ownerMember = await memberRepo.findOne({ where: { blogId: blog.id, userId: blog.userId } });

      return {
        id: blog.id,
        slug: blog.slug,
        name: blog.name,
        description: blog.description,
        coverImageUrl: blog.coverImageUrl,
        visibility: blog.visibility,
        contentFlags: blog.contentFlags,
        isMature: blog.isMature,
        theme: blog.theme,
        layout: blog.layout,
        createdAt: blog.createdAt,
        owner: owner
          ? {
            id: owner.id,
            name: ownerMember?.displayName || (owner as any).displayName || `${owner.firstName} ${owner.lastName}`,
            avatarUrl: ownerMember?.avatarUrl || owner.avatarUrl,
          }
          : null,
      };
    },
    {
      detail: { summary: 'Get public blog by slug', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/public/blog/:slug/posts',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const blogRepo = AppDataSource.getRepository(Blog);
      const blog = await blogRepo.findOne({ where: { slug: ctx.params.slug } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const page = Math.max(1, Number(ctx.query?.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(ctx.query?.limit) || POST_PAGE_SIZE));

      const postRepo = AppDataSource.getRepository(BlogPost);
      const [posts, total] = await postRepo.findAndCount({
        where: [
          { blogId: blog.id, status: 'published', scheduledAt: IsNull() },
          { blogId: blog.id, status: 'published', scheduledAt: LessThanOrEqual(new Date()) },
        ],
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const userRepo = AppDataSource.getRepository(User);
      const authorIds = [...new Set(posts.map((p) => p.authorId))];
      const users =
        authorIds.length > 0
          ? await userRepo.find({
            where: authorIds.map((id) => ({ id })),
          })
          : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      const memberRepo = AppDataSource.getRepository(BlogMember);
      const members = authorIds.length > 0
        ? await memberRepo.find({ where: authorIds.map((uid) => ({ blogId: blog.id, userId: uid })) })
        : [];
      const memberMap = new Map(members.map((m) => [m.userId, m]));

      return {
        data: posts.map((p) => {
          const u = userMap.get(p.authorId);
          const m = memberMap.get(p.authorId);
          return {
            id: p.id,
            title: p.title,
            slug: p.slug,
            excerpt: p.excerpt,
            coverImageUrl: p.coverImageUrl,
            tags: p.tags,
            contentFlags: p.contentFlags || null,
            wordCount: (p.content || '').split(/\s+/).filter(Boolean).length,
            createdAt: p.createdAt,
            author: u
              ? {
                id: u.id,
                name: m?.displayName || (u as any).displayName || `${u.firstName} ${u.lastName}`,
                avatarUrl: m?.avatarUrl || u.avatarUrl,
              }
              : null,
          };
        }),
        total,
        page,
        limit,
      };
    },
    {
      detail: { summary: 'List published posts for a blog', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/public/blog/:slug/posts/:postSlug',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const blogRepo = AppDataSource.getRepository(Blog);
      const blog = await blogRepo.findOne({ where: { slug: ctx.params.slug } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const postRepo = AppDataSource.getRepository(BlogPost);
      const post = await postRepo.findOne({
        where: [
          { blogId: blog.id, slug: ctx.params.postSlug, status: 'published', scheduledAt: IsNull() },
          { blogId: blog.id, slug: ctx.params.postSlug, status: 'published', scheduledAt: LessThanOrEqual(new Date()) },
        ],
      });
      if (!post) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.postNotFound') };
      }

      post.viewCount = (post.viewCount || 0) + 1;
      postRepo.save(post).catch(() => { });

      const userRepo = AppDataSource.getRepository(User);
      const author = await userRepo.findOne({ where: { id: post.authorId } });
      const memberRepo = AppDataSource.getRepository(BlogMember);
      const member = await memberRepo.findOne({ where: { blogId: blog.id, userId: post.authorId } });

      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        content: post.content,
        excerpt: post.excerpt,
        coverImageUrl: post.coverImageUrl,
        tags: post.tags,
        contentFlags: post.contentFlags || null,
        viewCount: post.viewCount || 0,
        scheduledAt: post.scheduledAt,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        author: author
          ? {
            id: author.id,
            name: member?.displayName || (author as any).displayName || `${author.firstName} ${author.lastName}`,
            avatarUrl: member?.avatarUrl || author.avatarUrl,
          }
          : null,
        blog: {
          id: blog.id,
          slug: blog.slug,
          name: blog.name,
        },
      };
    },
    {
      detail: { summary: 'Get a published post', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/blog/mine',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const user = ctx.user as any;

      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { userId } });

      if (!blog) {
        return null;
      }

      const postRepo = AppDataSource.getRepository(BlogPost);
      const postCount = await postRepo.count({ where: { blogId: blog.id } });
      const publishedCount = await postRepo.count({
        where: { blogId: blog.id, status: 'published' },
      });
      const viewResult = await postRepo
        .createQueryBuilder('bp')
        .select('COALESCE(SUM(bp.viewCount), 0)', 'total')
        .where('bp.blogId = :blogId', { blogId: blog.id })
        .getRawOne();
      const totalViews = parseInt(viewResult?.total || '0', 10);

      return {
        id: blog.id,
        slug: blog.slug,
        name: blog.name,
        description: blog.description,
        coverImageUrl: blog.coverImageUrl,
        visibility: blog.visibility,
        totalViews,
        contentFlags: blog.contentFlags,
        isMature: blog.isMature,
        theme: blog.theme,
        layout: blog.layout,
        createdAt: blog.createdAt,
        updatedAt: blog.updatedAt,
        postCount,
        publishedCount,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Get current user blog', tags: ['Blog'] },
    }
  );

  app.post(
    prefix + '/blog/mine',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const body = ctx.body as any;

      const repo = AppDataSource.getRepository(Blog);
      const existing = await repo.findOne({ where: { userId } });
      if (existing) {
        ctx.set.status = 409;
        return { error: ctx.t('blog.alreadyExists') };
      }

      const rawSlug = slugify(String(body?.slug || ''));
      if (!rawSlug || rawSlug.length < 2) {
        ctx.set.status = 400;
        return { error: ctx.t('blog.invalidSlug') };
      }

      const reserved = ['new', 'edit', 'settings', 'admin', 'api', 'dashboard', 'login', 'register',
        'create', 'builder', 'members', 'posts', 'mine', 'check-slug', 'subscribe'];
      if (reserved.includes(rawSlug)) {
        ctx.set.status = 400;
        return { error: ctx.t('blog.slugReserved') };
      }

      const slugTaken = await repo.findOne({ where: { slug: rawSlug } });
      if (slugTaken) {
        ctx.set.status = 409;
        return { error: ctx.t('blog.slugTaken') };
      }

      const user = ctx.user as any;
      const defaultName =
        (user as any).displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || rawSlug;
      const name = String(body?.name || defaultName).trim() || defaultName;

      const blog = repo.create({
        userId,
        slug: rawSlug,
        name,
        visibility: 'public',
      });
      await repo.save(blog);
      ctx.set.status = 201;

      const memberRepo = AppDataSource.getRepository(BlogMember);
      const ownerMembership = memberRepo.create({
        blogId: blog.id,
        userId,
        role: 'owner',
      });
      await memberRepo.save(ownerMembership);

      createActivityLog({
        userId,
        action: 'blog:create',
        targetId: String(blog.id),
        targetType: 'blog',
        metadata: { slug: blog.slug, name: blog.name },
        ipAddress: ctx.ip,
      }).catch(() => { });

      return {
        id: blog.id,
        slug: blog.slug,
        name: blog.name,
        visibility: blog.visibility,
        createdAt: blog.createdAt,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Create a blog', tags: ['Blog'] },
    }
  );

  app.put(
    prefix + '/blog/mine',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const body = ctx.body as any;

      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { userId } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      if (body.name !== undefined) blog.name = String(body.name).trim() || blog.name;
      if (body.description !== undefined) blog.description = String(body.description);
      if (body.coverImageUrl !== undefined) blog.coverImageUrl = String(body.coverImageUrl);
      if (body.visibility !== undefined) {
        const v = String(body.visibility);
        if (['public', 'members', 'unlisted'].includes(v)) {
          blog.visibility = v as any;
        }
      }
      if (body.contentFlags !== undefined) blog.contentFlags = Array.isArray(body.contentFlags) ? body.contentFlags : null;
      if (body.isMature !== undefined) blog.isMature = body.isMature === true || (body.isMature as any) === 'true';

      await repo.save(blog);

      createActivityLog({
        userId,
        action: 'blog:update',
        targetId: String(blog.id),
        targetType: 'blog',
        metadata: { name: blog.name },
        ipAddress: ctx.ip,
      }).catch(() => { });

      return {
        id: blog.id,
        slug: blog.slug,
        name: blog.name,
        description: blog.description,
        coverImageUrl: blog.coverImageUrl,
        visibility: blog.visibility,
        updatedAt: blog.updatedAt,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Update own blog settings', tags: ['Blog'] },
    }
  );

  app.put(
    prefix + '/blog/mine/theme',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const body = ctx.body as any;

      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { userId } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      blog.theme = body?.theme || body || {};
      await repo.save(blog);

      return { theme: blog.theme };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Update blog theme', tags: ['Blog'] },
    }
  );

  app.put(
    prefix + '/blog/mine/layout',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const body = ctx.body as any;

      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { userId } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      blog.layout = body?.layout || body || {};
      await repo.save(blog);

      return { layout: blog.layout };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Update blog layout', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/blog/mine/posts',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { userId } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const page = Math.max(1, Number(ctx.query?.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(ctx.query?.limit) || POST_PAGE_SIZE));
      const status = ctx.query?.status;

      const postRepo = AppDataSource.getRepository(BlogPost);
      const where: any = { blogId: blog.id };
      if (status === 'draft' || status === 'published') {
        where.status = status;
      }

      const [posts, total] = await postRepo.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        data: posts.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          excerpt: p.excerpt,
          coverImageUrl: p.coverImageUrl,
          status: p.status,
          tags: p.tags,
          wordCount: (p.content || '').split(/\s+/).filter(Boolean).length,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        total,
        page,
        limit,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'List own blog posts', tags: ['Blog'] },
    }
  );

  app.post(
    prefix + '/blog/mine/posts',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const body = ctx.body as any;

      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { userId } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const title = String(body?.title || '').trim();
      if (!title) {
        ctx.set.status = 400;
        return { error: ctx.t('blog.titleRequired') };
      }

      let slug = String(body?.slug || '').trim() || slugify(title);
      if (!slug) slug = `post-${Date.now()}`;

      const postRepo = AppDataSource.getRepository(BlogPost);
      const existing = await postRepo.findOne({ where: { blogId: blog.id, slug } });
      if (existing) {
        slug = `${slug}-${Date.now()}`;
      }

      const post = postRepo.create({
        blogId: blog.id,
        authorId: userId,
        title,
        slug,
        content: String(body?.content || ''),
        excerpt: String(body?.excerpt || '').substring(0, 500) || null,
        coverImageUrl: body?.coverImageUrl || null,
        status: body?.status === 'published' ? 'published' : 'draft',
        tags: Array.isArray(body?.tags) ? body.tags : null,
        contentFlags: Array.isArray(body?.contentFlags) ? body.contentFlags : null,
        scheduledAt: body?.scheduledAt ? new Date(body.scheduledAt) : null,
      });

      await postRepo.save(post);
      ctx.set.status = 201;

      createActivityLog({
        userId,
        action: 'blog:post:create',
        targetId: String(post.id),
        targetType: 'blog_post',
        metadata: { title: post.title, blogId: blog.id },
        ipAddress: ctx.ip,
      }).catch(() => { });

      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        status: post.status,
        createdAt: post.createdAt,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Create a blog post', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/blog/mine/posts/:id',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const postId = Number(ctx.params.id);

      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { userId } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const postRepo = AppDataSource.getRepository(BlogPost);
      const post = await postRepo.findOne({ where: { id: postId, blogId: blog.id } });
      if (!post) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.postNotFound') };
      }

      return {
        id: post.id,
        blogId: post.blogId,
        title: post.title,
        slug: post.slug,
        content: post.content,
        excerpt: post.excerpt,
        coverImageUrl: post.coverImageUrl,
        status: post.status,
        visibility: post.visibility,
        tags: post.tags,
        contentFlags: post.contentFlags || null,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Get a single blog post (own)', tags: ['Blog'] },
    }
  );

  app.put(
    prefix + '/blog/mine/posts/:id',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const postId = Number(ctx.params.id);
      const body = ctx.body as any;

      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { userId } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const postRepo = AppDataSource.getRepository(BlogPost);
      const post = await postRepo.findOne({ where: { id: postId, blogId: blog.id } });
      if (!post) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.postNotFound') };
      }

      if (body.title !== undefined) {
        post.title = String(body.title).trim() || post.title;
      }
      if (body.slug !== undefined) {
        const newSlug = slugify(String(body.slug));
        if (newSlug && newSlug !== post.slug) {
          const dup = await postRepo.findOne({ where: { blogId: blog.id, slug: newSlug } });
          if (!dup || dup.id === post.id) {
            post.slug = newSlug;
          }
        }
      }
      if (body.content !== undefined) post.content = String(body.content);
      if (body.excerpt !== undefined) post.excerpt = String(body.excerpt).substring(0, 500) || null;
      if (body.coverImageUrl !== undefined) post.coverImageUrl = body.coverImageUrl || null;
      if (body.status !== undefined) {
        const s = String(body.status);
        if (s === 'draft' || s === 'published') post.status = s;
      }
      if (body.visibility !== undefined) {
        const v = String(body.visibility);
        if (['public', 'members', 'unlisted'].includes(v)) {
          post.visibility = v as any;
        } else if (v === 'null' || v === '') {
          post.visibility = null as any;
        }
      }
      if (body.tags !== undefined) post.tags = Array.isArray(body.tags) ? body.tags : null;
      if (body.contentFlags !== undefined) post.contentFlags = Array.isArray(body.contentFlags) ? body.contentFlags : null;
      if (body.scheduledAt !== undefined) post.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

      await postRepo.save(post);

      createActivityLog({
        userId,
        action: 'blog:post:update',
        targetId: String(post.id),
        targetType: 'blog_post',
        metadata: { title: post.title, blogId: blog.id },
        ipAddress: ctx.ip,
      }).catch(() => { });

      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        status: post.status,
        updatedAt: post.updatedAt,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Update a blog post', tags: ['Blog'] },
    }
  );

  app.delete(
    prefix + '/blog/mine/posts/:id',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const postId = Number(ctx.params.id);

      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { userId } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const postRepo = AppDataSource.getRepository(BlogPost);
      const post = await postRepo.findOne({ where: { id: postId, blogId: blog.id } });
      if (!post) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.postNotFound') };
      }

      await postRepo.delete(postId);

      createActivityLog({
        userId,
        action: 'blog:post:delete',
        targetId: String(postId),
        targetType: 'blog_post',
        metadata: { title: post.title, blogId: blog.id },
        ipAddress: ctx.ip,
      }).catch(() => { });

      return { success: true };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Delete a blog post', tags: ['Blog'] },
    }
  );

  app.post(
    prefix + '/blog/mine/upload',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;

      const { file } = (ctx.body || {}) as any;
      const uploadFile = Array.isArray(file) ? file[0] : file;
      if (!uploadFile) {
        ctx.set.status = 400;
        return { error: ctx.t('blog.noFileProvided') };
      }

      const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
      const mime = (uploadFile.type || uploadFile.mimetype || '').toString();
      if (!allowed.includes(mime)) {
        ctx.set.status = 400;
        return { error: ctx.t('blog.invalidImageType') };
      }

      const ab = await uploadFile.arrayBuffer();
      const buffer = Buffer.from(ab);

      const ext =
        mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : '.jpg';
      const filename = `blog_${userId}_${Date.now()}${ext}`;
      const uploadDir = path.join(process.cwd(), 'uploads');
      await fs.promises.mkdir(uploadDir, { recursive: true });
      const filepath = path.join(uploadDir, filename);
      await Bun.write(filepath, buffer);

      const backendBase =
        (process.env.BACKEND_URL || '').replace(/\/+$/, '') ||
        (() => {
          const proto = (ctx.request.headers.get('x-forwarded-proto') || 'https') as string;
          const host = (ctx.request.headers.get('host') || 'localhost') as string;
          return `${proto}://${host}`;
        })();

      return { url: `${backendBase}/uploads/${filename}` };
    },
    {
      body: t.Object({ file: t.File() }),
      beforeHandle: [authenticate],
      detail: { summary: 'Upload blog image', tags: ['Blog'] },
    }
  );

  app.post(
    prefix + '/public/blog/:slug/subscribe',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      if (!ctx.user) {
        ctx.set.status = 401;
        return { error: "Login required" };
      }

      const userId = ctx.user.id;
      const blogRepo = AppDataSource.getRepository(Blog);
      const blog = await blogRepo.findOne({ where: { slug: ctx.params.slug } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }
      if (blog.userId === userId) {
        ctx.set.status = 400;
        return { error: ctx.t('blog.cannotSubscribeOwn') };
      }

      const subRepo = AppDataSource.getRepository(BlogSubscriber);
      const existing = await subRepo.findOne({ where: { blogId: blog.id, userId } });
      if (existing) {
        return { subscribed: true, message: ctx.t('blog.alreadySubscribed') };
      }

      const sub = subRepo.create({ blogId: blog.id, userId });
      await subRepo.save(sub);
      ctx.set.status = 201;

      const count = await subRepo.count({ where: { blogId: blog.id } });
      return { subscribed: true, subscriberCount: count };
    },
    {
      beforeHandle: [optionalAuth],
      detail: { summary: 'Subscribe to a blog', tags: ['Blog'] },
    }
  );

  app.delete(
    prefix + '/public/blog/:slug/subscribe',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      if (!ctx.user) {
        ctx.set.status = 401;
        return { error: "Login required" };
      }

      const userId = ctx.user.id;
      const blogRepo = AppDataSource.getRepository(Blog);
      const blog = await blogRepo.findOne({ where: { slug: ctx.params.slug } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const subRepo = AppDataSource.getRepository(BlogSubscriber);
      const result = await subRepo.delete({ blogId: blog.id, userId } as any);
      if (!result.affected) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notSubscribed') };
      }

      const count = await subRepo.count({ where: { blogId: blog.id } });
      return { subscribed: false, subscriberCount: count };
    },
    {
      beforeHandle: [optionalAuth],
      detail: { summary: 'Unsubscribe from a blog', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/blog/mine/subscribers',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const blogRepo = AppDataSource.getRepository(Blog);
      const blog = await blogRepo.findOne({ where: { userId } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const subRepo = AppDataSource.getRepository(BlogSubscriber);
      const count = await subRepo.count({ where: { blogId: blog.id } });

      const page = Math.max(1, Number(ctx.query?.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(ctx.query?.limit) || 50));
      const [subs, total] = await subRepo.findAndCount({
        where: { blogId: blog.id },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const userRepo = AppDataSource.getRepository(User);
      const userIds = subs.map((s) => s.userId);
      const users =
        userIds.length > 0
          ? await userRepo.find({
            where: userIds.map((id) => ({ id })),
          })
          : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      return {
        subscriberCount: count,
        data: subs.map((s) => {
          const u = userMap.get(s.userId);
          return {
            id: s.id,
            userId: s.userId,
            createdAt: s.createdAt,
            user: u
              ? {
                id: u.id,
                name: (u as any).displayName || `${u.firstName} ${u.lastName}`,
                avatarUrl: u.avatarUrl,
              }
              : null,
          };
        }),
        total,
        page,
        limit,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'List blog subscribers', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/blog/org/:orgId',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const orgId = Number(ctx.params.orgId);

      const orgMemberRepo = AppDataSource.getRepository(OrganisationMember);
      const membership = await orgMemberRepo.findOne({ where: { userId, organisationId: orgId } });
      if (!membership) {
        ctx.set.status = 403;
        return { error: ctx.t('blog.orgMembershipRequired') };
      }

      const repo = AppDataSource.getRepository(Blog);
      let blog = await repo.findOne({ where: { organisationId: orgId } });

      if (!blog) {
        const orgRepo = AppDataSource.getRepository(Organisation);
        const org = await orgRepo.findOne({ where: { id: orgId } });
        if (!org) {
          ctx.set.status = 404;
          return { error: ctx.t('organisation.notFound') };
        }

        blog = repo.create({
          userId,
          organisationId: orgId,
          slug: slugify(org.handle || `org-${orgId}`),
          name: org.name || `Organisation ${orgId}`,
          visibility: 'public',
        });
        await repo.save(blog);

        const memberRepo = AppDataSource.getRepository(BlogMember);
        const ownerMembership = memberRepo.create({
          blogId: blog.id,
          userId,
          role: 'owner',
        });
        await memberRepo.save(ownerMembership);

        ctx.set.status = 201;
      }

      const postRepo = AppDataSource.getRepository(BlogPost);
      const postCount = await postRepo.count({ where: { blogId: blog.id } });
      const publishedCount = await postRepo.count({
        where: { blogId: blog.id, status: 'published' },
      });
      const viewResult = await postRepo
        .createQueryBuilder('bp')
        .select('COALESCE(SUM(bp.viewCount), 0)', 'total')
        .where('bp.blogId = :blogId', { blogId: blog.id })
        .getRawOne();
      const totalViews = parseInt(viewResult?.total || '0', 10);

      return {
        id: blog.id,
        slug: blog.slug,
        name: blog.name,
        description: blog.description,
        coverImageUrl: blog.coverImageUrl,
        visibility: blog.visibility,
        totalViews,
        organisationId: blog.organisationId,
        postCount,
        publishedCount,
        createdAt: blog.createdAt,
        updatedAt: blog.updatedAt,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Get or create org blog', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/blog/:blogId/members',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const blogId = Number(ctx.params.blogId);
      const userId = ctx.user.id;

      if (!(await canManageBlog(blogId, userId)) && !hasPermissionSync(ctx, 'blog:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }

      const memberRepo = AppDataSource.getRepository(BlogMember);
      const members = await memberRepo.find({ where: { blogId }, order: { createdAt: 'ASC' } });

      const userRepo = AppDataSource.getRepository(User);
      const userIds = members.map((m) => m.userId);
      const users =
        userIds.length > 0
          ? await userRepo.find({
            where: userIds.map((id) => ({ id })),
          })
          : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      return {
        data: members.map((m) => {
          const u = userMap.get(m.userId);
          return {
            id: m.id,
            userId: m.userId,
            role: m.role,
            displayName: m.displayName,
            avatarUrl: m.avatarUrl,
            bio: m.bio,
            createdAt: m.createdAt,
            user: u
              ? {
                id: u.id,
                name: (u as any).displayName || `${u.firstName} ${u.lastName}`,
                email: u.email,
                avatarUrl: u.avatarUrl,
              }
              : null,
          };
        }),
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'List blog members', tags: ['Blog'] },
    }
  );

  app.post(
    prefix + '/blog/:blogId/members',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const blogId = Number(ctx.params.blogId);
      const userId = ctx.user.id;
      const body = ctx.body as any;

      if (!(await canManageBlog(blogId, userId)) && !hasPermissionSync(ctx, 'blog:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }

      const email = String(body?.email || '').trim().toLowerCase();
      if (!email) {
        ctx.set.status = 400;
        return { error: ctx.t('blog.memberEmailRequired') };
      }

      const userRepo = AppDataSource.getRepository(User);
      const targetUser = await userRepo.findOne({ where: { email } });
      if (!targetUser) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.userNotFound') };
      }

      const memberRepo = AppDataSource.getRepository(BlogMember);
      const existing = await memberRepo.findOne({ where: { blogId, userId: targetUser.id } });
      if (existing) {
        ctx.set.status = 409;
        return { error: ctx.t('blog.memberAlreadyExists') };
      }

      const role = ['owner', 'admin', 'author'].includes(body?.role) ? body.role : 'author';
      const member = memberRepo.create({
        blogId,
        userId: targetUser.id,
        role,
      });
      await memberRepo.save(member);
      ctx.set.status = 201;

      createActivityLog({
        userId,
        action: 'blog:member:add',
        targetId: String(member.id),
        targetType: 'blog_member',
        metadata: { blogId, targetUserId: targetUser.id, role },
        ipAddress: ctx.ip,
      }).catch(() => { });

      return {
        id: member.id,
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Add a blog member', tags: ['Blog'] },
    }
  );

  app.put(
    prefix + '/blog/:blogId/members/:userId',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const blogId = Number(ctx.params.blogId);
      const targetUserId = Number(ctx.params.userId);
      const currentUserId = ctx.user.id;
      const body = ctx.body as any;

      if (!(await canManageBlog(blogId, currentUserId)) && !hasPermissionSync(ctx, 'blog:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }

      const memberRepo = AppDataSource.getRepository(BlogMember);
      const member = await memberRepo.findOne({ where: { blogId, userId: targetUserId } });
      if (!member) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.memberNotFound') };
      }

      const newRole = String(body?.role || '');
      if (!['owner', 'admin', 'author'].includes(newRole)) {
        ctx.set.status = 400;
        return { error: ctx.t('blog.invalidRole') };
      }

      if (newRole === 'owner') {
        const currentMember = await memberRepo.findOne({ where: { blogId, userId: currentUserId } });
        if (currentMember?.role !== 'owner' && !hasPermissionSync(ctx, 'blog:manage')) {
          ctx.set.status = 403;
          return { error: ctx.t('blog.onlyOwnerCanTransfer') };
        }
        if (currentMember) {
          currentMember.role = 'admin';
          await memberRepo.save(currentMember);
        }
      }

      member.role = newRole as any;
      await memberRepo.save(member);

      createActivityLog({
        userId: currentUserId,
        action: 'blog:member:update',
        targetId: String(member.id),
        targetType: 'blog_member',
        metadata: { blogId, targetUserId, newRole },
        ipAddress: ctx.ip,
      }).catch(() => { });

      return { id: member.id, userId: member.userId, role: member.role };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Update a blog member role', tags: ['Blog'] },
    }
  );

  app.delete(
    prefix + '/blog/:blogId/members/:userId',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const blogId = Number(ctx.params.blogId);
      const targetUserId = Number(ctx.params.userId);
      const currentUserId = ctx.user.id;

      if (!(await canManageBlog(blogId, currentUserId)) && !hasPermissionSync(ctx, 'blog:manage')) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }

      const memberRepo = AppDataSource.getRepository(BlogMember);
      const member = await memberRepo.findOne({ where: { blogId, userId: targetUserId } });
      if (!member) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.memberNotFound') };
      }

      const blogRepo = AppDataSource.getRepository(Blog);
      const blog = await blogRepo.findOne({ where: { id: blogId } });
      if (targetUserId === currentUserId && blog?.userId === currentUserId) {
        ctx.set.status = 400;
        return { error: ctx.t('blog.cannotRemoveOwner') };
      }

      await memberRepo.delete(member.id);

      createActivityLog({
        userId: currentUserId,
        action: 'blog:member:remove',
        targetId: String(member.id),
        targetType: 'blog_member',
        metadata: { blogId, targetUserId },
        ipAddress: ctx.ip,
      }).catch(() => { });

      return { success: true };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Remove a blog member', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/blog/mine/analytics',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const blogRepo = AppDataSource.getRepository(Blog);
      const blog = await blogRepo.findOne({ where: { userId } });
      if (!blog) { ctx.set.status = 404; return { error: ctx.t('blog.notFound') }; }

      const days = Math.min(365, Math.max(1, Number(ctx.query?.days) || 30));
      const since = new Date();
      since.setDate(since.getDate() - days);

      const postRepo = AppDataSource.getRepository(BlogPost);
      const posts = await postRepo.find({
        where: { blogId: blog.id },
        order: { viewCount: 'DESC' },
      });

      const recentPosts = posts.filter((p) => new Date(p.createdAt) >= since);
      const totalViews = posts.reduce((sum, p) => sum + (p.viewCount || 0), 0);
      const recentViews = recentPosts.reduce((sum, p) => sum + (p.viewCount || 0), 0);

      return {
        totalViews,
        recentViews,
        timeframe: days,
        posts: posts.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          status: p.status,
          viewCount: p.viewCount || 0,
          createdAt: p.createdAt,
        })),
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Get blog analytics', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/admin/blog',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const page = Math.max(1, Number(ctx.query?.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(ctx.query?.limit) || 50));

      const repo = AppDataSource.getRepository(Blog);
      const userRepo = AppDataSource.getRepository(User);

      const [blogs, total] = await repo.findAndCount({
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const userIds = [...new Set(blogs.map((b) => b.userId))];
      const users =
        userIds.length > 0 ? await userRepo.findBy({ id: In(userIds) as any }) : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      return {
        data: blogs.map((b) => {
          const u = userMap.get(b.userId);
          return {
            id: b.id,
            slug: b.slug,
            name: b.name,
            userId: b.userId,
            organisationId: b.organisationId,
            visibility: b.visibility,
            createdAt: b.createdAt,
            owner: u
              ? {
                id: u.id,
                email: u.email,
                name: `${u.firstName} ${u.lastName}`,
              }
              : null,
          };
        }),
        total,
        page,
        limit,
      };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { summary: 'List all blogs (admin)', tags: ['Admin'] },
    }
  );

  app.delete(
    prefix + '/admin/blog/:id',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const id = Number(ctx.params?.id);
      if (!id || isNaN(id)) {
        ctx.set.status = 400;
        return { error: ctx.t('blog.invalidBlogId') };
      }

      const repo = AppDataSource.getRepository(Blog);
      const blog = await repo.findOne({ where: { id } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const postRepo = AppDataSource.getRepository(BlogPost);
      await postRepo.delete({ blogId: id } as any);
      await repo.delete(id);

      createActivityLog({
        userId: ctx.user.id,
        action: 'blog:admin:delete',
        targetId: String(id),
        targetType: 'blog',
        metadata: { name: blog.name, slug: blog.slug },
        ipAddress: ctx.ip,
      }).catch(() => { });

      return { success: true };
    },
    {
      beforeHandle: [authenticate, authorize('admin:access')],
      detail: { summary: 'Delete a blog (admin)', tags: ['Admin'] },
    }
  );

  app.get(
    prefix + '/public/blog/:slug/rss',
    async (ctx: any) => {
      const blogRepo = AppDataSource.getRepository(Blog);
      const blog = await blogRepo.findOne({ where: { slug: ctx.params.slug } });
      if (!blog) { ctx.set.status = 404; return ctx.t('blog.notFound'); }

      const postRepo = AppDataSource.getRepository(BlogPost);
      const posts = await postRepo.find({
        where: [
          { blogId: blog.id, status: 'published', scheduledAt: IsNull() },
          { blogId: blog.id, status: 'published', scheduledAt: LessThanOrEqual(new Date()) },
        ],
        order: { createdAt: 'DESC' },
        take: 20,
      });

      const frontendUrl = process.env.FRONTEND_URL;
      const blogUrl = `${frontendUrl}/blog/${blog.slug}`;

      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${blog.name}</title>
<link>${blogUrl}</link>
<description>${blog.description || blog.name}</description>
<atom:link href="${blogUrl}/rss" rel="self" type="application/rss+xml"/>
${posts.map((p: any) => `
<item>
<title>${p.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
<link>${blogUrl}/${p.slug}</link>
<guid isPermaLink="true">${blogUrl}/${p.slug}</guid>
<pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>
<description>${(p.excerpt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</description>
</item>`).join('')}
</channel>
</rss>`;

      ctx.set.headers['Content-Type'] = 'application/rss+xml; charset=utf-8';
      return rss;
    },
    {
      detail: { summary: 'RSS feed for a blog', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/blog/list',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const userId = ctx.user.id;
      const blogRepo = AppDataSource.getRepository(Blog);
      const memberRepo = AppDataSource.getRepository(BlogMember);

      const ownBlog = await blogRepo.findOne({ where: { userId } });
      const memberships = await memberRepo.find({ where: { userId } });
      const memberBlogIds = memberships.map((m) => m.blogId);
      const memberBlogs = memberBlogIds.length > 0
        ? await blogRepo.find({ where: memberBlogIds.map((id) => ({ id })) })
        : [];

      const blogs: any[] = [];
      if (ownBlog) blogs.push({
        id: ownBlog.id, slug: ownBlog.slug, name: ownBlog.name,
        role: 'owner', isOwn: true,
      });
      for (const b of memberBlogs) {
        if (b.userId === userId) continue;
        const m = memberships.find((mb) => mb.blogId === b.id);
        blogs.push({
          id: b.id, slug: b.slug, name: b.name,
          role: m?.role || 'author', isOwn: false,
        });
      }

      return { blogs };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'List blogs accessible to user', tags: ['Blog'] },
    }
  );

  async function getOrCreatePostChannel(postId: number, postTitle: string): Promise<ChatChannel> {
    const slug = `blog-post-${postId}`
    const channelRepo = AppDataSource.getRepository(ChatChannel)
    let channel = await channelRepo.findOne({ where: { slug } })
    if (!channel) {
      channel = channelRepo.create({
        slug,
        name: postTitle || `Post #${postId}`,
        description: `Comments on blog post`,
        type: 'public_anonymous',
        isListed: false,
      })
      await channelRepo.save(channel)
    }
    return channel
  }

  app.get(
    prefix + '/public/blog/posts/:postId/chat',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const postId = Number(ctx.params.postId);
      const postRepo = AppDataSource.getRepository(BlogPost);
      const post = await postRepo.findOne({ where: { id: postId, status: 'published' } });
      if (!post) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.postNotFound') };
      }

      const channel = await getOrCreatePostChannel(postId, post.title);
      const msgRepo = AppDataSource.getRepository(ChatMessage);
      const page = Math.max(1, Number(ctx.query?.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(ctx.query?.limit) || 50));
      const [messages, total] = await msgRepo.findAndCount({
        where: { channelId: channel.id },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const memberUserIds = [...new Set(messages.map((m: any) => m.userId).filter(Boolean))];
      let memberMap = new Map<number, string>();
      if (memberUserIds.length > 0) {
        const memberRepo = AppDataSource.getRepository(BlogMember);
        const members = await memberRepo.find({
          where: memberUserIds.map((uid) => ({ blogId: post.blogId, userId: uid })),
        });
        for (const m of members) memberMap.set(m.userId, m.role);
      }

      return {
        channelId: channel.id,
        channelSlug: channel.slug,
        messages: messages.map((m: any) => ({
          id: m.id,
          userId: m.userId,
          content: m.content,
          displayName: m.displayName || null,
          avatarUrl: m.avatarUrl || null,
          anonymousName: m.anonymousName || null,
          imageUrl: m.imageUrl || null,
          role: m.userId ? (memberMap.get(m.userId) || null) : null,
          createdAt: m.createdAt,
        })),
        total,
        page,
        limit,
      };
    },
    {
      detail: { summary: 'Get chat messages for a blog post', tags: ['Blog'] },
    }
  );

  app.post(
    prefix + '/public/blog/posts/:postId/chat/message',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const postId = Number(ctx.params.postId);
      const postRepo = AppDataSource.getRepository(BlogPost);
      const post = await postRepo.findOne({ where: { id: postId, status: 'published' } });
      if (!post) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.postNotFound') };
      }

      const body = (ctx.body || {}) as any;
      const content = String(body?.content || '').trim().slice(0, 10000);
      if (!content) {
        ctx.set.status = 400;
        return { error: ctx.t('chat.content_is_required') };
      }

      const channel = await getOrCreatePostChannel(postId, post.title);
      const user = ctx.user ? await AppDataSource.getRepository(User).findOneBy({ id: ctx.user.id }) : null;
      const memberRepo2 = AppDataSource.getRepository(BlogMember);
      const blogMember = ctx.user ? await memberRepo2.findOne({ where: { blogId: post.blogId, userId: ctx.user.id } }) : null;
      const revealIdentity = body?.revealIdentity === true && !!user;
      const anonName = body?.anonymousName && typeof body.anonymousName === 'string'
        ? body.anonymousName.trim().slice(0, 64) || null : null;
      const imageUrl = body?.imageUrl ? String(body.imageUrl).trim().slice(0, 512) || null : null;

      const displayName = revealIdentity
        ? (blogMember?.displayName || (user as any)?.displayName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || null)
        : null;
      const avatarUrl = revealIdentity ? (blogMember?.avatarUrl || user?.avatarUrl || null) : null;

      const msgRepo = AppDataSource.getRepository(ChatMessage);
      const msg: any = msgRepo.create({
        channelId: channel.id,
        content,
        imageUrl,
        userId: revealIdentity ? user!.id : null,
        displayName,
        avatarUrl,
        anonymousName: revealIdentity ? null : (anonName || 'Anonymous'),
        posterId: revealIdentity ? `User#${user!.id}` : (anonName || 'Anonymous'),
      });
      await msgRepo.save(msg);

      return {
        id: msg.id,
        userId: msg.userId,
        content: msg.content,
        displayName: msg.displayName || null,
        avatarUrl: msg.avatarUrl || null,
        anonymousName: msg.anonymousName || null,
        imageUrl: msg.imageUrl || null,
        createdAt: msg.createdAt,
      };
    },
    {
      beforeHandle: [optionalAuth],
      detail: { summary: 'Post an anonymous comment on a blog post', tags: ['Blog'] },
    }
  );

  app.put(
    prefix + '/blog/:blogId/members/me',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const blogId = Number(ctx.params.blogId);
      const userId = ctx.user.id;
      const body = ctx.body as any;

      const memberRepo = AppDataSource.getRepository(BlogMember);
      let member = await memberRepo.findOne({ where: { blogId, userId } });

      if (!member) {
        const blogRepo = AppDataSource.getRepository(Blog);
        const blog = await blogRepo.findOne({ where: { id: blogId } });
        if (blog && blog.userId === userId) {
          member = memberRepo.create({ blogId, userId, role: 'owner' });
        } else {
          ctx.set.status = 404;
          return { error: ctx.t('blog.memberNotFound') };
        }
      }

      if (body.displayName !== undefined) member.displayName = String(body.displayName).trim().slice(0, 128) || null;
      if (body.avatarUrl !== undefined) member.avatarUrl = String(body.avatarUrl).trim().slice(0, 2048) || null;
      if (body.bio !== undefined) member.bio = String(body.bio).trim().slice(0, 2000) || null;

      await memberRepo.save(member);

      return {
        id: member.id,
        userId: member.userId,
        role: member.role,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        bio: member.bio,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Update own blog member profile', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/public/blog/:slug/author/:userId',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const blogRepo = AppDataSource.getRepository(Blog);
      const blog = await blogRepo.findOne({ where: { slug: ctx.params.slug } });
      if (!blog) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.notFound') };
      }

      const authorUserId = Number(ctx.params.userId);
      const memberRepo = AppDataSource.getRepository(BlogMember);
      const member = await memberRepo.findOne({ where: { blogId: blog.id, userId: authorUserId } });

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: authorUserId } });
      if (!user) {
        ctx.set.status = 404;
        return { error: ctx.t('blog.userNotFound') };
      }

      const postRepo = AppDataSource.getRepository(BlogPost);
      const posts = await postRepo.find({
        where: { blogId: blog.id, authorId: authorUserId, status: 'published' },
        order: { createdAt: 'DESC' },
        take: 20,
      });

      return {
        author: {
          id: user.id,
          name: member?.displayName || (user as any).displayName || `${user.firstName} ${user.lastName}`,
          avatarUrl: member?.avatarUrl || user.avatarUrl || null,
          bio: member?.bio || null,
          role: member?.role || null,
        },
        posts: posts.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          excerpt: p.excerpt,
          coverImageUrl: p.coverImageUrl,
          tags: p.tags,
          contentFlags: p.contentFlags || null,
          wordCount: (p.content || '').split(/\s+/).filter(Boolean).length,
          createdAt: p.createdAt,
        })),
      };
    },
    {
      detail: { summary: 'Get public author profile and posts', tags: ['Blog'] },
    }
  );

  app.get(
    prefix + '/blog/:blogId/members/me',
    async (ctx: any) => {
      const f = await requireBlogFeature(ctx);
      if (f !== true) return f;

      const blogId = Number(ctx.params.blogId);
      const userId = ctx.user.id;

      const memberRepo = AppDataSource.getRepository(BlogMember);
      let member = await memberRepo.findOne({ where: { blogId, userId } });

      if (!member) {
        const blogRepo = AppDataSource.getRepository(Blog);
        const blog = await blogRepo.findOne({ where: { id: blogId } });
        if (blog && blog.userId === userId) {
          member = memberRepo.create({ blogId, userId, role: 'owner' });
          await memberRepo.save(member);
        } else {
          ctx.set.status = 404;
          return { error: ctx.t('blog.memberNotFound') };
        }
      }

      return {
        id: member.id,
        userId: member.userId,
        role: member.role,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl,
        bio: member.bio,
      };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Get own blog member profile', tags: ['Blog'] },
    }
  );
}