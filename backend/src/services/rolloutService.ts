import { AppDataSource } from '../config/typeorm';
import { Rollout } from '../models/rollout.entity';
import { RolloutUserOverride } from '../models/rolloutUserOverride.entity';
import { withRedisCache } from '../config/redis';

const HASH_RANGE = 10000;

function murmurhash3_x86_32(key: string, seed: number = 0): number {
  const remainder = key.length & 3;
  const bytes = key.length - remainder;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let h1 = seed;
  let i = 0;

  for (; i < bytes; i += 4) {
    let k1 =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);

    k1 = ((k1 & 0xffff) * c1 + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = ((k1 & 0xffff) * c2 + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;

    h1 ^= k1;
    h1 = ((h1 << 13) | (h1 >>> 19)) & 0xffffffff;
    h1 = (h1 * 5 + 0xe6546b64) & 0xffffffff;
  }

  let k1 = 0;
  switch (remainder) {
    case 3:
      k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    case 2:
      k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    case 1:
      k1 ^= key.charCodeAt(i) & 0xff;
      k1 = ((k1 & 0xffff) * c1 + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = ((k1 & 0xffff) * c2 + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
      h1 ^= k1;
  }

  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 = ((h1 & 0xffff) * 0x85ebca6b + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 13;
  h1 = ((h1 & 0xffff) * 0xc2b2ae35 + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

function getBucket(userId: number | string, rolloutKey: string): number {
  const input = `${rolloutKey}:${userId}`;
  const hash = murmurhash3_x86_32(input);
  return hash % HASH_RANGE;
}

export async function getActiveRollouts(): Promise<Rollout[]> {
  const repo = AppDataSource.getRepository(Rollout);
  return repo.find({ where: { active: true } });
}

export async function getRolloutTreatment(
  userId: number | string,
  rolloutKey: string,
): Promise<{ inRollout: boolean; treatment: string | null }> {
  const rollouts = await withRedisCache(`rollouts:active:v1`, 30, async () => {
    return getActiveRollouts();
  });

  const rollout = rollouts.find((r) => r.key === rolloutKey);
  if (!rollout) {
    return { inRollout: false, treatment: null };
  }

  const isOverridden = await userHasOverride(rollout.id, userId);
  if (isOverridden) {
    return { inRollout: true, treatment: rollout.treatment };
  }

  const bucket = getBucket(userId, rolloutKey);
  const inRollout = bucket >= rollout.hashRangeStart && bucket <= rollout.hashRangeEnd;

  return {
    inRollout,
    treatment: inRollout ? rollout.treatment : null,
  };
}

export async function getUserRollouts(
  userId: number | string,
): Promise<Record<string, { inRollout: boolean; treatment: string | null }>> {
  const rollouts = await withRedisCache(`rollouts:active:v1`, 30, async () => {
    return getActiveRollouts();
  });

  const overrideRepo = AppDataSource.getRepository(RolloutUserOverride);
  const overrides = await overrideRepo.find({ where: { userId: Number(userId) } });
  const overriddenRolloutIds = new Set(overrides.map((o) => o.rolloutId));

  const result: Record<string, any> = {};
  for (const rollout of rollouts) {
    const isOverridden = overriddenRolloutIds.has(rollout.id);
    let inRollout: boolean;

    if (isOverridden) {
      inRollout = true;
    } else {
      const bucket = getBucket(userId, rollout.key);
      inRollout = bucket >= rollout.hashRangeStart && bucket <= rollout.hashRangeEnd;
    }

    result[rollout.key] = {
      inRollout,
      treatment: inRollout ? rollout.treatment : null,
    };
  }

  return result;
}

async function userHasOverride(rolloutId: number, userId: number | string): Promise<boolean> {
  const repo = AppDataSource.getRepository(RolloutUserOverride);
  const count = await repo.count({ where: { rolloutId, userId: Number(userId) } });
  return count > 0;
}

export async function getAllRollouts(): Promise<Rollout[]> {
  const repo = AppDataSource.getRepository(Rollout);
  return repo.find({ order: { createdAt: 'DESC' } });
}

export async function createRollout(data: Partial<Rollout>): Promise<Rollout> {
  const repo = AppDataSource.getRepository(Rollout);
  const rollout = repo.create(data);
  return repo.save(rollout);
}

export async function updateRollout(id: number, data: Partial<Rollout>): Promise<Rollout | null> {
  const repo = AppDataSource.getRepository(Rollout);
  const rollout = await repo.findOneBy({ id });
  if (!rollout) return null;
  Object.assign(rollout, data);
  return repo.save(rollout);
}

export async function deleteRollout(id: number): Promise<boolean> {
  const repo = AppDataSource.getRepository(Rollout);
  const result = await repo.delete(id);
  return (result.affected ?? 0) > 0;
}

export async function getOverridesForRollout(rolloutId: number): Promise<RolloutUserOverride[]> {
  const repo = AppDataSource.getRepository(RolloutUserOverride);
  return repo.find({ where: { rolloutId }, order: { createdAt: 'DESC' } });
}

export async function addRolloutOverride(rolloutId: number, userId: number): Promise<RolloutUserOverride> {
  const repo = AppDataSource.getRepository(RolloutUserOverride);
  const existing = await repo.findOneBy({ rolloutId, userId });
  if (existing) return existing;
  const override = repo.create({ rolloutId, userId });
  return repo.save(override);
}

export async function removeRolloutOverride(rolloutId: number, userId: number): Promise<boolean> {
  const repo = AppDataSource.getRepository(RolloutUserOverride);
  const result = await repo.delete({ rolloutId, userId });
  return (result.affected ?? 0) > 0;
}