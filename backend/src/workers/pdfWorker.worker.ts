import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

self.addEventListener('message', async (ev: any) => {
  const { id, payload } = ev.data || {};
  try {
    const { order, user, logoPath, companyName } = payload || {};
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const bufs: Uint8Array[] = [];
    doc.on('data', (d: Uint8Array) => bufs.push(d));
    doc.on('end', () => {
      try {
        const out = Buffer.concat(bufs);
        const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
        // @ts-ignore
        self.postMessage({ id, result: ab }, [ab]);
      } catch (e: any) {
        // @ts-ignore
        self.postMessage({ id, error: String(e?.message || e) });
      }
    });

    try {
      if (logoPath && fs.existsSync(logoPath)) {
        try { doc.image(logoPath, 50, 45, { width: 90 }); } catch (e) {}
      }
    } catch {}
    const name = companyName || (process.env.COMPANY_NAME || 'EclipseSystems');
    doc.fontSize(16).text(name, 150, 50);
    doc.fontSize(10).fillColor('gray').text('Hosting Provider Services', 150, 68);

    const issuedAt = order.createdAt ? new Date(order.createdAt) : new Date();
    doc.fontSize(20).fillColor('black').text('INVOICE', 400, 50, { align: 'right' });
    doc.fontSize(10).fillColor('black').text(`Invoice #: ${order.id}`, { align: 'right' });
    doc.text(`Date: ${issuedAt.toLocaleDateString()}`, { align: 'right' });

    doc.moveDown(2);

    doc.fontSize(12).fillColor('black').text('Bill To:', 50, 140);
    try {
      const fullNameParts = [user?.firstName, user?.middleName, user?.lastName].filter(Boolean as any);
      const displayName = fullNameParts.length ? fullNameParts.join(' ') : user?.email || 'Customer';
      const lines = [displayName];
      if (user?.billingCompany) lines.push(user.billingCompany);
      if (user?.address) lines.push(user.address);
      if (user?.address2) lines.push(user.address2);
      const city = [user?.billingCity, user?.billingState, user?.billingZip].filter(Boolean).join(', ');
      if (city) lines.push(city);
      if (user?.billingCountry) lines.push(user.billingCountry);
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
    } catch (e) {
      doc.fontSize(10).text(order.description || order.items || 'Order details not available');
    }

    doc.end();
  } catch (err: any) {
    // @ts-ignore
    self.postMessage({ id, error: String(err?.message || err) });
  }
});
