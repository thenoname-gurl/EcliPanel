import { RedisClient } from 'bun';

export const redisClient = new RedisClient(
  process.env.REDIS_URL || process.env.VALKEY_URL || 'redis://localhost:6379'
);

const inFlightCache = new Map<string, Promise<any>>();

redisClient.onconnect = () => console.info('Redis connected');
redisClient.onclose = err => {
  console.error('Redis connection closed', err);
  reconnectRedis();
};

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

async function reconnectRedis() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await redisClient.connect();
    } catch {
      setTimeout(reconnectRedis, 5000);
    }
  }, 1000);
}

export async function connectRedis() {
  if (!redisClient.connected) {
    await redisClient.connect();
  }
}

async function ensureConnection() {
  if (!redisClient.connected) {
    await redisClient.connect();
  }
}

export async function redisSet(key: string, value: string, ttlSeconds?: number) {
  await ensureConnection();
  await redisClient.set(key, value);
  if (ttlSeconds) {
    await redisClient.expire(key, ttlSeconds);
  }
}

export async function redisGet(key: string) {
  await ensureConnection();
  return await redisClient.get(key);
}

export async function redisDel(key: string) {
  await ensureConnection();
  await redisClient.del(key);
}

export async function redisDelByPrefix(prefix: string) {
  await ensureConnection();
  const pattern = `${prefix}*`;
  let batch: string[] = [];
  let cursor = '0';

  do {
    const result = await redisClient.send('SCAN', [cursor, 'MATCH', pattern, 'COUNT', '100']);
    if (!Array.isArray(result) || result.length < 2) break;
    cursor = String(result[0]);
    const keys = Array.isArray(result[1]) ? result[1] : [];
    for (const key of keys) {
      if (typeof key === 'string') {
        batch.push(key);
      } else if (key instanceof Uint8Array) {
        batch.push(new TextDecoder().decode(key));
      }
      if (batch.length >= 200) {
        await redisClient.send('DEL', batch);
        batch = [];
      }
    }
  } while (cursor !== '0');

  if (batch.length) {
    await redisClient.send('DEL', batch);
  }
}

export async function consumeRateLimit(key: string, limit: number, windowSeconds: number) {
  await ensureConnection();
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

export async function withRedisCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  try {
    const cached = await redisGet(key);
    if (cached != null) {
      const raw = typeof cached === 'string' ? cached : new TextDecoder().decode(cached);
      return JSON.parse(raw) as T;
    }
  } catch {
    // cache read failure buh
  }

  const existing = inFlightCache.get(key);
  if (existing) return (await existing) as T;

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
