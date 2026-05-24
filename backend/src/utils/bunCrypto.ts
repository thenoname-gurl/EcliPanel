export function randomBytes(length: number): Uint8Array {
  if (!Number.isFinite(length) || length <= 0) {
    return new Uint8Array();
  }
  const bytes = new Uint8Array(Math.floor(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomHex(byteLength: number): string {
  const bytes = randomBytes(byteLength);
  return Buffer.from(bytes).toString('hex');
}

export function randomInt(min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  const range = Math.floor(max) - Math.floor(min);
  if (range <= 0) return Math.floor(min);
  const maxUint = 0x100000000;
  const limit = Math.floor(maxUint / range) * range;
  let x = 0;
  do {
    x = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (x >= limit);
  return Math.floor(min) + (x % range);
}

export function sha256Hex(input: string | Uint8Array): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(input);
  return hasher.digest('hex');
}

export function sha256Bytes(input: string | Uint8Array): Uint8Array {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(input);
  return hasher.digest();
}

export function sha256Base64Url(input: string | Uint8Array): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(input);
  return hasher.digest('base64url');
}

export function sha256Base64(input: string | Uint8Array): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(input);
  return hasher.digest('base64');
}

export function timingSafeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
  const aBuf = typeof a === 'string' ? Buffer.from(a) : Buffer.from(a);
  const bBuf = typeof b === 'string' ? Buffer.from(b) : Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  let diff = 0;
  for (let i = 0; i < aBuf.length; i++) {
    diff |= aBuf[i] ^ bBuf[i];
  }
  return diff === 0;
}