import PDFDocument from 'pdfkit';
import fs from 'fs';

const COLORS = {
  bg: '#0a0a0a',
  bgCard: '#111114',
  bgCardLight: '#16161a',
  primary: '#a855f7',
  primaryDim: '#7c3aed',
  primaryFaint: '#1a1028',
  accent: '#ec4899',
  accentDim: '#be185d',
  text: '#e2e8f0',
  textMedium: '#94a3b8',
  textDim: '#64748b',
  textFaint: '#334155',
  border: '#2d1b69',
  borderDim: '#1e1b3a',
  success: '#34d399',
  warning: '#fbbf24',
  error: '#f87171',
  white: '#ffffff',
  tableRowAlt: '#0f0f18',
  tableHeader: '#1a1030',
  marginDecor: '#1a1a2e',
};

function drawRoundedRect(
  doc: any,
  x: number, y: number, w: number, h: number,
  r: number, fill?: string, stroke?: string, strokeWidth = 0.5,
) {
  doc.save();
  if (fill) {
    doc.roundedRect(x, y, w, h, r).fillColor(fill).fill();
  }
  if (stroke) {
    doc.roundedRect(x, y, w, h, r).strokeColor(stroke).lineWidth(strokeWidth).stroke();
  }
  doc.restore();
}

function drawDottedLine(
  doc: any,
  x1: number, y: number, x2: number, color: string,
) {
  doc.save();
  doc.strokeColor(color).lineWidth(0.5)
    .moveTo(x1, y).lineTo(x2, y)
    .dash(2, { space: 3 }).stroke();
  doc.restore();
}

function generateBinaryStrip(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += Math.random() > 0.5 ? '1' : '0';
  }
  return s;
}

function drawMarginDecorations(doc: any, pageW: number, pageH: number, margin: number) {
  doc.save();
  doc.font('Helvetica').fontSize(5).fillColor(COLORS.marginDecor);

  // TODO FIX RIGHT/LEFT STRIP!
  //for (let y = 80; y < pageH - 80; y += 40) {
  //   const binary = generateBinaryStrip(6);
  //   doc.text(binary, 6, y, { width: margin - 10 });
  // }

  //for (let y = 100; y < pageH - 80; y += 40) {
  //  const binary = generateBinaryStrip(6);
  //  doc.text(binary, pageW - margin + 10, y, { width: margin - 10 });
  //}

  const topBinary = generateBinaryStrip(100);
  doc.text(topBinary, margin, 12, { width: pageW - margin * 2, align: 'center' });

  const bottomBinary = generateBinaryStrip(100);
  doc.text(bottomBinary, margin, pageH - 16, { width: pageW - margin * 2, align: 'center' });

  doc.restore();
}

self.addEventListener('message', async (ev: any) => {
  const { id, payload } = ev.data || {};
  try {
    const { order, user, logoPath, companyName, issuedFrom } = payload || {};

    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `Invoice #${order?.id ?? ''}`,
        Author: companyName || 'Eclipse Systems',
      },
    });

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

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const M = 45;
    const CW = PAGE_W - M * 2;

    doc.rect(0, 0, PAGE_W, PAGE_H).fill(COLORS.bg);

    doc.save();
    doc.strokeColor(COLORS.borderDim).lineWidth(0.3).opacity(0.15);
    for (let gx = 0; gx < PAGE_W; gx += 40) {
      doc.moveTo(gx, 0).lineTo(gx, PAGE_H).stroke();
    }
    for (let gy = 0; gy < PAGE_H; gy += 40) {
      doc.moveTo(0, gy).lineTo(PAGE_W, gy).stroke();
    }
    doc.restore();
    doc.opacity(1);

    doc.save();
    doc.rect(0, 0, PAGE_W, 250).fill(COLORS.bg);
    doc.rect(0, 0, PAGE_W, 200).opacity(0.08).fill(COLORS.primary);
    doc.restore();
    doc.opacity(1);

    drawMarginDecorations(doc, PAGE_W, PAGE_H, M);

    let curY = 35;

    const headerH = 100;
    drawRoundedRect(doc, M, curY, CW, headerH, 8, COLORS.bgCard, COLORS.border, 0.8);

    const dotsY = curY + 14;
    doc.save();
    doc.circle(M + 18, dotsY, 4).fill(COLORS.error);
    doc.circle(M + 32, dotsY, 4).fill(COLORS.warning);
    doc.circle(M + 46, dotsY, 4).fill(COLORS.success);
    doc.restore();

    doc.font('Helvetica').fontSize(7).fillColor(COLORS.textDim)
      .text('invoice.pdf', M + 58, dotsY - 3);

    doc.save();
    doc.moveTo(M + 1, curY + 26).lineTo(M + CW - 1, curY + 26)
      .strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.restore();

    let logoRendered = false;
    try {
      if (logoPath && fs.existsSync(logoPath)) {
        doc.image(logoPath, M + 15, curY + 36, { height: 40 });
        logoRendered = true;
      }
    } catch { }

    const nameX = logoRendered ? M + 65 : M + 15;
    const name = companyName || (process.env.COMPANY_NAME || 'Eclipse Systems');

    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.primary)
      .text(name, nameX, curY + 40, { width: 260 });
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.textDim)
      .text('Hosting & Cloud Infrastructure', nameX, curY + 60, { width: 260 });

    doc.font('Helvetica-Bold').fontSize(28).fillColor(COLORS.accent)
      .text('INVOICE', M + CW - 200, curY + 36, { width: 185, align: 'right' });

    const issuedAt = order.createdAt ? new Date(order.createdAt) : new Date();
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMedium)
      .text(`#${order.id}`, M + CW - 200, curY + 68, { width: 185, align: 'right' });
    doc.text(
      issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      M + CW - 200, curY + 80, { width: 185, align: 'right' },
    );

    const statusText = order.status === 'paid' || order.status === 'completed'
      ? 'PAID' : (order.status?.toUpperCase() || 'PENDING');
    const badgeColor = statusText === 'PAID' ? COLORS.success
      : statusText === 'PENDING' ? COLORS.warning : COLORS.error;

    curY += headerH + 10;

    const badgeW = 80;
    const badgeH = 22;
    const badgeX = M + CW - badgeW;
    drawRoundedRect(doc, badgeX, curY, badgeW, badgeH, 4, undefined, badgeColor, 1);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(badgeColor)
      .text(statusText, badgeX, curY + 6, { width: badgeW, align: 'center' });

    curY += badgeH + 15;

    const infoCardH = 100;
    const infoCardW = (CW - 15) / 2;

    drawRoundedRect(doc, M, curY, infoCardW, infoCardH, 6, COLORS.bgCard, COLORS.border, 0.5);
    drawRoundedRect(doc, M + infoCardW + 15, curY, infoCardW, infoCardH, 6, COLORS.bgCard, COLORS.border, 0.5);

    const issued = issuedFrom || {
      name: process.env.INVOICE_ISSUED_FROM_NAME || process.env.COMPANY_NAME || '',
      address: process.env.INVOICE_ISSUED_FROM_ADDRESS || process.env.COMPANY_ADDRESS || '',
      city: process.env.INVOICE_ISSUED_FROM_CITY || '',
      email: process.env.INVOICE_ISSUED_FROM_EMAIL || '',
    };

    const fromLines: string[] = [];
    if (issued.name) fromLines.push(issued.name);
    if (issued.address) fromLines.push(issued.address);
    if (issued.city) fromLines.push(issued.city);
    if (issued.email) fromLines.push(issued.email);

    let fY = curY + 12;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.accent)
      .text('# FROM', M + 14, fY);
    drawDottedLine(doc, M + 14, fY + 12, M + infoCardW - 14, COLORS.border);
    fY += 18;
    if (fromLines.length) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text)
        .text(fromLines[0], M + 14, fY, { width: infoCardW - 28 });
      fY += 14;
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMedium)
        .text(fromLines.slice(1).join('\n'), M + 14, fY, { width: infoCardW - 28, lineGap: 3 });
    }

    const billCardX = M + infoCardW + 15;
    let bY = curY + 12;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.accent)
      .text('# BILL TO', billCardX + 14, bY);
    drawDottedLine(doc, billCardX + 14, bY + 12, billCardX + infoCardW - 14, COLORS.border);
    bY += 18;

    const fullNameParts = [user?.firstName, user?.middleName, user?.lastName].filter(Boolean);
    const displayName = fullNameParts.length ? fullNameParts.join(' ') : (user?.email || 'Customer');
    const billLines: string[] = [displayName];
    if (user?.billingCompany) billLines.push(user.billingCompany);
    if (user?.address) billLines.push(user.address);
    if (user?.address2) billLines.push(user.address2);
    const cityLine = [user?.billingCity, user?.billingState, user?.billingZip].filter(Boolean).join(', ');
    if (cityLine) billLines.push(cityLine);
    if (user?.billingCountry) billLines.push(user.billingCountry);
    if (user?.email) billLines.push(user.email);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text)
      .text(billLines[0], billCardX + 14, bY, { width: infoCardW - 28 });
    bY += 14;
    if (billLines.length > 1) {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMedium)
        .text(billLines.slice(1).join('\n'), billCardX + 14, bY, { width: infoCardW - 28, lineGap: 3 });
    }

    curY += infoCardH + 20;

    let items: any[] = [];
    try { items = JSON.parse(order.items); } catch { items = []; }
    if (!Array.isArray(items)) items = [];
    if (items.length === 0 && order.description) {
      items = [{
        description: order.description || 'Service',
        quantity: 1,
        price: Number(order.amount ?? 0),
      }];
    }

    const ROW_H = 28;
    const HEADER_ROW_H = 30;
    const tableContentH = HEADER_ROW_H + (items.length * ROW_H) + 4;
    drawRoundedRect(doc, M, curY, CW, tableContentH + 30, 6, COLORS.bgCard, COLORS.border, 0.5);

    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.accent)
      .text('# LINE ITEMS', M + 14, curY + 10);
    drawDottedLine(doc, M + 14, curY + 22, M + CW - 14, COLORS.border);

    curY += 28;

    const TBL = {
      desc: { x: M + 14, w: CW * 0.44 },
      qty: { x: M + 14 + CW * 0.48, w: CW * 0.10 },
      price: { x: M + 14 + CW * 0.60, w: CW * 0.16 },
      total: { x: M + 14 + CW * 0.78, w: CW * 0.18 },
    };

    drawRoundedRect(doc, M + 8, curY, CW - 16, HEADER_ROW_H, 4, COLORS.tableHeader);
    const hTextY = curY + 9;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.primary);
    doc.text('DESCRIPTION', TBL.desc.x, hTextY, { width: TBL.desc.w });
    doc.text('QTY', TBL.qty.x, hTextY, { width: TBL.qty.w, align: 'center' });
    doc.text('PRICE', TBL.price.x, hTextY, { width: TBL.price.w, align: 'right' });
    doc.text('AMOUNT', TBL.total.x, hTextY, { width: TBL.total.w, align: 'right' });

    curY += HEADER_ROW_H + 2;

    let subtotal = 0;
    items.forEach((it: any, i: number) => {
      const desc = it.description || it.name || JSON.stringify(it);
      const qty = Number(it.quantity ?? it.qty ?? 1);
      const price = Number(it.price ?? it.unit_price ?? 0);
      const lineTotal = qty * price;
      subtotal += lineTotal;

      if (i % 2 === 0) {
        doc.save();
        doc.rect(M + 8, curY, CW - 16, ROW_H).fill(COLORS.tableRowAlt);
        doc.restore();
      }

      const rTextY = curY + 8;

      doc.font('Helvetica').fontSize(8).fillColor(COLORS.accent)
        .text('→', TBL.desc.x - 1, rTextY, { width: 12 });
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.text)
        .text(desc, TBL.desc.x + 14, rTextY, { width: TBL.desc.w - 14, lineBreak: false });
      doc.fillColor(COLORS.textMedium)
        .text(String(qty), TBL.qty.x, rTextY, { width: TBL.qty.w, align: 'center' });
      doc.fillColor(COLORS.textMedium)
        .text(`$${price.toFixed(2)}`, TBL.price.x, rTextY, { width: TBL.price.w, align: 'right' });
      doc.font('Helvetica-Bold').fillColor(COLORS.primary)
        .text(`$${lineTotal.toFixed(2)}`, TBL.total.x, rTextY, { width: TBL.total.w, align: 'right' });

      doc.save();
      doc.moveTo(M + 14, curY + ROW_H)
        .lineTo(M + CW - 14, curY + ROW_H)
        .strokeColor(COLORS.borderDim).lineWidth(0.3).stroke();
      doc.restore();

      curY += ROW_H;
    });

    curY += 20;

    const amount = Number(order.amount ?? subtotal);
    const tax = Number(order.tax ?? 0);
    const discount = Number(order.discount ?? 0);

    const totalsCardW = CW * 0.45;
    const totalsCardX = M + CW - totalsCardW;
    let totalsLines = 1;
    if (tax > 0) totalsLines++;
    if (discount > 0) totalsLines++;
    const totalsCardH = (totalsLines * 22) + 50;
    drawRoundedRect(doc, totalsCardX, curY, totalsCardW, totalsCardH, 6, COLORS.bgCard, COLORS.border, 0.5);

    let tY = curY + 12;
    const tLabelX = totalsCardX + 14;
    const tValX = totalsCardX + totalsCardW - 14;
    const tValW = 90;

    doc.font('Helvetica').fontSize(8).fillColor(COLORS.textDim)
      .text('Subtotal', tLabelX, tY);
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMedium)
      .text(`$${subtotal.toFixed(2)}`, tValX - tValW, tY, { width: tValW, align: 'right' });
    tY += 22;

    if (tax > 0) {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.textDim)
        .text('Tax', tLabelX, tY);
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMedium)
        .text(`$${tax.toFixed(2)}`, tValX - tValW, tY, { width: tValW, align: 'right' });
      tY += 22;
    }

    if (discount > 0) {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.success)
        .text('Discount', tLabelX, tY);
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.success)
        .text(`-$${discount.toFixed(2)}`, tValX - tValW, tY, { width: tValW, align: 'right' });
      tY += 22;
    }

    drawDottedLine(doc, tLabelX, tY, tValX, COLORS.border);
    tY += 8;

    const totalBoxH = 30;
    drawRoundedRect(doc, tLabelX - 4, tY, totalsCardW - 20, totalBoxH, 4, COLORS.primaryFaint, COLORS.primary, 1);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.accent)
      .text('TOTAL', tLabelX + 6, tY + 8);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.primary)
      .text(`$${amount.toFixed(2)}`, tValX - tValW - 10, tY + 6, { width: tValW + 10, align: 'right' });

    curY += totalsCardH + 20;

    if (order.paymentMethod || order.transactionId || order.notes) {
      const payH = 80;
      drawRoundedRect(doc, M, curY, CW, payH, 6, COLORS.bgCard, COLORS.border, 0.5);

      const pdY = curY + 12;
      doc.save();
      doc.circle(M + 18, pdY, 3).fill(COLORS.error);
      doc.circle(M + 28, pdY, 3).fill(COLORS.warning);
      doc.circle(M + 38, pdY, 3).fill(COLORS.success);
      doc.restore();
      doc.font('Helvetica').fontSize(6).fillColor(COLORS.textDim)
        .text('payment_details', M + 48, pdY - 2);

      doc.save();
      doc.moveTo(M + 1, curY + 22).lineTo(M + CW - 1, curY + 22)
        .strokeColor(COLORS.border).lineWidth(0.3).stroke();
      doc.restore();

      let dY = curY + 30;
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.textDim);

      if (order.paymentMethod) {
        doc.fillColor(COLORS.textDim).text('eclipse@billing ~ %', M + 14, dY, { continued: true });
        doc.fillColor(COLORS.primary).text(` method: `, { continued: true });
        doc.fillColor(COLORS.text).text(order.paymentMethod);
        dY += 14;
      }
      if (order.transactionId) {
        doc.fillColor(COLORS.textDim).text('eclipse@billing ~ %', M + 14, dY, { continued: true });
        doc.fillColor(COLORS.primary).text(` txn_id: `, { continued: true });
        doc.fillColor(COLORS.text).text(order.transactionId);
        dY += 14;
      }
      if (order.notes) {
        doc.fillColor(COLORS.textDim).text('eclipse@billing ~ %', M + 14, dY, { continued: true });
        doc.fillColor(COLORS.primary).text(` notes: `, { continued: true });
        doc.fillColor(COLORS.text).text(order.notes, { width: CW - 140 });
      }

      curY += payH + 15;
    }

    const footerY = PAGE_H - 75;

    drawRoundedRect(doc, M, footerY, CW, 50, 6, COLORS.bgCard, COLORS.border, 0.5);

    doc.save();
    doc.moveTo(M + 14, footerY + 1).lineTo(M + CW - 14, footerY + 1)
      .strokeColor(COLORS.primary).lineWidth(1.5).stroke();
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.primary)
      .text('Thank you for your business!', M, footerY + 14, { width: CW, align: 'center' });

    const footerParts: string[] = [];
    if (issued.name) footerParts.push(issued.name);
    if (issued.email) footerParts.push(issued.email);
    if (footerParts.length) {
      doc.font('Helvetica').fontSize(7).fillColor(COLORS.textDim)
        .text(footerParts.join('  •  '), M, footerY + 28, { width: CW, align: 'center' });
    }

    doc.font('Helvetica').fontSize(6).fillColor(COLORS.textFaint)
      .text(
        `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}  |  Powered by EcliPanel`,
        M, footerY + 40, { width: CW, align: 'center' },
      );

    doc.end();
  } catch (err: any) {
    // @ts-ignore
    self.postMessage({ id, error: String(err?.message || err) });
  }
});