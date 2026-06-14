import { initPqJwtKeypair, getPublicKeyBase64, getPublicKeyFingerprint } from '../src/utils/pqJwt';

const seed = crypto.getRandomValues(new Uint8Array(64));
const encoded = Buffer.from(seed).toString('base64');

const kp = initPqJwtKeypair(seed);
const pubKey = getPublicKeyBase64();
const fingerprint = getPublicKeyFingerprint();

console.log('');
console.log('PQ_JWT_SEED (base64, 64 bytes — hashed to 32 bytes for ML-DSA-65):');
console.log(encoded);
console.log('');
console.log('ML-DSA-65 Public Key (base64):');
console.log(pubKey);
console.log('');
console.log('ML-DSA-65 Public Key Fingerprint (SHA-256 hex):');
console.log(fingerprint);
console.log('');
console.log('Add PQ_JWT_SEED to your .env file.');
console.log('The seed can be used to deterministically regenerate the same keypair.');
console.log('Without it, a random keypair is generated at each startup.');