import { runWorkerWithBuffer } from '../utils/workerPool';

export async function resizeImage(buffer: Buffer, width = 256, height = 256): Promise<Buffer> {
  const workerUrl = new URL('./imageWorker.worker.ts', import.meta.url).href;
  return runWorkerWithBuffer<Buffer>(workerUrl, buffer, { width, height });
}
