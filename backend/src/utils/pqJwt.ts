import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { randomBytes } from '@noble/post-quantum/utils.js';
import { sha256Hex } from './bunCrypto';
import jsonwebtoken from 'jsonwebtoken';

export interface PqJwtPayload {
  userId: number;
  sessionId: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export interface PqJwtKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

let _keypair: PqJwtKeypair | null = null;
let _initialized = false;

function getSeed(): Uint8Array | null {
  const seedEnv = process.env.PQ_JWT_SEED?.trim();
  if (seedEnv) {
    try {
      const seed = Buffer.from(seedEnv, 'base64');
      if (seed.length === 64) {
        const hasher = new Bun.CryptoHasher('sha256');
        hasher.update(new Uint8Array(seed));
        return new Uint8Array(hasher.digest());
      }
      console.warn('PQ_JWT_SEED must decode to 64 bytes');
    } catch {
      console.warn('PQ_JWT_SEED is not valid base64');
    }
  }
  if (process.env.JWT_SECRET) {
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(Buffer.from(process.env.JWT_SECRET, 'utf8'));
    return new Uint8Array(hasher.digest());
  }
  return null;
}

export function initPqJwtKeypair(seed?: Uint8Array): PqJwtKeypair {
  const rawSeed = seed ?? getSeed() ?? randomBytes(32);
  const finalSeed = rawSeed.length === 32 ? rawSeed : new Uint8Array(new Bun.CryptoHasher('sha256').update(rawSeed).digest());
  const keys = ml_dsa65.keygen(finalSeed);
  _keypair = { publicKey: keys.publicKey, secretKey: keys.secretKey };
  _initialized = true;
  return _keypair;
}

export function getPqJwtKeypair(): PqJwtKeypair {
  if (!_initialized) {
    return initPqJwtKeypair();
  }
  return _keypair!;
}

export function signPqJwt(payload: PqJwtPayload, expiresInSec?: number): string {
  const kp = getPqJwtKeypair();
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = { ...payload, iat: now, exp: now + (expiresInSec ?? 3600) };
  const json = JSON.stringify(tokenPayload);
  const data = Buffer.from(json, 'utf8');
  const sig = ml_dsa65.sign(new Uint8Array(data), kp.secretKey);
  const encoded = data.toString('base64url');
  const sigEncoded = Buffer.from(sig).toString('base64url');
  return `${encoded}.${sigEncoded}`;
}

export function verifyPqJwt(token: string): PqJwtPayload {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid PQ token format');
  }
  const [encoded, sigEncoded] = parts;
  const kp = getPqJwtKeypair();
  const sig = Buffer.from(sigEncoded, 'base64url');
  const data = Buffer.from(encoded, 'base64url');
  const ok = ml_dsa65.verify(new Uint8Array(sig), new Uint8Array(data), kp.publicKey);
  if (!ok) throw new Error('PQ token signature verification failed');
  const json = data.toString('utf8');
  const payload = JSON.parse(json) as PqJwtPayload;
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error('PQ token expired');
  }
  return payload;
}

let _legacySecret: string | null = null;
let _legacyInitialized = false;

function getLegacySecret(): string {
  if (!_legacyInitialized) {
    _legacySecret = process.env.JWT_SECRET?.trim() || '';
    _legacyInitialized = true;
  }
  return _legacySecret!;
}

export function verifyAnyToken(token: string): PqJwtPayload {
  const parts = token.split('.');
  if (parts.length === 2) {
    try {
      return verifyPqJwt(token);
    } catch {
      // fall through to legacy
    }
  }
  if (parts.length === 3) {
    try {
      const secret = getLegacySecret();
      if (!secret) throw new Error('JWT_SECRET not configured');
      const decoded = jsonwebtoken.verify(token, secret) as PqJwtPayload;
      return decoded;
    } catch (err) {
      throw err;
    }
  }
  throw new Error('Unrecognized token format');
}

export function getPublicKeyBase64(): string {
  const kp = getPqJwtKeypair();
  return Buffer.from(kp.publicKey).toString('base64');
}

export function getPublicKeyFingerprint(): string {
  const kp = getPqJwtKeypair();
  return sha256Hex(Buffer.from(kp.publicKey));
}
