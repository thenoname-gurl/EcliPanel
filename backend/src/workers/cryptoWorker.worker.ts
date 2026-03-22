import { encryptBuffer } from '../utils/crypto';

self.addEventListener('message', async (ev: any) => {
  const { id, buffer } = ev.data || {};
  try {
    const input = Buffer.from(buffer instanceof ArrayBuffer ? buffer : buffer.buffer || buffer);
    const encrypted = encryptBuffer(input);
    const ab = encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength);
    // @ts-ignore
    self.postMessage({ id, result: ab }, [ab]);
  } catch (err: any) {
    // @ts-ignore
    self.postMessage({ id, error: String(err?.message || err) });
  }
});
