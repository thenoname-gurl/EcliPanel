import { runWorkerWithBuffer } from '../utils/workerPool';

export async function encryptBufferWithWorker(buffer: Buffer): Promise<Buffer> {
  const workerUrl = new URL('./cryptoWorker.worker.ts', import.meta.url).href;
  return runWorkerWithBuffer<Buffer>(workerUrl, buffer);
}
