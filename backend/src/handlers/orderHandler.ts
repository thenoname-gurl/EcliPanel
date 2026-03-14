import { AppDataSource } from '../config/typeorm';
import { Order } from '../models/order.entity';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { t } from 'elysia';
import PDFDocument from 'pdfkit';
import stream from 'stream';
import fs from 'fs';
import path from 'path';

async function renderInvoicePdf(order: Order): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const bufs: Uint8Array[] = [];
      doc.on('data', (d: Uint8Array) => bufs.push(d));
      doc.on('end', () => resolve(Buffer.concat(bufs)));

      const logoPath = path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', 'assets', 'icons', 'logo.png');
      if (fs.existsSync(logoPath)) {
        try { doc.image(logoPath, 50, 45, { width: 90 }); } catch (e) { /* skip */ }
      }
      const companyName = process.env.COMPANY_NAME || 'EclipseSystems';
      doc.fontSize(16).text(companyName, 150, 50);
      doc.fontSize(10).fillColor('gray').text('Hosting Provider Services', 150, 68);

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

export async function orderRoutes(app: any, prefix = '') {
  const orderRepo = AppDataSource.getRepository(Order);

  app.post(prefix + '/orders', async (ctx: any) => {
    const user = ctx.user as any;
    const body = ctx.body as Partial<Order>;

    if (body.orgId) {
      if (!user.org || user.org.id !== body.orgId) {
        ctx.set.status = 403;
        return { error: 'Not member of organisation' };
      }
      if (user.orgRole !== 'admin' && user.orgRole !== 'owner') {
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
    return { success: true, order };
  }, {
    beforeHandle: [authenticate, authorize('orders:create')],
    response: { 200: t.Object({ success: t.Boolean(), order: t.Any() }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 403: t.Object({ error: t.String() }) },
    detail: { summary: 'Create order', tags: ['Orders'] }
  });

  app.get(prefix + '/orders', async (ctx: any) => {
    const user = ctx.user as any;
    if (user.role === 'admin' || user.role === '*') {
      return await orderRepo.find();
    }
    if (user.org && (user.orgRole === 'admin' || user.orgRole === 'owner')) {
      return await orderRepo.find({ where: [{ orgId: user.org.id }, { userId: user.id }] });
    }
    return await orderRepo.find({ where: { userId: user.id } });
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
    if (order.userId === user.id || user.role === 'admin' || user.role === '*') {
      return order;
    }
    if (order.orgId && user.org && user.org.id === order.orgId && (user.orgRole === 'admin' || user.orgRole === 'owner')) {
      return order;
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
    if (!(order.userId === user.id || user.role === 'admin' || user.role === '*')) {
      if (!(order.orgId && user.org && user.org.id === order.orgId && (user.orgRole === 'admin' || user.orgRole === 'owner'))) {
        ctx.set.status = 403;
        return { error: 'Forbidden' };
      }
    }

    try {
      const pdfBuf = await renderInvoicePdf(order as any);
      return new Response(pdfBuf, {
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
