import { createClient } from 'redis';

export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

const inFlightCache = new Map<string, Promise<any>>();

redisClient.on('error', (err) => console.error('Redis Client Error', err));

export async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
}

export async function redisSet(key: string, value: string, ttlSeconds?: number) {
  if (ttlSeconds) {
    await redisClient.set(key, value, { EX: ttlSeconds });
  } else {
    await redisClient.set(key, value);
  }
}

export async function redisGet(key: string) {
  return await redisClient.get(key);
}

export async function redisDel(key: string) {
  await redisClient.del(key);
}

export async function redisDelByPrefix(prefix: string) {
  const pattern = `${prefix}*`;
  let batch: string[] = [];

  for await (const key of redisClient.scanIterator({ MATCH: pattern, COUNT: 100 })) {
    if (typeof key !== 'string') continue;
    batch.push(key);
    if (batch.length >= 200) {
      await redisClient.del(batch);
      batch = [];
    }
  }

  if (batch.length) {
    await redisClient.del(batch);
  }
}

export async function consumeRateLimit(key: string, limit: number, windowSeconds: number) {
  const countRaw = await redisClient.incr(key);
  const count = Number(countRaw);

  let ttl: number;
  if (count === 1) {
    await redisClient.expire(key, windowSeconds);
    ttl = windowSeconds;
  } else {
    const currentTtlRaw = await redisClient.ttl(key);
    const currentTtl = Number(currentTtlRaw);
    ttl = currentTtl > 0 ? currentTtl : windowSeconds;
  }

  return {
    allowed: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(0, ttl),
    resetSeconds: Math.max(0, ttl),
  };
}

export async function withRedisCache<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  try {
    const cached = await redisGet(key);
    if (cached != null) {
      const raw = typeof cached === 'string' ? cached : cached.toString();
      return JSON.parse(raw) as T;
    }
  } catch {
    // cache read failure buh
  }

  const existing = inFlightCache.get(key);
  if (existing) return await existing as T;

  const pending = (async () => {
    const value = await loader();
    try {
      await redisSet(key, JSON.stringify(value), ttlSeconds);
    } catch {
      // cache failure buh
    }
    return value;
  })();

  inFlightCache.set(key, pending);
  try {
    return await pending;
  } finally {
    inFlightCache.delete(key);
  }
}