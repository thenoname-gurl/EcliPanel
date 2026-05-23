import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCipheriv, createDecipheriv } from 'crypto';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { PqKemKeypair } from './postQuantum';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: envPath });

// FBI Proof
// I hope

const algorithm = 'aes-256-gcm';
const PQ_MARKER = 'PQ1';
const PQ_PREFIX = `${PQ_MARKER}:`;
let key = process.env.NODE_ENCRYPTION_KEY || '';
key = key.trim();
if (key.length !== 32) {
  console.warn('NODE_ENCRYPTION_KEY must be 32 bytes long');
}

function sha512(data: Buffer): Uint8Array {
  const hasher = new Bun.CryptoHasher('sha512');
  hasher.update(data);
  return hasher.digest();
}

function sha256(data: Buffer): Buffer {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(data);
  return Buffer.from(hasher.digest());
}

function randomBytes(size: number): Buffer {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size)));
}

function getPqSeed(): Uint8Array | null {
  const seedEnv = process.env.NODE_PQ_ENCRYPTION_SEED?.trim();
  if (seedEnv) {
    try {
      const seed = Buffer.from(seedEnv, 'base64');
      if (seed.length === 64) {
        return new Uint8Array(seed);
      }
      console.warn('NODE_PQ_ENCRYPTION_SEED must decode to 64 bytes');
    } catch {
      console.warn('NODE_PQ_ENCRYPTION_SEED is not valid base64');
    }
  }
  if (key.length === 32) {
    return sha512(Buffer.from(key, 'utf8')).slice(0, 64);
  }
  return null;
}

function getPqKeypair(): PqKemKeypair | null {
  const seed = getPqSeed();
  if (!seed) return null;
  return ml_kem768.keygen(seed);
}

function deriveAesKey(sharedSecret: Uint8Array): Buffer {
  return sha256(Buffer.from(sharedSecret));
}

function encryptAesPayload(data: Buffer, aesKey: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decryptAesPayload(data: Buffer, aesKey: Buffer): Buffer {
  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const ciphertext = data.slice(28);
  const decipher = createDecipheriv(algorithm, aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function isPqEncryptedString(value: any): boolean {
  return typeof value === 'string' && value.startsWith(PQ_PREFIX);
}

export function isEncryptedString(value: any): boolean {
  if (isPqEncryptedString(value)) return true;
  if (typeof value !== 'string') return false;

  const parts = value.split(':');
  if (parts.length !== 3) return false;

  try {
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    if (iv.length !== 12 || tag.length !== 16) return false;
    Buffer.from(parts[2], 'base64');
    return true;
  } catch {
    return false;
  }
}

export function isLegacyEncryptedString(value: any): boolean {
  return typeof value === 'string' && isEncryptedString(value) && !isPqEncryptedString(value);
}

export function encrypt(text: string): string {
  const data = Buffer.from(text, 'utf8');
  const pqKeypair = getPqKeypair();
  if (pqKeypair) {
    const { publicKey } = pqKeypair;
    const { cipherText: encapsulated, sharedSecret } = ml_kem768.encapsulate(publicKey);
    const aesKey = deriveAesKey(sharedSecret);
    const payload = encryptAesPayload(data, aesKey);
    const iv = payload.slice(0, 12).toString('base64');
    const tag = payload.slice(12, 28).toString('base64');
    const ciphertext = payload.slice(28).toString('base64');
    return `${PQ_PREFIX}${Buffer.from(encapsulated).toString('base64')}:${iv}:${tag}:${ciphertext}`;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, Buffer.from(key), iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return iv.toString('base64') + ':' + tag.toString('base64') + ':' + encrypted;
}

export function encryptBufferToString(data: Buffer): string {
  return encrypt(data.toString('base64'));
}

function isEncryptedTextPayload(value: string): boolean {
  if (isPqEncryptedString(value)) return true;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return parts.every((part) => /^[A-Za-z0-9+/=]+$/.test(part));
}

export function decrypt(enc: string): string {
  const isPq = isPqEncryptedString(enc);
  if (isPq) {
    const parts = enc.slice(PQ_PREFIX.length).split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid PQ encrypted payload');
    }
    const encapsulated = Buffer.from(parts[0], 'base64');
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');
    const pqKeypair = getPqKeypair();
    if (!pqKeypair) {
      throw new Error('PQ key pair is not configured');
    }
    const sharedSecret = ml_kem768.decapsulate(encapsulated, pqKeypair.secretKey);
    const aesKey = deriveAesKey(sharedSecret);
    const decrypted = decryptAesPayload(Buffer.concat([iv, tag, ciphertext]), aesKey).toString('utf8');
    if (decrypted === '') {
      console.log(`crypto.decrypt: empty string result from PQ payload (len=${enc.length})`);
    }
    return decrypted;
  }

  const parts = enc.split(':');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const data = parts[2];
  const decipher = createDecipheriv(algorithm, Buffer.from(key), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  if (decrypted === '') {
    console.log(`crypto.decrypt: empty string result from legacy payload (len=${enc.length})`);
  }
  return decrypted;
}

export function encryptBuffer(data: Buffer): Buffer {
  const pqKeypair = getPqKeypair();
  if (pqKeypair) {
    const { publicKey } = pqKeypair;
    const { cipherText: encapsulated, sharedSecret } = ml_kem768.encapsulate(publicKey);
    const aesKey = deriveAesKey(sharedSecret);
    const payload = encryptAesPayload(data, aesKey);
    const iv = payload.slice(0, 12).toString('base64');
    const tag = payload.slice(12, 28).toString('base64');
    const ciphertext = payload.slice(28).toString('base64');
    return Buffer.from(`${PQ_PREFIX}${Buffer.from(encapsulated).toString('base64')}:${iv}:${tag}:${ciphertext}`, 'utf8');
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, Buffer.from(key), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptBuffer(data: Buffer): Buffer {
  const asText = data.toString('utf8');
  if (isEncryptedTextPayload(asText)) {
    try {
      const decrypted = decrypt(asText);
      return Buffer.from(decrypted, 'base64');
    } catch {
      // bruh
    }
  }

  const prefix = data.slice(0, PQ_PREFIX.length).toString('utf8');
  if (prefix === PQ_PREFIX) {
    const payload = data.toString('utf8');
    const parts = payload.slice(PQ_PREFIX.length).split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid PQ encrypted payload');
    }
    const encapsulated = Buffer.from(parts[0], 'base64');
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');
    const pqKeypair = getPqKeypair();
    if (!pqKeypair) {
      throw new Error('PQ key pair is not configured');
    }
    const sharedSecret = ml_kem768.decapsulate(encapsulated, pqKeypair.secretKey);
    const aesKey = deriveAesKey(sharedSecret);
    return decryptAesPayload(Buffer.concat([iv, tag, ciphertext]), aesKey);
  }

  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const ciphertext = data.slice(28);
  const decipher = createDecipheriv(algorithm, Buffer.from(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export type { PqKemKeypair } from './postQuantum';
export {
  serializePqKey,
  deserializePqKey,
  generateKyber768Keypair,
  encapsulateKyber768,
  decapsulateKyber768,
  verifyKyber768Keypair,
  generateNobleKyber768Keypair,
} from './postQuantum';