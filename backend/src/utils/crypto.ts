import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

// FBI Proof
// I hope

const algorithm = 'aes-256-gcm';
let key = process.env.NODE_ENCRYPTION_KEY || '';
key = key.trim();
if (key.length !== 32) {
  console.warn('NODE_ENCRYPTION_KEY must be 32 bytes long');
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return iv.toString('base64') + ':' + tag.toString('base64') + ':' + encrypted;
}

export function decrypt(enc: string): string {
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
