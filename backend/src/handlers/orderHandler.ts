import { AppDataSource } from '../config/typeorm';
import { Order } from '../models/order.entity';
import { Coupon } from '../models/coupon.entity';
import { CouponUse } from '../models/couponUse.entity';
import { User } from '../models/user.entity';
import { Plan } from '../models/plan.entity';
import { PanelSetting } from '../models/panelSetting.entity';
import { authenticate } from '../middleware/auth';
import { requireFeature } from '../middleware/featureToggle';
import { t } from 'elysia';
import PDFDocument from 'pdfkit';
import stream from 'stream';
import path from 'path';
import { generateInvoicePdf } from '../workers/pdfWorker';

async function resolvePaymentMethodLabel(methodId: string): Promise<string | null> {
  if (!methodId) return null;
  try {
    const settingRepo = AppDataSource.getRepository(PanelSetting);
    const row = await settingRepo.findOneBy({ key: 'paymentMethods' });
    if (!row?.value) return null;
    const methods = JSON.parse(row.value);
    const found = methods.find((m: any) => m.id === methodId);
    return found?.label || null;
  } catch {
    return null;
  }
}

export async function renderInvoicePdf(order: Order): Promise<Buffer> {
  const enrichedOrder: any = { ...order };
  if ((order as any).paymentMethod) {
    enrichedOrder.paymentMethodLabel = await resolvePaymentMethodLabel((order as any).paymentMethod);
  }
  if ((order as any).planId) {
    try {
      const planRepo = AppDataSource.getRepository(Plan);
      const plan = await planRepo.findOneBy({ id: Number((order as any).planId) });
      if (plan) {
        enrichedOrder.planName = plan.name;
        enrichedOrder.planFeatures = Array.isArray((plan as any).features?.list)
          ? (plan as any).features.list
          : Array.isArray((plan as any).features)
            ? (plan as any).features
            : [];
      }
    } catch {}
  }
  const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const dueDate = new Date(createdAt.getTime() + 7 * 24 * 3600 * 1000);
  const expiresAt = order.expiresAt ? new Date(order.expiresAt) : null;
  const monthDiff = expiresAt
    ? Math.max(1, (expiresAt.getFullYear() - createdAt.getFullYear()) * 12 + (expiresAt.getMonth() - createdAt.getMonth()))
    : 1;
  enrichedOrder.invoiceDueDate = dueDate.toISOString();
  enrichedOrder.servicePeriod = {
    from: createdAt.toISOString(),
    to: expiresAt ? expiresAt.toISOString() : null,
    months: monthDiff,
  };

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
      return await generateInvoicePdf({ order: enrichedOrder, user: u, logoPath, companyName, issuedFrom });
    } catch (err) {
      // fallback below
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
        .then(async (u: any) => {
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
          const BASE_ROW_H = 20;
          items.forEach((it: any, idx: number) => {
            let desc = it.description || it.name || JSON.stringify(it);
            if ((order as any).planFeatures?.length > 0 && idx === 0) {
              desc += '\n' + (order as any).planFeatures.map((f: string) => `• ${f}`).join('\n');
            }
            const qty = Number(it.quantity ?? it.qty ?? 1);
            const price = Number(it.price ?? it.unit_price ?? 0);
            const lineTotal = qty * price;
            itemsSubtotal += lineTotal;
            doc.font('Helvetica').fontSize(9).fillColor('#1f2937');
            const descH = doc.heightOfString(desc, { width: 225, lineGap: 2 });
            const rowH = Math.max(BASE_ROW_H, descH + 10);
            // Description with wrapping, top-padded
            doc.text(desc, 50, curY + 4, { width: 225, lineGap: 2 });
            // Qty / Price / Total top-aligned
            const valY = curY + (BASE_ROW_H - 10) / 2;
            doc.text(String(qty), 280, valY, { width: 40, align: 'center', lineBreak: false });
            doc.text(`$${price.toFixed(2)}`, 340, valY, { width: 70, align: 'right', lineBreak: false });
            doc.text(`$${lineTotal.toFixed(2)}`, 420, valY, { width: 125, align: 'right', lineBreak: false });
            curY += rowH;
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
            const methodLabel = await resolvePaymentMethodLabel((order as any).paymentMethod);
            if (methodLabel) {
              doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text('PAYMENT DETAILS', 50, curY);
              doc.font('Helvetica').fontSize(9).fillColor('#1f2937').text(`Method: ${methodLabel}`, 50, curY + 12);
              curY += 28;
            }
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

async function normalizeOrderWithPayment(o: any) {
  const base = normalizeOrder(o);
  if (o.paymentMethod) {
    const label = await resolvePaymentMethodLabel(o.paymentMethod);
    if (label) base.paymentMethodLabel = label;
  }
  const createdAt = o.createdAt ? new Date(o.createdAt) : new Date();
  const dueDate = new Date(createdAt.getTime() + 7 * 24 * 3600 * 1000);
  const expiresAt = o.expiresAt ? new Date(o.expiresAt) : null;
  const monthDiff = expiresAt
    ? Math.max(1, (expiresAt.getFullYear() - createdAt.getFullYear()) * 12 + (expiresAt.getMonth() - createdAt.getMonth()))
    : 1;
  base.invoiceDueDate = dueDate.toISOString();
  base.servicePeriod = {
    from: createdAt.toISOString(),
    to: expiresAt ? expiresAt.toISOString() : null,
    months: monthDiff,
  };
  if (o.planId) {
    try {
      const planRepo = AppDataSource.getRepository(Plan);
      const plan = await planRepo.findOneBy({ id: Number(o.planId) });
      if (plan) {
        base.planName = plan.name;
        base.planSpecs = {
          cpu: plan.cpu,
          memory: plan.memory,
          disk: plan.disk,
          serverLimit: plan.serverLimit,
          backups: plan.backups,
          databases: plan.databases,
        };
      }
    } catch {}
  }
  return base;
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

      const { orgId, items, amount, description, planId, notes, activateMode } = body as any;

      const effectiveAmount = amount != null ? Number(amount) : 0;
      const isQueuedForRenewal = activateMode === 'renewal';
      const isFree = effectiveAmount === 0;

      let enrichedNotes = notes || undefined;
      if (isQueuedForRenewal) {
        enrichedNotes = enrichedNotes
          ? `${enrichedNotes}; queue_for_renewal:true`
          : 'queue_for_renewal:true';
      }

      let enrichedItems = items;
      if (planId != null) {
        try {
          const planRepo = AppDataSource.getRepository(Plan);
          const plan = await planRepo.findOneBy({ id: Number(planId) });
          if (plan) {
            const itemDesc = description || plan.name;
            if (items) {
              try {
                const parsed = JSON.parse(items);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  parsed[0].description = parsed[0].description || itemDesc;
                  enrichedItems = JSON.stringify(parsed);
                }
              } catch {}
            } else {
              enrichedItems = JSON.stringify([
                { description: itemDesc, quantity: 1, price: effectiveAmount }
              ]);
            }
          }
        } catch {}
      }

      const order = orderRepo.create({
        orgId,
        items: enrichedItems,
        amount: effectiveAmount,
        description,
        planId,
        notes: enrichedNotes,
        userId: user.id,
        status: isFree ? 'active' : 'pending',
        createdAt: new Date(),
        expiresAt: new Date(new Date().setMonth(new Date().getMonth() + 1)),
      });

      if (isQueuedForRenewal) {
        const activeOrders = await orderRepo.find({
          where: { userId: user.id, status: 'active' },
        });
        const pendingQueued = await orderRepo
          .createQueryBuilder('o')
          .where('o.userId = :uid', { uid: user.id })
          .andWhere('o.status IN (:...statuses)', { statuses: ['pending', 'awaiting_payment', 'payment_sent'] })
          .andWhere("o.notes LIKE '%queue_for_renewal%'")
          .getMany();

        const allRelevant = [...activeOrders, ...pendingQueued];
        if (allRelevant.length > 0) {
          const latest = allRelevant.reduce((latest, o) =>
            new Date(o.expiresAt) > new Date(latest.expiresAt) ? o : latest
          , allRelevant[0]);
          const queueStart = new Date(latest.expiresAt);
          queueStart.setMonth(queueStart.getMonth() + 1);
          order.expiresAt = queueStart;
        }
      }

      if (isFree) {
        const prevActive = await orderRepo.find({
          where: { userId: user.id, status: 'active' },
        });

        if (!isQueuedForRenewal) {
          if (prevActive.length > 0) {
            for (const prev of prevActive) {
              prev.status = 'cancelled';
              prev.notes = prev.notes
                ? `${prev.notes}; Replaced by order #${order.id} on ${new Date().toISOString()}`
                : `Replaced by order #${order.id} on ${new Date().toISOString()}`;
            }
            await orderRepo.save(prevActive);

            const couponRepo = AppDataSource.getRepository(Coupon);
            const couponUseRepo = AppDataSource.getRepository(CouponUse);
            for (const prev of prevActive) {
              if (prev.couponId) {
                const coupon = await couponRepo.findOneBy({ id: Number(prev.couponId) });
                if (coupon) {
                  coupon.currentUsesTotal = Math.max(0, coupon.currentUsesTotal - 1);
                  await couponRepo.save(coupon);
                }
                await couponUseRepo.delete({
                  couponId: prev.couponId,
                  userId: prev.userId,
                });
              }
            }
          }
        }

        await orderRepo.save(order);

        if (!isQueuedForRenewal && planId != null) {
          try {
            const planRepo2 = AppDataSource.getRepository(Plan);
            const userRepo2 = AppDataSource.getRepository(require('../models/user.entity').User);
            const plan = await planRepo2.findOneBy({ id: Number(planId) });
            if (plan) {
              const userEntity = await userRepo2.findOneBy({ id: user.id });
              if (userEntity) {
                const limits: Record<string, number> = {};
                if (plan.memory != null) limits.memory = plan.memory;
                if (plan.disk != null) limits.disk = plan.disk;
                if (plan.cpu != null) limits.cpu = plan.cpu;
                if (plan.serverLimit != null) limits.serverLimit = plan.serverLimit;
                if (plan.databases != null) limits.databases = plan.databases;
                if (plan.backups != null) limits.backups = plan.backups;
                if (plan.portCount != null) limits.portCount = plan.portCount;
                if (plan.tunnelPortCount != null) limits.tunnelPortCount = plan.tunnelPortCount;

                const existingLimits = (userEntity as any).limits || {};
                if (Object.keys(limits).length) {
                  for (const key of Object.keys(limits)) {
                    if ((existingLimits[key] ?? 0) < limits[key]) {
                      existingLimits[key] = limits[key];
                    }
                  }
                  userEntity.limits = existingLimits;
                }
                userEntity.portalType = plan.type;
                await userRepo2.save(userEntity);
              }
            }
          } catch {}
        }

        return { success: true, order: normalizeOrder(order), autoActivated: true };
      }

      await orderRepo.save(order);
      return { success: true, order: normalizeOrder(order) };
    },
    {
      beforeHandle: [authenticate],
      response: {
        200: t.Object({ success: t.Boolean(), order: t.Any(), autoActivated: t.Optional(t.Boolean()) }),
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

      const now = new Date();
      for (const row of rows) {
        if (
          (row.status === 'awaiting_payment' || row.status === 'payment_sent') &&
          row.createdAt
        ) {
          const due = new Date(row.createdAt.getTime() + 7 * 24 * 3600 * 1000);
          if (now > due) {
            row.status = 'expired';
            row.notes = row.notes
              ? `${row.notes}; Expired on ${now.toISOString()}`
              : `Expired on ${now.toISOString()}`;
          }
        }
      }
      await orderRepo.save(rows.filter(r => r.status === 'expired'));

      return Promise.all(rows.map(normalizeOrderWithPayment));
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
      if (order.userId !== user.id) {
        if (!order.orgId) {
          ctx.set.status = 403;
          return { error: ctx.t('common.forbidden') };
        }
        const role = await getOrgMembershipRole(user.id, Number(order.orgId));
        if (role !== 'admin' && role !== 'owner') {
          ctx.set.status = 403;
          return { error: ctx.t('common.forbidden') };
        }
      }

      let plan = null;
      if (order.planId) {
        try {
          const planRepo = AppDataSource.getRepository(Plan);
          plan = await planRepo.findOneBy({ id: order.planId });
        } catch {}
      }

      const result = normalizeOrder(order);
      if (plan) result.plan = plan;
      return result;
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

  app.post(
    prefix + '/orders/:id/cancel',
    async (ctx: any) => {
      const user = ctx.user as any;
      const orderId = Number(ctx.params.id);
      const order = await orderRepo.findOneBy({ id: orderId });
      if (!order) {
        ctx.set.status = 404;
        return { error: ctx.t('order.notFound') };
      }
      if (order.userId !== user.id) {
        ctx.set.status = 403;
        return { error: ctx.t('common.forbidden') };
      }
      const cancellableStatuses = ['pending', 'awaiting_payment', 'payment_sent', 'active'];
      if (!cancellableStatuses.includes(order.status)) {
        ctx.set.status = 400;
        return { error: ctx.t('payment.cannotCancel') };
      }

      order.status = 'cancelled';
      order.notes = order.notes
        ? `${order.notes}; Cancelled by user on ${new Date().toISOString()}`
        : `Cancelled by user on ${new Date().toISOString()}`;
      await orderRepo.save(order);

      if (order.couponId) {
        const couponRepo = AppDataSource.getRepository(Coupon);
        const couponUseRepo = AppDataSource.getRepository(CouponUse);
        const coupon = await couponRepo.findOneBy({ id: Number(order.couponId) });
        if (coupon) {
          coupon.currentUsesTotal = Math.max(0, coupon.currentUsesTotal - 1);
          await couponRepo.save(coupon);
        }
        await couponUseRepo.delete({
          couponId: order.couponId,
          userId: user.id,
        });
      }

      const remaining = await orderRepo.find({
        where: { userId: user.id, status: 'active' },
      });
      if (remaining.length === 0) {
        const planRepo = AppDataSource.getRepository(Plan);
        const freePlan = await planRepo.findOneBy({ type: 'free', isDefault: true });
        if (!freePlan) {
          const fallback = await planRepo.findOneBy({ type: 'free' });
          if (fallback) {
            (ctx.user as any).portalType = 'free';
            (ctx.user as any).limits = {
              memory: fallback.memory ?? 1024,
              disk: fallback.disk ?? 10240,
              cpu: fallback.cpu ?? 1,
              serverLimit: fallback.serverLimit ?? 1,
              databases: fallback.databases ?? 1,
              backups: fallback.backups ?? 1,
              portCount: fallback.portCount ?? 1,
              tunnelPortCount: fallback.tunnelPortCount ?? 1,
              emailSendDailyLimit: fallback.emailSendDailyLimit ?? 3,
              emailSendQueueLimit: fallback.emailSendQueueLimit ?? 3,
            };
          }
        } else {
          const userRepo = AppDataSource.getRepository(require('../models/user.entity').User);
          const userEntity = await userRepo.findOneBy({ id: user.id });
          if (userEntity) {
            userEntity.portalType = 'free';
            userEntity.limits = {
              memory: freePlan.memory ?? 1024,
              disk: freePlan.disk ?? 10240,
              cpu: freePlan.cpu ?? 1,
              serverLimit: freePlan.serverLimit ?? 1,
              databases: freePlan.databases ?? 1,
              backups: freePlan.backups ?? 1,
              portCount: freePlan.portCount ?? 1,
              tunnelPortCount: freePlan.tunnelPortCount ?? 1,
              emailSendDailyLimit: freePlan.emailSendDailyLimit ?? 3,
              emailSendQueueLimit: freePlan.emailSendQueueLimit ?? 3,
            };
            await userRepo.save(userEntity);
          }
        }
      }

      return { success: true, order: normalizeOrder(order) };
    },
    {
      beforeHandle: [authenticate],
      detail: { summary: 'Cancel own active plan', tags: ['Orders'] },
    }
  );
}
