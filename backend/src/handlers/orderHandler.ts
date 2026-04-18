import { AppDataSource } from '../config/typeorm';
import { Order } from '../models/order.entity';
import { User } from '../models/user.entity';
import { Plan } from '../models/plan.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { requireFeature } from '../middleware/featureToggle';
import { t } from 'elysia';
import PDFDocument from 'pdfkit';
import stream from 'stream';
import fs from 'fs';
import path from 'path';
import { generateInvoicePdf } from '../workers/pdfWorker';

async function renderInvoicePdf(order: Order): Promise<Buffer> {
  try {
    const userRepo = AppDataSource.getRepository(User as any);
    const u = await userRepo.findOneBy({ id: order.userId }).catch(() => null);
    const defaultLogo = path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', 'assets', 'icons', 'logo.png');
    const logoPath = process.env.INVOICE_LOGO_PATH
      ? path.resolve(process.env.INVOICE_LOGO_PATH)
      : defaultLogo;
    const companyName = process.env.COMPANY_NAME || 'EclipseSystems';
    const issuedFrom = {
      name: process.env.INVOICE_ISSUED_FROM_NAME || process.env.COMPANY_NAME || 'EclipseSystems',
      address: process.env.INVOICE_ISSUED_FROM_ADDRESS || process.env.COMPANY_ADDRESS || '',
      city: process.env.INVOICE_ISSUED_FROM_CITY || '',
      email: process.env.INVOICE_ISSUED_FROM_EMAIL || '',
    };
    try {
      return await generateInvoicePdf({ order, user: u, logoPath, companyName, issuedFrom });
    } catch (err) {
      // skip
    }
  } catch (e) {}
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const bufs: Uint8Array[] = [];
      doc.on('data', (d: Uint8Array) => bufs.push(d));
      doc.on('end', () => resolve(Buffer.concat(bufs)));

      const defaultLogo = path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', 'assets', 'icons', 'logo.png');
      const logoPath = process.env.INVOICE_LOGO_PATH ? path.resolve(process.env.INVOICE_LOGO_PATH) : defaultLogo;
      if (fs.existsSync(logoPath)) {
        try { doc.image(logoPath, 50, 45, { width: 90 }); } catch (e) { /* skip */ }
      }
      const companyName = process.env.COMPANY_NAME || 'EclipseSystems';
      doc.fontSize(16).text(companyName, 150, 50);
      doc.fontSize(10).fillColor('gray').text('Hosting Provider Services', 150, 68);

      const issuedFromEnv = {
        name: process.env.INVOICE_ISSUED_FROM_NAME || process.env.COMPANY_NAME || '',
        address: process.env.INVOICE_ISSUED_FROM_ADDRESS || process.env.COMPANY_ADDRESS || '',
        city: process.env.INVOICE_ISSUED_FROM_CITY || '',
        email: process.env.INVOICE_ISSUED_FROM_EMAIL || '',
      };
      const issuedLines: string[] = [];
      if (issuedFromEnv.name) issuedLines.push(issuedFromEnv.name);
      if (issuedFromEnv.address) issuedLines.push(issuedFromEnv.address);
      if (issuedFromEnv.city) issuedLines.push(issuedFromEnv.city);
      if (issuedFromEnv.email) issuedLines.push(issuedFromEnv.email);
      if (issuedLines.length > 0) {
        doc.fontSize(10).fillColor('black').text('Issued From:', 50, 100);
        doc.fontSize(10).fillColor('black').text(issuedLines.join('\n'), 50, 115);
      }

      const issuedAt = order.createdAt ? new Date(order.createdAt) : new Date();
      doc.fontSize(20).fillColor('black').text('INVOICE', 400, 50, { align: 'right' });
      doc.fontSize(10).fillColor('black').text(`Invoice #: ${order.id}`, { align: 'right' });
      doc.text(`Date: ${issuedAt.toLocaleDateString()}`, { align: 'right' });

      doc.moveDown(2);

      doc.fontSize(12).fillColor('black').text('Bill To:', 50, 140);
      try {
        const userRepo = AppDataSource.getRepository(require('../models/user.entity').User);
        userRepo.findOneBy({ id: order.userId }).then((u: any) => {
          const fullNameParts = [u?.firstName, u?.middleName, u?.lastName].filter(Boolean as any);
          const name = fullNameParts.length ? fullNameParts.join(' ') : u?.email || 'Customer';
          const lines = [name];
          if (u?.billingCompany) lines.push(u.billingCompany);
          if (u?.address) lines.push(u.address);
          if (u?.address2) lines.push(u.address2);
          const city = [u?.billingCity, u?.billingState, u?.billingZip].filter(Boolean).join(', ');
          if (city) lines.push(city);
          if (u?.billingCountry) lines.push(u.billingCountry);
          doc.fontSize(10).fillColor('black').text(lines.join('\n'), 50, 155);

          doc.moveDown(4);
          doc.fontSize(12).text('Items', 50);
          doc.moveDown(0.5);

          let items: any[] = [];
          try { items = JSON.parse(order.items); } catch { items = []; }
          if (!Array.isArray(items) || items.length === 0) {
            const desc = order.description || order.items || 'Order';
            doc.fontSize(10).text(desc, { continued: false });
          } else {
            const startY = doc.y;
            const tableX = 50;
            doc.fontSize(10);
            items.forEach((it: any, i: number) => {
              const desc = it.description || it.name || JSON.stringify(it);
              const qty = it.quantity ?? it.qty ?? 1;
              const price = Number(it.price ?? it.unit_price ?? 0);
              const lineTotal = qty * price;
              const y = startY + i * 18;
              doc.text(desc, tableX, y, { width: 300 });
              doc.text(String(qty), tableX + 320, y);
              doc.text((price).toFixed(2), tableX + 360, y, { width: 60, align: 'right' });
              doc.text((lineTotal).toFixed(2), tableX + 430, y, { width: 60, align: 'right' });
            });
            doc.moveDown(items.length * 0.8 + 1);
          }

          const amount = Number(order.amount ?? 0);
          doc.moveDown();
          const totX = 400;
          doc.fontSize(10).text('Subtotal:', totX, doc.y, { align: 'right' });
          doc.text(amount.toFixed(2), totX + 80, doc.y, { align: 'right' });
          doc.moveDown();
          doc.fontSize(12).text('Total:', totX, doc.y, { align: 'right' });
          doc.text(amount.toFixed(2), totX + 80, doc.y, { align: 'right' });

          doc.moveDown(2);
          doc.fontSize(9).fillColor('gray').text('Thank you for your business.', 50, doc.y);

          doc.end();
        }).catch(() => {
          doc.fontSize(10).text(order.description || order.items || 'Order details not available');
          doc.end();
        });
      } catch (e) {
        doc.fontSize(10).text(order.description || order.items || 'Order details not available');
        doc.end();
      }
    } catch (e) { reject(e); }
  });
}

function deriveDescriptionFromItems(itemsStr: string | undefined) {
  if (!itemsStr) return undefined;
  try {
    const items = JSON.parse(itemsStr);
    if (Array.isArray(items) && items.length > 0) {
      const it = items[0];
      return it.description || it.name || JSON.stringify(it);
    }
    if (typeof items === 'object' && items) {
      return items.description || items.name || JSON.stringify(items);
    }
  } catch (e) {
    return String(itemsStr).slice(0, 200);
  }
  return undefined;
}

function normalizeOrder(o: any) {
  const date = o.createdAt ? (o.createdAt instanceof Date ? o.createdAt.toISOString() : new Date(o.createdAt).toISOString()) : new Date().toISOString();
  const desc = o.description || deriveDescriptionFromItems(o.items) || 'Order';
  return {
    ...o,
    date,
    description: desc,
  };
}

export async function orderRoutes(app: any, prefix = '') {
  const orderRepo = AppDataSource.getRepository(Order);
  const orgMemberRepo = AppDataSource.getRepository(require('../models/organisationMember.entity').OrganisationMember);

  async function getOrgMembershipRole(userId: number, orgId: number): Promise<string | null> {
    const m = await orgMemberRepo.findOne({ where: { userId, organisationId: orgId } });
    return m?.orgRole || null;
  }

  async function getManagedOrgIds(userId: number): Promise<number[]> {
    const rows = await orgMemberRepo.find({ where: { userId } });
    return rows
      .filter((m: any) => m.orgRole === 'admin' || m.orgRole === 'owner')
      .map((m: any) => Number(m.organisationId))
      .filter((v: number) => Number.isFinite(v));
  }

  app.post(prefix + '/orders', async (ctx: any) => {
    const f = await requireFeature(ctx, 'billing'); if (f !== true) return f;
    const user = ctx.user as any;
    const body = ctx.body as Partial<Order>;

    if (user.parentId) {
      if (body.orgId) {
        ctx.set.status = 403;
        return { error: 'child_accounts_cannot_create_org_orders', message: 'Child accounts may not create organisation orders.' };
      }
      if (body.amount != null && Number(body.amount) > 0) {
        ctx.set.status = 403;
        return { error: 'child_accounts_cannot_create_paid_orders', message: 'Child accounts can only create free or education orders.' };
      }
      if (body.planId != null) {
        const planRepo = AppDataSource.getRepository(Plan);
        const plan = await planRepo.findOneBy({ id: Number(body.planId) });
        if (!plan) {
          ctx.set.status = 400;
          return { error: 'invalid_plan_id', message: 'Plan not found' };
        }
        const allowedTypes = ['free', 'edu'];
        if (!allowedTypes.includes(String(plan.type).toLowerCase())) {
          ctx.set.status = 403;
          return { error: 'child_accounts_can_only_order_free_or_edu_plans', message: 'Child accounts may only order free or education plans.' };
        }
      }
    }

    if (body.orgId) {
      const role = await getOrgMembershipRole(user.id, Number(body.orgId));
      if (!role) {
        ctx.set.status = 403;
        return { error: 'Not member of organisation' };
      }
      if (role !== 'admin' && role !== 'owner') {
        ctx.set.status = 403;
        return { error: 'Insufficient organisation privileges' };
      }
    }

    const order = orderRepo.create({
      ...body,
      userId: user.id,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(new Date().setFullYear(new Date().getFullYear() + 10)),
    });
    await orderRepo.save(order);
    return { success: true, order: normalizeOrder(order) };
  }, {
    beforeHandle: [authenticate, authorize('orders:create')],
    response: { 200: t.Object({ success: t.Boolean(), order: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Create order', tags: ['Orders'] }
  });

  app.get(prefix + '/orders', async (ctx: any) => {
    const f = await requireFeature(ctx, 'billing'); if (f !== true) return f;
    const user = ctx.user as any;
    let rows: any[] = [];
    const managedOrgIds = await getManagedOrgIds(user.id);
    if (managedOrgIds.length > 0) {
      rows = await orderRepo.find({ where: [{ userId: user.id }, ...managedOrgIds.map((orgId) => ({ orgId }))] as any });
    } else {
      rows = await orderRepo.find({ where: { userId: user.id } });
    }
    return rows.map(normalizeOrder);
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'List orders', tags: ['Orders'] }
  });

  app.get(prefix + '/orders/:id', async (ctx: any) => {
    const order = await orderRepo.findOneBy({ id: Number(ctx.params['id']) });
    if (!order) {
      ctx.set.status = 404;
      return { error: 'Order not found' };
    }
    const user = ctx.user as any;
    if (order.userId === user.id) {
      return normalizeOrder(order);
    }
    if (order.orgId) {
      const role = await getOrgMembershipRole(user.id, Number(order.orgId));
      if (role === 'admin' || role === 'owner') {
        return normalizeOrder(order);
      }
    }
    ctx.set.status = 403;
    return { error: 'Forbidden' };
  }, {
    beforeHandle: authenticate,
    response: { 200: t.Any(), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
    detail: { summary: 'Fetch order by id', tags: ['Orders'] }
  });

  app.get(prefix + '/orders/:id/invoice', async (ctx: any) => {
    const id = Number(ctx.params['id']);
    const order = await orderRepo.findOneBy({ id });
    if (!order) {
      ctx.set.status = 404;
      return { error: 'Order not found' };
    }
    const user = ctx.user as any;
    if (order.userId === user.id) {
      // skip
    } else if (order.orgId) {
      const role = await getOrgMembershipRole(user.id, Number(order.orgId));
      if (role !== 'admin' && role !== 'owner') {
        ctx.set.status = 403;
        return { error: 'Forbidden' };
      }
    } else {
      const parentUser = await AppDataSource.getRepository(require('../models/user.entity').User).findOneBy({ id: user.id });
      if (!parentUser || parentUser.id !== user.id) {
        // bite ah nvm
      }
      const childUser = await AppDataSource.getRepository(require('../models/user.entity').User).findOneBy({ id: order.userId });
      if (!childUser || childUser.parentId !== user.id) {
        ctx.set.status = 403;
        return { error: 'Forbidden' };
      }
    }

    try {
      const pdfBuf = await renderInvoicePdf(order as any);
      return new Response(pdfBuf as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="invoice-${order.id}.pdf"`
        }
      });
    } catch (e: any) {
      console.error('invoice generation failed', e);
      ctx.set.status = 500;
      return { error: 'Failed to generate invoice' };
    }
  }, {
    beforeHandle: [authenticate],
    response: {
      200: t.Any(),
      401: t.Object({ error: t.String() }),
      403: t.Object({ error: t.String() }),
      404: t.Object({ error: t.String() }),
      500: t.Object({ error: t.String() })
    },
    detail: { summary: 'Download invoice PDF', tags: ['Orders'] }
  });
}
