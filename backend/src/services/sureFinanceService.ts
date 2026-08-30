import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { AppDataSource } from '../config/typeorm';
import { FinanceLog } from '../models/financeLog.entity';

const INVOICE_MIME_EXTS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/pdf': 'pdf',
};
const MAX_INVOICE_BYTES = 3 * 1024 * 1024;

export async function storeInvoiceForRow(id: number, dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl) return null;
  const match = String(dataUrl).match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const ext = INVOICE_MIME_EXTS[mime];
  if (!ext) return null;
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length === 0 || buf.length > MAX_INVOICE_BYTES) return null;
  const rel = `finance/finance-${id}.${ext}`;
  try {
    await mkdir('uploads/finance', { recursive: true });
    await writeFile(`uploads/${rel}`, buf);
    return rel;
  } catch (e: any) {
    logFailure(`failed to store invoice for #${id}: ${e?.message || e}`);
    return null;
  }
}

const SURE_BASE = 'https://finance.misiu.space';
const SURE_SOURCE = 'eclipanel';
const LOG_FILE = 'sure-finance.log';

export function sureFinanceEnabled(): boolean {
  return Boolean(process.env.MISIU_FINANCE_API_KEY);
}

function sureHeaders(): Record<string, string> {
  return {
    'X-Api-Key': process.env.MISIU_FINANCE_API_KEY || '',
    'Content-Type': 'application/json',
  };
}

function logFailure(msg: string): void {
  console.error(`[sureFinance] ${msg}`);
  if (process.env.NODE_ENV === 'test') return;
  const line = `${new Date().toISOString()} ${msg}\n`;
  appendFile(LOG_FILE, line).catch(() => {});
}

function financeLogRepo() {
  return AppDataSource.getRepository(FinanceLog);
}

async function postTransaction(body: Record<string, unknown>): Promise<{ status: number; sureTransactionId: string | null }> {
  try {
    const res = await fetch(`${SURE_BASE}/api/v1/transactions`, {
      method: 'POST',
      headers: sureHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    let sureTransactionId: string | null = null;
    if (res.ok) {
      try {
        const parsed = (await res.json()) as any;
        sureTransactionId = parsed?.transaction?.id ?? parsed?.id ?? null;
      } catch {}
    }
    return { status: res.status, sureTransactionId };
  } catch (e: any) {
    logFailure(`gateway unreachable for "${body.name}": ${e?.message || e}`);
    return { status: -1, sureTransactionId: null };
  }
}

export async function updateSureTransaction(
  sureTransactionId: string,
  patch: Record<string, unknown>
): Promise<number> {
  if (!sureFinanceEnabled()) return -1;
  try {
    const res = await fetch(`${SURE_BASE}/api/v1/transactions/${sureTransactionId}`, {
      method: 'PATCH',
      headers: sureHeaders(),
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(10_000),
    });
    return res.status;
  } catch (e: any) {
    logFailure(`gateway unreachable while updating ${sureTransactionId}: ${e?.message || e}`);
    return -1;
  }
}

export async function deleteSureTransaction(sureTransactionId: string): Promise<number> {
  if (!sureFinanceEnabled()) return -1;
  try {
    const res = await fetch(`${SURE_BASE}/api/v1/transactions/${sureTransactionId}`, {
      method: 'DELETE',
      headers: sureHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    return res.status;
  } catch (e: any) {
    logFailure(`gateway unreachable while deleting ${sureTransactionId}: ${e?.message || e}`);
    return -1;
  }
}

async function saveFinanceLog(entry: {
  orderId?: number | null;
  amount: number;
  nature: string;
  name: string;
  notes?: string | null;
  externalId: string;
  sureTransactionId?: string | null;
  status: 'sent' | 'failed';
  error?: string | null;
}): Promise<void> {
  try {
    const repo = financeLogRepo();
    const row = repo.create({
      orderId: entry.orderId ?? null,
      amount: entry.amount,
      nature: entry.nature,
      name: entry.name,
      notes: entry.notes ?? undefined,
      error: entry.error ?? undefined,
      externalId: entry.externalId,
      sureTransactionId: entry.sureTransactionId ?? undefined,
      status: entry.status,
      createdAt: new Date(),
    });
    await repo.save(row);
  } catch (e: any) {
    logFailure(`failed to persist FinanceLog row: ${e?.message || e}`);
  }
}

export async function recordOrderPayment(order: {
  id: number;
  amount: number;
  description?: string | null;
  userId: number;
  orgId?: number | null;
}): Promise<void> {
  if (!sureFinanceEnabled()) return;
  const amount = Number(order.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return; // nooo moni >;x

  const name = `Order #${order.id}${order.description ? ` — ${order.description}` : ''}`.slice(0, 250);
  const notes = order.orgId ? `user_id: ${order.userId}; org_id: ${order.orgId}` : `user_id: ${order.userId}`;
  const externalId = `order-${order.id}`;

  const { status, sureTransactionId } = await postTransaction({
    date: new Date().toISOString().slice(0, 10),
    amount,
    name,
    notes,
    nature: 'income',
    currency: 'USD',
    external_id: externalId,
    source: SURE_SOURCE,
  });
  const ok = status >= 200 && status < 300;
  if (!ok) logFailure(`record order #${order.id} failed: HTTP ${status}`);
  await saveFinanceLog({
    orderId: order.id,
    amount,
    nature: 'income',
    name,
    notes,
    externalId,
    sureTransactionId,
    status: ok ? 'sent' : 'failed',
    error: ok ? null : `gateway HTTP ${status}`,
  });
}

export async function recordManualTransaction(input: {
  amount: number;
  nature: string;
  name: string;
  notes?: string | null;
  invoiceBase64?: string | null;
}): Promise<number | null> {
  if (!sureFinanceEnabled()) return null;
  const amount = Number(input.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const nature = input.nature === 'expense' ? 'expense' : 'income';
  const name = String(input.name || `Manual ${nature}`).slice(0, 250);
  const notes = input.notes ? String(input.notes).slice(0, 1000) : undefined;
  let logId: number | null = null;
  try {
    const repo = financeLogRepo();
    const row = repo.create({
      orderId: null,
      amount,
      nature,
      name,
      notes,
      externalId: `manual-pending`,
      status: 'failed',
      error: 'pending',
      createdAt: new Date(),
    });
    await repo.save(row);
    logId = row.id;
  } catch (e: any) {
    logFailure(`failed to create manual FinanceLog row: ${e?.message || e}`);
  }

  const invoicePath = logId != null ? await storeInvoiceForRow(logId, input.invoiceBase64) : null;
  const externalId = `manual-${logId ?? Date.now()}`;
  const { status, sureTransactionId } = await postTransaction({
    date: new Date().toISOString().slice(0, 10),
    amount,
    name,
    notes,
    nature,
    currency: 'USD',
    external_id: externalId,
    source: SURE_SOURCE,
  });
  const ok = status >= 200 && status < 300;
  if (!ok) logFailure(`manual entry #${logId ?? 'n/a'} failed: HTTP ${status}`);
  if (logId != null) {
    try {
      const repo = financeLogRepo();
      await repo.update(
        { id: logId },
        {
          externalId,
          sureTransactionId: sureTransactionId ?? undefined,
          status: ok ? 'sent' : 'failed',
          error: ok ? null : `gateway HTTP ${status}`,
          invoicePath: invoicePath ?? undefined,
        }
      );
    } catch {}
  }
  return logId;
}

export async function retryFinanceLogRow(row: {
  id: number;
  amount: number;
  nature: string;
  name: string;
  notes?: string | null;
  externalId: string;
}): Promise<{ status: number; sureTransactionId: string | null }> {
  if (!sureFinanceEnabled()) return { status: -1, sureTransactionId: null };
  const { status, sureTransactionId } = await postTransaction({
    date: new Date().toISOString().slice(0, 10),
    amount: Number(row.amount),
    name: String(row.name).slice(0, 250),
    notes: row.notes ?? undefined,
    nature: row.nature === 'expense' ? 'expense' : 'income',
    currency: 'USD',
    external_id: row.externalId,
    source: SURE_SOURCE,
  });
  const ok = status >= 200 && status < 300;
  if (!ok) logFailure(`retry row #${row.id} failed: HTTP ${status}`);
  try {
    await financeLogRepo().update(
      { id: row.id },
      {
        status: ok ? 'sent' : 'failed',
        error: ok ? null : `gateway HTTP ${status}`,
        sureTransactionId: sureTransactionId ?? undefined,
      }
    );
  } catch {}
  return { status, sureTransactionId };
}

export async function listSureTransactions(params: Record<string, string>): Promise<{ ok: boolean; rows: any[] }> {
  if (!sureFinanceEnabled()) return { ok: false, rows: [] };
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${SURE_BASE}/api/v1/transactions?${qs}`, {
      headers: sureHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      if (res.status !== 404) logFailure(`list transactions failed: HTTP ${res.status}`);
      return { ok: false, rows: [] };
    }
    const parsed = (await res.json()) as any;
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.transactions)
        ? parsed.transactions
        : Array.isArray(parsed?.data)
          ? parsed.data
          : [];
    return { ok: true, rows };
  } catch (e: any) {
    logFailure(`list transactions error: ${e?.message || e}`);
    return { ok: false, rows: [] };
  }
}

export async function getSureAccount(): Promise<any | null> {
  if (!sureFinanceEnabled()) return null;
  try {
    const res = await fetch(`${SURE_BASE}/api/v1/account`, {
      headers: sureHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logFailure(`account fetch failed: HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e: any) {
    logFailure(`account fetch error: ${e?.message || e}`);
    return null;
  }
}
