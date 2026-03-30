import crypto from 'crypto';

export const SUPPORTED_SSH_KEY_TYPES = [
  'ssh-rsa',
  'ssh-ed25519',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'sk-ssh-ed25519',
  'sk-ecdsa-sha2-nistp256',
  'sk-ssh-ed25519@openssh.com',
  'sk-ecdsa-sha2-nistp256@openssh.com',
  'ssh-rsa-cert-v01@openssh.com',
  'ssh-ed25519-cert-v01@openssh.com',
  'ecdsa-sha2-nistp256-cert-v01@openssh.com',
  'ecdsa-sha2-nistp384-cert-v01@openssh.com',
  'ecdsa-sha2-nistp521-cert-v01@openssh.com',
];

export function parseSshPublicKey(publicKey: string): { type: string; material: string; comment?: string } | null {
  if (!publicKey || typeof publicKey !== 'string') return null;
  const trimmed = publicKey.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;

  return {
    type: parts[0],
    material: parts[1],
    comment: parts.slice(2).join(' ') || undefined,
  };
}

export function isSupportedSshKeyType(type: string): boolean {
  if (!type || typeof type !== 'string') return false;
  return SUPPORTED_SSH_KEY_TYPES.includes(type);
}

export function fingerprintSshPublicKey(publicKey: string): string | null {
  const parsed = parseSshPublicKey(publicKey);
  if (!parsed) return null;

  try {
    const keyMaterial = Buffer.from(parsed.material, 'base64');
    if (keyMaterial.length === 0) return null;
    const hash = crypto
      .createHash('sha256')
      .update(keyMaterial)
      .digest('base64')
      .replace(/=+$/, '');
    return `SHA256:${hash}`;
  } catch {
    return null;
  }
}
