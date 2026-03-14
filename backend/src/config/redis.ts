import { createClient } from 'redis';

export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

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
