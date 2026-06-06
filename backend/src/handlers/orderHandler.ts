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
import path from 'path';
import { generateInvoicePdf } from '../workers/pdfWorker';

async function renderInvoicePdf(order: Order): Promise<Buffer> {
  try {
    const userRepo = AppDataSource.getRepository(User as any);
    const u = await userRepo.findOneBy({ id: order.userId }).catch(() => null);
    const defaultLogo = path.resolve(
      import.meta.dir,
      '..',
      '..',
      '..',
      'frontend',
      'public',
      'assets',
      'icons',
      'logo.png'
    );
    const logoPath = process.env.INVOICE_LOGO_PATH
      ? path.resolve(process.env.INVOICE_LOGO_PATH)
      : defaultLogo;
    const companyName = process.env.COMPANY_NAME || 'EclipseSystems';
    const issuedFrom = {
      name: process.env.INVOICE_ISSUED_FROM_NAME || process.env.COMPANY_NAME || 'EclipseSystems',
      address: process.env.INVOICE_ISSUED_FROM_ADDRESS || process.env.COMPANY_ADDRESS || '',
      city: process.env.INVOICE_ISSUED_FROM_CITY || '',
      state: process.env.INVOICE_ISSUED_FROM_STATE || '',
      zip: process.env.INVOICE_ISSUED_FROM_ZIP || '',
      country: process.env.INVOICE_ISSUED_FROM_COUNTRY || '',
      taxId: process.env.INVOICE_ISSUED_FROM_TAX_ID || '',
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

      const defaultLogo = path.resolve(
        import.meta.dir,
        '..',
        '..',
        '..',
        'frontend',
        'public',
        'assets',
        'icons',
        'logo.png'
      );
      const logoPath = process.env.INVOICE_LOGO_PATH
        ? path.resolve(process.env.INVOICE_LOGO_PATH)
        : defaultLogo;
      if (Bun.file(logoPath).size !== -1) {
        try { doc.image(logoPath, 50, 45, { height: 40 }); } catch {}
      }

      const brand = process.env.COMPANY_NAME || 'EclipseSystems';
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text(brand, 50, 45);
      doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text('Hosting & Cloud Infrastructure', 50, 66);

      const issuedAt = order.createdAt ? new Date(order.createdAt) : new Date();
      const dueAt = order.expiresAt ? new Date(order.expiresAt) : null;
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#111827').text('INVOICE', 50, 45, { align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor('#374151').text(`Invoice #${order.id}`, 50, 68, { align: 'right' });
      doc.fontSize(9).fillColor('#6b7280').text(`Date: ${issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 50, 79, { align: 'right' });
      if (dueAt) doc.text(`Due: ${dueAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 50, 90, { align: 'right' });

      let curY = dueAt ? 115 : 100;
      doc.moveTo(50, curY).lineTo(545, curY).strokeColor('#e5e7eb').lineWidth(0.8).stroke();
      curY += 16;

      const issuedFromEnv = {
        name: process.env.INVOICE_ISSUED_FROM_NAME || process.env.COMPANY_NAME || '',
        address: process.env.INVOICE_ISSUED_FROM_ADDRESS || process.env.COMPANY_ADDRESS || '',
        city: process.env.INVOICE_ISSUED_FROM_CITY || '',
        state: process.env.INVOICE_ISSUED_FROM_STATE || '',
        zip: process.env.INVOICE_ISSUED_FROM_ZIP || '',
        country: process.env.INVOICE_ISSUED_FROM_COUNTRY || '',
        taxId: process.env.INVOICE_ISSUED_FROM_TAX_ID || '',
        email: process.env.INVOICE_ISSUED_FROM_EMAIL || '',
      };
      const fromLines: string[] = [issuedFromEnv.name, issuedFromEnv.address,
        [issuedFromEnv.city, issuedFromEnv.state, issuedFromEnv.zip, issuedFromEnv.country].filter(Boolean).join(', '),
        issuedFromEnv.taxId ? `Tax ID: ${issuedFromEnv.taxId}` : '',
      ].filter(Boolean);

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text('FROM', 50, curY);
      doc.font('Helvetica').fontSize(10).fillColor('#111827');
      let fY = curY + 13;
      for (const line of fromLines) { doc.text(line, 50, fY); fY += 13; }

      const userRepo = AppDataSource.getRepository(require('../models/user.entity').User);
      userRepo
        .findOneBy({ id: order.userId })
        .then((u: any) => {
          const fullNameParts = [u?.firstName, u?.middleName, u?.lastName].filter(Boolean as any);
          const name = fullNameParts.length ? fullNameParts.join(' ') : u?.email || 'Customer';
          const billLines: string[] = [name];
          if (u?.billingCompany) billLines.push(u.billingCompany);
          if (u?.address) billLines.push(u.address);
          if (u?.address2) billLines.push(u.address2);
          const city = [u?.billingCity, u?.billingState, u?.billingZip, u?.billingCountry].filter(Boolean).join(', ');
          if (city) billLines.push(city);

          doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text('BILL TO', 280, curY);
          doc.font('Helvetica').fontSize(10).fillColor('#111827');
          let bY = curY + 13;
          for (const line of billLines) { doc.text(line, 280, bY); bY += 13; }

          let items: any[] = [];
          try { items = JSON.parse(order.items); } catch { items = []; }
          if (!Array.isArray(items) || items.length === 0) {
            const desc = order.description || order.items || 'Order';
            items = [{ description: desc, quantity: 1, price: Number(order.amount ?? 0) }];
          }

          curY = Math.max(fY, bY) + 24;
          doc.moveTo(50, curY).lineTo(545, curY).strokeColor('#e5e7eb').lineWidth(0.8).stroke();
          curY += 12;

          const amount = Number(order.amount ?? 0);
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text('DESCRIPTION', 50, curY);
          doc.text('QTY', 280, curY, { width: 40, align: 'center' });
          doc.text('PRICE', 340, curY, { width: 70, align: 'right' });
          doc.text('AMOUNT (USD)', 420, curY, { width: 125, align: 'right' });
          curY += 14;

          doc.moveTo(50, curY).lineTo(545, curY).strokeColor('#d1d5db').lineWidth(0.4).stroke();
          curY += 8;

          let itemsSubtotal = 0;
          doc.font('Helvetica').fontSize(9).fillColor('#1f2937');
          items.forEach((it: any) => {
            const desc = it.description || it.name || JSON.stringify(it);
            const qty = Number(it.quantity ?? it.qty ?? 1);
            const price = Number(it.price ?? it.unit_price ?? 0);
            const lineTotal = qty * price;
            itemsSubtotal += lineTotal;
            doc.text(desc, 50, curY, { width: 225 });
            doc.text(String(qty), 280, curY, { width: 40, align: 'center' });
            doc.text(`$${price.toFixed(2)}`, 340, curY, { width: 70, align: 'right' });
            doc.text(`$${lineTotal.toFixed(2)}`, 420, curY, { width: 125, align: 'right' });
            curY += 16;
          });

          curY += 8;
          doc.moveTo(50, curY).lineTo(545, curY).strokeColor('#d1d5db').lineWidth(0.4).stroke();
          curY += 12;

          doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text('Subtotal', 340, curY, { width: 70, align: 'right' });
          doc.fillColor('#1f2937').text(`$${itemsSubtotal.toFixed(2)}`, 420, curY, { width: 125, align: 'right' });
          curY += 18;

          if ((order as any).taxAmount > 0) {
            doc.fillColor('#6b7280').text('Tax', 340, curY, { width: 70, align: 'right' });
            doc.fillColor('#1f2937').text(`$${Number((order as any).taxAmount).toFixed(2)}`, 420, curY, { width: 125, align: 'right' });
            curY += 18;
          }

          doc.moveTo(340, curY).lineTo(545, curY).strokeColor('#111827').lineWidth(1.2).stroke();
          curY += 8;

          doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('TOTAL USD', 340, curY, { width: 70, align: 'right' });
          doc.text(`$${amount.toFixed(2)}`, 420, curY, { width: 125, align: 'right' });
          curY += 32;

          if ((order as any).paymentMethod) {
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text('Method', 50, curY);
            doc.font('Helvetica').fontSize(9).fillColor('#1f2937').text((order as any).paymentMethod, 50, curY + 12);
            curY += 28;
          }

          doc.moveTo(50, 785).lineTo(545, 785).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
          doc.font('Helvetica').fontSize(7).fillColor('#9ca3af')
            .text([issuedFromEnv.name, issuedFromEnv.taxId ? `Tax ID: ${issuedFromEnv.taxId}` : '', issuedFromEnv.email].filter(Boolean).join('  •  '), 50, 793, { width: 495, align: 'center' });
          doc.fontSize(6).fillColor('#d1d5db')
            .text(`Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}  |  Powered by EcliPanel`, 50, 805, { width: 495, align: 'center' });

          doc.end();
        })
        .catch(() => {
          doc.font('Helvetica').fontSize(10).fillColor('#374151').text(order.description || order.items || 'Order details not available', 50, curY);
          doc.end();
        });
    } catch (e) {
      reject(e);
    }
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
  const date = o.createdAt
    ? o.createdAt instanceof Date
      ? o.createdAt.toISOString()
      : new Date(o.createdAt).toISOString()
    : new Date().toISOString();
  const desc = o.description || deriveDescriptionFromItems(o.items) || 'Order';
  return {
    ...o,
    date,
    description: desc,
  };
}

export async function orderRoutes(app: any, prefix = '') {
  const orderRepo = AppDataSource.getRepository(Order);
  const orgMemberRepo = AppDataSource.getRepository(
    require('../models/organisationMember.entity').OrganisationMember
  );

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

  app.post(
    prefix + '/orders',
    async (ctx: any) => {
      const f = await requireFeature(ctx, 'billing');
      if (f !== true) return f;
      const user = ctx.user as any;
      const body = ctx.body as Partial<Order>;

      if (user.parentId) {
        if (body.orgId) {
          ctx.set.status = 403;
          return {
            error: 'child_accounts_cannot_create_org_orders',
            message: ctx.t('orders.childCannotCreateOrg'),
          };
        }
        if (body.amount != null && Number(body.amount) > 0) {
          ctx.set.status = 403;
          return {
            error: 'child_accounts_cannot_create_paid_orders',
            message: ctx.t('orders.childCanOnlyFreeOrEdu'),
          };
        }
        if (body.planId != null) {
          const planRepo = AppDataSource.getRepository(Plan);
          const plan = await planRepo.findOneBy({ id: Number(body.planId) });
          if (!plan) {
            ctx.set.status = 400;
            return { error: 'invalid_plan_id', message: ctx.t('orders.planNotFound') };
          }
          const allowedTypes = ['free', 'edu'];
          if (!allowedTypes.includes(String(plan.type).toLowerCase())) {
            ctx.set.status = 403;
            return {
              error: 'child_accounts_can_only_order_free_or_edu_plans',
              message: ctx.t('orders.childCanOnlyOrderFreeOrEdu'),
            };
          }
        }
      }

      if (body.orgId) {
        const role = await getOrgMembershipRole(user.id, Number(body.orgId));
        if (!role) {
          ctx.set.status = 403;
          return { error: ctx.t('organisation.notOwner') };
        }
        if (role !== 'admin' && role !== 'owner') {
          ctx.set.status = 403;
          return { error: ctx.t('organisation.insufficientPrivileges') };
        }
      }

      const { orgId, items, amount, description, planId, notes } = body as any;
      const order = orderRepo.create({
        orgId,
        items,
        amount,
        description,
        planId,
        notes,
        userId: user.id,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(new Date().setFullYear(new Date().getFullYear() + 10)),
      });
      await orderRepo.save(order);
      return { success: true, order: normalizeOrder(order) };
    },
    {
      beforeHandle: [authenticate, authorize('orders:create')],
      response: {
        200: t.Object({ success: t.Boolean(), order: t.Any() }),
        400: t.Object({ error: t.String() }),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Create order', tags: ['Orders'] },
    }
  );

  app.get(
    prefix + '/orders',
    async (ctx: any) => {
      const f = await requireFeature(ctx, 'billing');
      if (f !== true) return f;
      const user = ctx.user as any;
      let rows: any[] = [];
      const managedOrgIds = await getManagedOrgIds(user.id);
      if (managedOrgIds.length > 0) {
        rows = await orderRepo.find({
          where: [{ userId: user.id }, ...managedOrgIds.map(orgId => ({ orgId }))] as any,
        });
      } else {
        rows = await orderRepo.find({ where: { userId: user.id } });
      }
      return rows.map(normalizeOrder);
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Array(t.Any()),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
      },
      detail: { summary: 'List orders', tags: ['Orders'] },
    }
  );

  app.get(
    prefix + '/orders/:id',
    async (ctx: any) => {
      const order = await orderRepo.findOneBy({ id: Number(ctx.params['id']) });
      if (!order) {
        ctx.set.status = 404;
        return { error: ctx.t('order.notFound') };
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
      return { error: ctx.t('common.forbidden') };
    },
    {
      beforeHandle: authenticate,
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Fetch order by id', tags: ['Orders'] },
    }
  );

  app.get(
    prefix + '/orders/:id/invoice',
    async (ctx: any) => {
      const id = Number(ctx.params['id']);
      const order = await orderRepo.findOneBy({ id });
      if (!order) {
        ctx.set.status = 404;
        return { error: ctx.t('order.notFound') };
      }
      const user = ctx.user as any;
      if (order.userId === user.id) {
        // skip
      } else if (order.orgId) {
        const role = await getOrgMembershipRole(user.id, Number(order.orgId));
        if (role !== 'admin' && role !== 'owner') {
          ctx.set.status = 403;
          return { error: ctx.t('common.forbidden') };
        }
      } else {
        const parentUser = await AppDataSource.getRepository(
          require('../models/user.entity').User
        ).findOneBy({ id: user.id });
        if (!parentUser || parentUser.id !== user.id) {
          // bite ah nvm
        }
        const childUser = await AppDataSource.getRepository(
          require('../models/user.entity').User
        ).findOneBy({ id: order.userId });
        if (!childUser || childUser.parentId !== user.id) {
          ctx.set.status = 403;
          return { error: ctx.t('common.forbidden') };
        }
      }

      try {
        const pdfBuf = await renderInvoicePdf(order as any);
        return new Response(pdfBuf as any, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="invoice-${order.id}.pdf"`,
          },
        });
      } catch (e: any) {
        console.error('invoice generation failed', e);
        ctx.set.status = 500;
        return { error: ctx.t('system.invoiceGenerationFailed') };
      }
    },
    {
      beforeHandle: [authenticate],
      response: {
        200: t.Any(),
        401: t.Object({ error: t.String() }),
        403: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
        500: t.Object({ error: t.String() }),
      },
      detail: { summary: 'Download invoice PDF', tags: ['Orders'] },
    }
  );
}
