import sharp from 'sharp';

self.addEventListener('message', async (ev: any) => {
  const { id, buffer, width = 256, height = 256 } = ev.data || {};
  try {
    const input = Buffer.from(buffer instanceof ArrayBuffer ? buffer : buffer.buffer || buffer);
    const out = await sharp(input).rotate().resize(width, height, { fit: 'cover' }).toBuffer();
    const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    // @ts-ignore
    self.postMessage({ id, result: ab }, [ab]);
  } catch (err: any) {
    // @ts-ignore
    self.postMessage({ id, error: String(err?.message || err) });
  }
});
