import PDFDocument from 'pdfkit';

function drawTableRow(
  doc: any,
  y: number,
  rowH: number,
  cols: { x: number; w: number; text: string; align?: string; bold?: boolean }[],
  isHeader?: boolean
) {
  if (isHeader) {
    doc.save();
    doc.rect(cols[0].x - 4, y, cols[cols.length - 1].x + cols[cols.length - 1].w - cols[0].x + 8, rowH)
      .fill('#f3f4f6');
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151');
  } else {
    doc.font('Helvetica').fontSize(9).fillColor('#1f2937');
  }
  for (const col of cols) {
    doc.text(col.text, col.x, y + (rowH - 10) / 2, { width: col.w, align: col.align || 'left', lineBreak: false });
  }
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

    const PW = 595.28;
    const PH = 841.89;
    const ML = 50;
    const MR = 50;
    const MT = 50;
    const CW = PW - ML - MR;

    let logoRendered = false;
    try {
      if (logoPath && Bun.file(logoPath).size !== -1) {
        doc.image(logoPath, ML, MT, { height: 45 });
        logoRendered = true;
      }
    } catch {}

    const brandX = logoRendered ? ML + 58 : ML;
    const brand = companyName || process.env.COMPANY_NAME || 'Eclipse Systems';
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111827').text(brand, brandX, MT);
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text('Hosting & Cloud Infrastructure', brandX, MT + 24);

    doc.font('Helvetica-Bold').fontSize(26).fillColor('#111827')
      .text('INVOICE', ML, MT, { width: CW, align: 'right' });

    const issuedAt = order.createdAt ? new Date(order.createdAt) : new Date();
    const dueAt = order.invoiceDueDate ? new Date(order.invoiceDueDate) : (order.expiresAt ? new Date(order.expiresAt) : new Date(issuedAt.getTime() + 7 * 24 * 3600 * 1000));
    doc.font('Helvetica').fontSize(9).fillColor('#374151');
    doc.text(`Invoice #${order.id}`, ML, MT + 30, { width: CW, align: 'right' });
    doc.text(
      `Date: ${issuedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      ML, MT + 42, { width: CW, align: 'right' }
    );
    doc.text(
      `Due: ${dueAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      ML, MT + 54, { width: CW, align: 'right' }
    );

    const statusMap: Record<string, string> = {
      payment_sent: 'AWAITING VERIFICATION',
      awaiting_payment: 'AWAITING PAYMENT',
      pending: 'PENDING',
    };

    const rawStatus = order.status || 'pending';
    const statusText = statusMap[rawStatus] || rawStatus.toUpperCase();

    const isGoodStatus = rawStatus === 'paid' || rawStatus === 'completed' || rawStatus === 'active';
    const isBadStatus = rawStatus === 'cancelled' || rawStatus === 'rejected' || rawStatus === 'expired';
    const statusColor = isGoodStatus ? '#059669' : isBadStatus ? '#dc2626' : '#b45309';

    const statusLabel = 'Status ';
    doc.font('Helvetica').fontSize(8);
    const labelW = doc.widthOfString(statusLabel);
    doc.font('Helvetica-Bold').fontSize(8);
    const valueW = doc.widthOfString(statusText);
    const totalStatusW = labelW + valueW;

    const statusLineY = MT + 68;

    doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
      .text(statusLabel, ML + CW - totalStatusW, statusLineY, { continued: true });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(statusColor)
      .text(statusText);

    let curY = MT + 95;

    doc.save();
    doc.moveTo(ML, curY).lineTo(ML + CW, curY).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.restore();
    curY += 20;

    const issued = issuedFrom || {
      name: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: '',
      taxId: '',
      email: '',
    };

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text('FROM', ML, curY);
    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    const fromLines: string[] = [];
    if (issued.name) fromLines.push(issued.name);
    if (issued.address) fromLines.push(issued.address);
    const fromCity = [issued.city, issued.state, issued.zip, issued.country]
      .filter(Boolean)
      .join(', ');
    if (fromCity) fromLines.push(fromCity);
    if (issued.taxId) fromLines.push(`Tax ID: ${issued.taxId}`);
    if (issued.email) fromLines.push(issued.email);
    const fromColW = 210;
    let fromY = curY + 14;
    for (const line of fromLines) {
      doc.text(line, ML, fromY, { width: fromColW, lineBreak: true });
      fromY += 14;
    }
    const fromBottom = fromY;

    const billColX = ML + 230;
    const billColW = CW - 230;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text('BILL TO', billColX, curY);
    const fullNameParts = [user?.firstName, user?.middleName, user?.lastName].filter(Boolean);
    const displayName = fullNameParts.length ? fullNameParts.join(' ') : user?.email || 'Customer';
    const billLines: string[] = [displayName];
    if (user?.billingCompany) billLines.push(user.billingCompany);
    if (user?.address) billLines.push(user.address);
    if (user?.address2) billLines.push(user.address2);
    const cityLine = [user?.billingCity, user?.billingState, user?.billingZip, user?.billingCountry]
      .filter(Boolean)
      .join(', ');
    if (cityLine) billLines.push(cityLine);
    if (user?.email) billLines.push(user.email);

    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    let billY = curY + 14;
    for (const line of billLines) {
      doc.text(line, billColX, billY, { width: billColW, lineBreak: true });
      billY += 14;
    }

    curY = Math.max(fromBottom, billY) + 24;

    let items: any[] = [];
    try { items = JSON.parse(order.items); } catch { items = []; }
    if (!Array.isArray(items)) items = [];
    if (items.length === 0 && order.description) {
      items = [{ description: order.description, quantity: 1, price: Number(order.amount ?? 0) }];
    }

    if (order.status === 'active' && order.servicePeriod?.months && order.servicePeriod.months <= 24) {
      const sp = order.servicePeriod;
      const fromStr = new Date(sp.from).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const toStr = sp.to ? new Date(sp.to).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
      doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
        .text(`Period: ${sp.months} Month${sp.months > 1 ? 's' : ''} (${fromStr} - ${toStr})`, ML, curY);
      curY += 14;
    }

    const ROW_H = 24;

    const TBL = {
      desc: { x: ML, w: CW * 0.5 },
      qty: { x: ML + CW * 0.54, w: CW * 0.08 },
      price: { x: ML + CW * 0.65, w: CW * 0.15 },
      total: { x: ML + CW * 0.82, w: CW * 0.18 },
    };

    const headerCols = [
      { x: TBL.desc.x, w: TBL.desc.w, text: 'Description', align: 'left' as const, bold: true },
      { x: TBL.qty.x, w: TBL.qty.w, text: 'Qty', align: 'center' as const, bold: true },
      { x: TBL.price.x, w: TBL.price.w, text: 'Unit Price', align: 'right' as const, bold: true },
      { x: TBL.total.x, w: TBL.total.w, text: 'Amount (USD)', align: 'right' as const, bold: true },
    ];
    drawTableRow(doc, curY, ROW_H, headerCols, true);

    doc.save();
    doc.moveTo(ML, curY)
      .lineTo(ML + CW, curY).strokeColor('#d1d5db').lineWidth(0.5).stroke();
    doc.restore();

    curY += ROW_H;

    let subtotal = 0;
    items.forEach((it: any, i: number) => {
      const qty = Number(it.quantity ?? it.qty ?? 1);
      const price = Number(it.price ?? it.unit_price ?? 0);
      const lineTotal = qty * price;
      subtotal += lineTotal;

      let desc = it.description || it.name || JSON.stringify(it);
      if (order.planFeatures && order.planFeatures.length > 0 && i === 0) {
        desc += '\n' + order.planFeatures.map((f: string) => `• ${f}`).join('\n');
      }

      doc.font('Helvetica').fontSize(9).fillColor('#1f2937');
      const descH = doc.heightOfString(desc, { width: TBL.desc.w, lineGap: 2 });
      const rowH = Math.max(ROW_H, descH + 12);

      // Description with wrapping
      doc.text(desc, TBL.desc.x, curY + 6, { width: TBL.desc.w, lineGap: 2 });

      // Qty / Price / Total top-aligned
      const valY = curY + (ROW_H - 10) / 2;
      doc.text(String(qty), TBL.qty.x, valY, { width: TBL.qty.w, align: 'center', lineBreak: false });
      doc.text(`$${price.toFixed(2)}`, TBL.price.x, valY, { width: TBL.price.w, align: 'right', lineBreak: false });
      doc.text(`$${lineTotal.toFixed(2)}`, TBL.total.x, valY, { width: TBL.total.w, align: 'right', lineBreak: false });

      curY += rowH;
    });

    curY += 12;

    const amount = Number(order.amount ?? subtotal);
    const tax = Number(order.taxAmount ?? order.tax ?? 0);
    const discount = Number(order.discount ?? 0);
    const total = subtotal + tax - discount;

    doc.save();
    doc.moveTo(ML, curY).lineTo(ML + CW, curY).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.restore();
    curY += 14;

    const totRX = ML + CW * 0.62;
    const totRW = CW * 0.38;
    const totLX = totRX + 70;

    function drawTotalLine(label: string, value: string, opts?: { bold?: boolean; color?: string; size?: number }) {
      doc.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(opts?.size || 9)
        .fillColor(opts?.color || '#6b7280')
        .text(label, totRX, curY, { width: 66, align: 'right' });
      doc.font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(opts?.size || 9)
        .fillColor(opts?.color ? opts.color : '#1f2937')
        .text(value, totLX, curY, { width: totRW - 70, align: 'right' });
      curY += 18;
    }

    drawTotalLine('Subtotal', `$${subtotal.toFixed(2)}`);
    if (tax > 0) drawTotalLine('Tax', `$${tax.toFixed(2)}`);
    if (discount > 0) drawTotalLine('Discount', `-$${discount.toFixed(2)}`);

    curY += 2;
    doc.save();
    doc.moveTo(totRX, curY).lineTo(totRX + totRW, curY).strokeColor('#111827').lineWidth(1.5).stroke();
    doc.restore();
    curY += 8;

    drawTotalLine('TOTAL USD', `$${total.toFixed(2)}`, { bold: true, color: '#111827', size: 12 });

    curY += 28;

    if (order.paymentMethod || order.paymentMethodLabel || order.transactionId || order.notes) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text('PAYMENT DETAILS', ML, curY);
      curY += 14;

      doc.font('Helvetica').fontSize(9).fillColor('#374151');
      if (order.paymentMethodLabel || order.paymentMethod) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280')
          .text('Method:', ML, curY, { continued: true });
        doc.font('Helvetica').fontSize(9).fillColor('#1f2937')
          .text(` ${order.paymentMethodLabel || order.paymentMethod}`);
        curY += 14;
      }
      if (order.transactionId || order.paymentTxId) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280')
          .text('Transaction ID:', ML, curY, { continued: true });
        doc.font('Helvetica').fontSize(9).fillColor('#1f2937')
          .text(` ${order.transactionId || order.paymentTxId}`);
        curY += 14;
      }
      if (order.notes) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280')
          .text('Notes:', ML, curY, { continued: true });
        doc.font('Helvetica').fontSize(9).fillColor('#1f2937')
          .text(` ${order.notes}`, { width: CW - 50 });
      }

      curY += 24;
    }

    const footerY = PH - 60;
    doc.save();
    doc.moveTo(ML, footerY).lineTo(ML + CW, footerY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.restore();

    const footerLines: string[] = [];
    if (issued.name) footerLines.push(issued.name);
    if (issued.taxId) footerLines.push(`Tax ID: ${issued.taxId}`);
    if (issued.email) footerLines.push(issued.email);
    if (footerLines.length) {
      doc.font('Helvetica').fontSize(8).fillColor('#9ca3af')
        .text(footerLines.join('  •  '), ML, footerY + 12, { width: CW, align: 'center' });
    }

    doc.font('Helvetica').fontSize(7).fillColor('#d1d5db')
      .text(
        `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}  |  Powered by EcliPanel`, ML, footerY + 26, { width: CW, align: 'center' }
      );

    doc.end();
  } catch (err: any) {
    // @ts-ignore
    self.postMessage({ id, error: String(err?.message || err) });
  }
});
