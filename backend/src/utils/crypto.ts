import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
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
    return new Uint8Array(crypto.createHash('sha512').update(Buffer.from(key, 'utf8')).digest().slice(0, 64));
  }
  return null;
}

function getPqKeypair(): PqKemKeypair | null {
  const seed = getPqSeed();
  if (!seed) return null;
  return ml_kem768.keygen(seed);
}

function deriveAesKey(sharedSecret: Uint8Array): Buffer {
  return crypto.createHash('sha256').update(Buffer.from(sharedSecret)).digest();
}

function encryptAesPayload(data: Buffer, aesKey: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decryptAesPayload(data: Buffer, aesKey: Buffer): Buffer {
  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const ciphertext = data.slice(28);
  const decipher = crypto.createDecipheriv(algorithm, aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function isPqEncryptedString(value: any): boolean {
  return typeof value === 'string' && value.startsWith(PQ_PREFIX);
}

export function isEncryptedString(value: any): boolean {
  return isPqEncryptedString(value) || (typeof value === 'string' && value.split(':').length === 3);
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

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return iv.toString('base64') + ':' + tag.toString('base64') + ':' + encrypted;
}

export function decrypt(enc: string): string {
  if (isPqEncryptedString(enc)) {
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
    const payload = Buffer.concat([iv, tag, ciphertext]);
    return decryptAesPayload(payload, aesKey).toString('utf8');
  }

  const parts = enc.split(':');
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const data = parts[2];
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
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

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptBuffer(data: Buffer): Buffer {
  const prefix = data.slice(0, PQ_PREFIX.length + 1).toString('utf8');
  if (prefix === `${PQ_PREFIX}:`) {
    const payload = data.toString('utf8');
    const parts = payload.slice(PQ_PREFIX.length + 1).split(':');
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
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv);
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