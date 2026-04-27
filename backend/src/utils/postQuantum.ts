import { Buffer } from 'buffer';
import { createMlKem768 } from 'mlkem';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { randomBytes as nobleRandomBytes } from '@noble/post-quantum/utils.js';

export interface PqKemKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

let mlKemInstance: Awaited<ReturnType<typeof createMlKem768>> | null = null;

async function getMlKemInstance() {
  if (!mlKemInstance) {
    mlKemInstance = await createMlKem768();
  }
  return mlKemInstance;
}

export function serializePqKey(key: Uint8Array): string {
  return Buffer.from(key).toString('base64');
}

export function deserializePqKey(encoded: string): Uint8Array {
  return new Uint8Array(Buffer.from(encoded, 'base64'));
}

export async function generateKyber768Keypair(seed?: Uint8Array): Promise<PqKemKeypair> {
  const kem = await getMlKemInstance();
  const keypair = seed && seed.length > 0 ? kem.deriveKeyPair(seed) : kem.generateKeyPair();
  return {
    publicKey: keypair[0],
    secretKey: keypair[1],
  };
}

export async function encapsulateKyber768(publicKey: Uint8Array): Promise<{ cipherText: Uint8Array; sharedSecret: Uint8Array }> {
  const kem = await getMlKemInstance();
  const [cipherText, sharedSecret] = kem.encap(publicKey);
  return { cipherText, sharedSecret };
}

export async function decapsulateKyber768(cipherText: Uint8Array, secretKey: Uint8Array): Promise<Uint8Array> {
  const kem = await getMlKemInstance();
  return kem.decap(cipherText, secretKey);
}

export async function verifyKyber768Keypair(publicKey: Uint8Array, secretKey: Uint8Array): Promise<boolean> {
  const { cipherText, sharedSecret } = await encapsulateKyber768(publicKey);
  const recovered = await decapsulateKyber768(cipherText, secretKey);
  return Buffer.from(sharedSecret).equals(Buffer.from(recovered));
}

export function generateNobleKyber768Keypair(seed?: Uint8Array): PqKemKeypair {
  const finalSeed = seed && seed.length > 0 ? seed : nobleRandomBytes(64);
  const keypair = ml_kem768.keygen(finalSeed);
  return {
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
  };
}