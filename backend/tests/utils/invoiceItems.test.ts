import { describe, expect, it } from 'bun:test';
import { reconcileInvoiceItems } from '../../src/utils/reconcileInvoice';

describe('reconcileInvoiceItems', () => {
  it('leaves items alone when they already sum to amount', () => {
    const items = [{ description: 'Pro Plan', quantity: 1, price: 6 }];
    expect(reconcileInvoiceItems(items, 6)).toEqual(items);
  });

  it('updates single item price to match admin-edited amount', () => {
    const items = [{ description: 'Pro Plan', quantity: 1, price: 6 }];
    reconcileInvoiceItems(items, 7.5);
    expect(items[0].price).toBe(7.5);
  });

  it('divides amount by qty for single item with qty > 1', () => {
    const items = [{ description: 'Slots', quantity: 3, price: 2 }];
    reconcileInvoiceItems(items, 7.5);
    expect(items[0].price).toBe(2.5);
  });

  it('scales multiple items proportionally', () => {
    const items = [
      { description: 'a', quantity: 2, price: 3 },
      { description: 'b', quantity: 1, price: 4 },
    ];
    reconcileInvoiceItems(items, 5); // was 10
    expect(items[0].price).toBe(1.5);
    expect(items[1].price).toBe(2);
  });

  it('assigns full amount to first item when all prices are zero', () => {
    const items = [{ description: 'a', price: 0 }, { description: 'b', price: 0 }];
    reconcileInvoiceItems(items, 4);
    expect(items[0].price).toBe(4);
    expect(items[1].price).toBe(0);
  });

  it('absorbs rounding drift so items still sum to amount', () => {
    const items = [
      { description: 'a', quantity: 1, price: 1 },
      { description: 'b', quantity: 1, price: 1 },
      { description: 'c', quantity: 1, price: 1 },
    ];
    reconcileInvoiceItems(items, 10);
    const sum = items.reduce((acc, it) => acc + it.quantity * it.price, 0);
    expect(sum).toBe(10);
  });

  it('ignores non-finite amount', () => {
    const items = [{ description: 'a', price: 6 }];
    expect(reconcileInvoiceItems(items, NaN)).toEqual(items);
  });
});
