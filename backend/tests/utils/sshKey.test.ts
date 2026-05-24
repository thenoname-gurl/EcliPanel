import { describe, expect, it } from 'bun:test';
import {
  parseSshPublicKey,
  isSupportedSshKeyType,
  fingerprintSshPublicKey,
  SUPPORTED_SSH_KEY_TYPES,
} from '../../src/utils/sshKey';

describe('sshKey utilities', () => {
  const validKeyMaterial = 'AAAAC3NzaC1lZDI1NTE5AAAAIAzBZQx17uXw6nP4zZbNq2Qr5T7V9X+Y0Z1A2C3D4E';
  const validSshKey = `ssh-ed25519 ${validKeyMaterial} user@example.com`;

  describe('SUPPORTED_SSH_KEY_TYPES', () => {
    it('should contain common SSH key types', () => {
      expect(SUPPORTED_SSH_KEY_TYPES).toContain('ssh-rsa');
      expect(SUPPORTED_SSH_KEY_TYPES).toContain('ssh-ed25519');
      expect(SUPPORTED_SSH_KEY_TYPES).toContain('ecdsa-sha2-nistp256');
    });
  });

  describe('parseSshPublicKey', () => {
    it('should return null for invalid inputs', () => {
      expect(parseSshPublicKey('')).toBeNull();
      expect(parseSshPublicKey(null as unknown as string)).toBeNull();
      expect(parseSshPublicKey(undefined as unknown as string)).toBeNull();
      expect(parseSshPublicKey('not-a-key')).toBeNull();
      expect(parseSshPublicKey('only-one-part')).toBeNull();
    });

    it('should parse SSH key with type, material and comment', () => {
      const result = parseSshPublicKey(validSshKey);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('ssh-ed25519');
      expect(result?.material).toBe(validKeyMaterial);
      expect(result?.comment).toBe('user@example.com');
    });

    it('should parse SSH key without comment', () => {
      const key = `ssh-rsa ${validKeyMaterial}`;
      const result = parseSshPublicKey(key);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('ssh-rsa');
      expect(result?.material).toBe(validKeyMaterial);
      expect(result?.comment).toBeUndefined();
    });

    it('should handle leading and trailing whitespace', () => {
      const result = parseSshPublicKey('  ' + validSshKey + '  ');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('ssh-ed25519');
    });
  });

  describe('isSupportedSshKeyType', () => {
    it('should return true for supported key types', () => {
      expect(isSupportedSshKeyType('ssh-rsa')).toBe(true);
      expect(isSupportedSshKeyType('ssh-ed25519')).toBe(true);
      expect(isSupportedSshKeyType('ecdsa-sha2-nistp256')).toBe(true);
      expect(isSupportedSshKeyType('sk-ssh-ed25519@openssh.com')).toBe(true);
    });

    it('should return false for unsupported key types', () => {
      expect(isSupportedSshKeyType('unknown-key-type')).toBe(false);
      expect(isSupportedSshKeyType('')).toBe(false);
      expect(isSupportedSshKeyType(null as unknown as string)).toBe(false);
      expect(isSupportedSshKeyType(undefined as unknown as string)).toBe(false);
    });
  });

  describe('fingerprintSshPublicKey', () => {
    it('should return null for invalid keys', () => {
      expect(fingerprintSshPublicKey('')).toBeNull();
      expect(fingerprintSshPublicKey('not-a-key')).toBeNull();
    });

    it('should return null for key with empty base64 material', () => {
      expect(fingerprintSshPublicKey('ssh-ed25519 ')).toBeNull();
    });

    it('should return SHA256 fingerprint for valid key', () => {
      const result = fingerprintSshPublicKey(validSshKey);
      expect(result).not.toBeNull();
      expect(result?.startsWith('SHA256:')).toBe(true);
    });

    it('should generate same fingerprint for same key', () => {
      const fp1 = fingerprintSshPublicKey(validSshKey);
      const fp2 = fingerprintSshPublicKey(validSshKey);
      expect(fp1).toBe(fp2);
    });
  });
});
