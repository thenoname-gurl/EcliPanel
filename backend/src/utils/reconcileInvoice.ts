export function reconcileInvoiceItems(items: any[], amount: number): any[] {
  if (!Array.isArray(items) || items.length === 0 || !Number.isFinite(amount)) return items;

  const qtyOf = (it: any) => Math.max(1, Number(it.quantity ?? it.qty ?? 1));
  const priceOf = (it: any) => Number(it.price ?? it.unit_price ?? 0);

  const sum = items.reduce((acc, it) => acc + qtyOf(it) * priceOf(it), 0);
  if (Math.abs(amount - sum) < 0.005) return items;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  if (items.length === 1) {
    items[0].price = round2(amount / qtyOf(items[0]));
  } else if (sum > 0) {
    const scale = amount / sum;
    for (const it of items) it.price = round2(priceOf(it) * scale);
    const newSum = items.reduce((acc, it) => acc + qtyOf(it) * priceOf(it), 0);
    const last = items[items.length - 1];
    const residual = round2(amount - newSum);
    last.price = round2(priceOf(last) + residual / qtyOf(last));
  } else {
    items[0].price = round2(amount);
  }
  return items;
}