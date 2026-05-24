import { runWorkerWithJson } from '../utils/workerPool';

export async function generateInvoicePdf(payload: Record<string, unknown>): Promise<Buffer> {
  const workerUrl = new URL('./pdfWorker.worker.ts', import.meta.url).href;
  return runWorkerWithJson<Buffer>(workerUrl, payload);
}
