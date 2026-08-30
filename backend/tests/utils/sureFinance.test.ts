import { describe, expect, it, beforeEach } from 'bun:test';
import { recordOrderPayment, recordManualTransaction, getSureAccount, listSureTransactions, sureFinanceEnabled } from '../../src/services/sureFinanceService';

let calls: Array<{ url: string; init: any }> = [];
let nextStatus = 201;
let nextBody: any = {};

const mockFetch = async (url: string, init?: any) => {
  calls.push({ url, init });
  return new Response(JSON.stringify(nextBody), { status: nextStatus });
};

describe('sureFinanceService', () => {
  beforeEach(() => {
    calls = [];
    nextStatus = 201;
    nextBody = {};
    globalThis.fetch = mockFetch as any;
    delete process.env.MISIU_FINANCE_API_KEY;
  });

  it('is disabled without an API key', async () => {
    expect(sureFinanceEnabled()).toBe(false);
    await recordOrderPayment({ id: 1, amount: 10, userId: 5 });
    expect(calls.length).toBe(0);
  });

  it('skips non-positive amounts', async () => {
    process.env.MISIU_FINANCE_API_KEY = 'test-key';
    await recordOrderPayment({ id: 1, amount: 0, userId: 5 });
    expect(calls.length).toBe(0);
  });

  it('posts an income transaction with idempotency key', async () => {
    process.env.MISIU_FINANCE_API_KEY = 'test-key';
    await recordOrderPayment({ id: 42, amount: 7.5, description: 'Pro Plan', userId: 5 });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('https://finance.misiu.space/api/v1/transactions');
    expect(calls[0].init.headers['X-Api-Key']).toBe('test-key');
    const body = JSON.parse(calls[0].init.body);
    expect(body.nature).toBe('income');
    expect(body.amount).toBe(7.5);
    expect(body.external_id).toBe('order-42');
    expect(body.source).toBe('eclipanel');
    expect(body.name).toContain('Order #42');
    expect(body.name).toContain('Pro Plan');
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('logs (not throws) when the gateway fails', async () => {
    process.env.MISIU_FINANCE_API_KEY = 'test-key';
    nextStatus = 502;
    let threw = false;
    try {
      await recordOrderPayment({ id: 43, amount: 5, userId: 6 });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(calls.length).toBe(1);
  });

  it('posts manual expense entries with the chosen nature', async () => {
    process.env.MISIU_FINANCE_API_KEY = 'test-key';
    await recordManualTransaction({ amount: 12, nature: 'expense', name: 'Server invoice' });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe('https://finance.misiu.space/api/v1/transactions');
    const body = JSON.parse(calls[0].init.body);
    expect(body.nature).toBe('expense');
    expect(body.amount).toBe(12);
    expect(body.external_id).toMatch(/^manual-/);
  });

  it('skips invalid manual entries', async () => {
    process.env.MISIU_FINANCE_API_KEY = 'test-key';
    await recordManualTransaction({ amount: 0, nature: 'expense', name: 'x' });
    await recordManualTransaction({ amount: -5, nature: 'income', name: 'x' });
    expect(calls.length).toBe(0);
  });

  it('parses the Sure transaction list (wrapped shape)', async () => {
    process.env.MISIU_FINANCE_API_KEY = 'test-key';
    nextBody = {
      transactions: [{ id: 'uuid-1', amount_cents: 750, classification: 'income', name: 'Invoice 1' }],
      pagination: {},
    };
    const { ok, rows } = await listSureTransactions({ per_page: '100' });
    expect(ok).toBe(true);
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('uuid-1');
    expect(rows[0].amount_cents).toBe(750);
  });

  it('reports ok:false when the list endpoint is unavailable', async () => {
    process.env.MISIU_FINANCE_API_KEY = 'test-key';
    nextStatus = 404;
    const { ok, rows } = await listSureTransactions({});
    expect(ok).toBe(false);
    expect(rows.length).toBe(0);
  });

  it('returns the Sure account when reachable', async () => {
    process.env.MISIU_FINANCE_API_KEY = 'test-key';
    nextBody = { name: 'EclipseSystems', balance_cents: 1234, currency: 'PLN' };
    const account = await getSureAccount();
    expect(account?.name).toBe('EclipseSystems');
    expect(account?.balance_cents).toBe(1234);
  });

  it('returns null for account when key missing', async () => {
    expect(await getSureAccount()).toBe(null);
  });
});
