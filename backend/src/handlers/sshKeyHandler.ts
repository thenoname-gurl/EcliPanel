import { AppDataSource } from '../config/typeorm';
import { t } from 'elysia';
import { SshKey } from '../models/sshKey.entity';
import { authenticate } from '../middleware/auth';
import {
  parseSshPublicKey,
  fingerprintSshPublicKey,
  isSupportedSshKeyType,
} from '../utils/sshKey';

function sshKeyRepo() {
  return AppDataSource.getRepository(SshKey);
}

export async function sshKeyRoutes(app: any, prefix = '') {
  app.get(prefix + '/ssh-keys', async (ctx: any) => {
    const keys = await sshKeyRepo().find({
      where: { userId: (ctx as any).user.id },
      order: { createdAt: 'ASC' },
      select: ['id', 'name', 'fingerprint', 'createdAt'],
    });
    return keys;
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'List SSH keys for current user', tags: ['SSH'] },
    response: { 200: t.Array(t.Any()), 401: t.Object({ error: t.String() }) }
  });

  app.post(prefix + '/ssh-keys', async (ctx: any) => {
    const { name, publicKey } = ctx.body as any;
    if (!name || !publicKey) {
      ctx.set.status = 400;
      return { error: 'name and publicKey are required' };
    }

    const trimmed = publicKey.trim();
    const parsed = parseSshPublicKey(trimmed);

    if (!parsed || !isSupportedSshKeyType(parsed.type)) {
      ctx.set.status = 400;
      return {
        error:
          'Invalid public key format. Supported types: ssh-rsa, ssh-ed25519, ecdsa-sha2-nistp256/384/521, sk-ssh-ed25519, sk-ecdsa-sha2-nistp256, and Openssh certificates',
      };
    }

    const fingerprint = fingerprintSshPublicKey(trimmed);

    const existing = await sshKeyRepo().findOneBy({ userId: (ctx as any).user.id, fingerprint: fingerprint ?? undefined });
    if (existing) {
      ctx.set.status = 409;
      return { error: 'This key is already registered on your account' };
    }

    const key = sshKeyRepo().create({
      userId: (ctx as any).user.id,
      name: name.trim(),
      publicKey: trimmed,
      fingerprint: fingerprint ?? undefined,
    });
    await sshKeyRepo().save(key);

    ctx.set.status = 201;
    return {
      id: key.id,
      name: key.name,
      fingerprint: key.fingerprint,
      createdAt: key.createdAt,
    };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Create a new SSH key', tags: ['SSH'] },
    response: { 201: t.Any(), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 409: t.Object({ error: t.String() }) }
  });

  app.put(prefix + '/ssh-keys/:id', async (ctx: any) => {
    const keyId = Number((ctx.params as any).id);
    const { name } = ctx.body as any;
    if (!name || !String(name).trim()) {
      ctx.set.status = 400;
      return { error: 'name is required' };
    }
    const key = await sshKeyRepo().findOneBy({ id: keyId, userId: (ctx as any).user.id });
    if (!key) {
      ctx.set.status = 404;
      return { error: 'SSH key not found' };
    }
    key.name = String(name).trim();
    await sshKeyRepo().save(key);
    return { success: true, key: { id: key.id, name: key.name } };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Update SSH key name', tags: ['SSH'] },
    response: { 200: t.Object({ success: t.Boolean(), key: t.Object({ id: t.Number(), name: t.String() }) }), 400: t.Object({ error: t.String() }), 401: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) },
  });

  app.delete(prefix + '/ssh-keys/:id', async (ctx: any) => {
    const keyId = Number((ctx.params as any).id);
    const key = await sshKeyRepo().findOneBy({ id: keyId, userId: (ctx as any).user.id });
    if (!key) {
      ctx.set.status = 404;
      return { error: 'SSH key not found' };
    }
    await sshKeyRepo().remove(key);
    return { success: true };
  }, {
    beforeHandle: authenticate,
    detail: { summary: 'Delete an SSH key', tags: ['SSH'] },
    response: { 200: t.Object({ success: t.Boolean() }), 401: t.Object({ error: t.String() }), 404: t.Object({ error: t.String() }) }
  });
}