export async function encryptBufferWithWorker(buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const workerUrl = new URL('./cryptoWorker.worker.ts', import.meta.url).href;
    const worker = new Worker(workerUrl, { type: 'module' });
    const id = `${Date.now()}-${Math.random()}`;

    const onMessage = (ev: any) => {
      const { id: rid, result, error } = ev.data || {};
      if (rid !== id) return;
      worker.removeEventListener('message', onMessage as any);
      worker.terminate();
      if (error) return reject(new Error(String(error)));
      try {
        const ab = result as ArrayBuffer;
        const out = Buffer.from(ab);
        resolve(out);
      } catch (e) { reject(e); }
    };

    worker.addEventListener('message', onMessage as any);
    const u8 = new Uint8Array(buffer);
    worker.postMessage({ id, buffer: u8.buffer }, [u8.buffer]);
  });
}
