// src/utils/cache.js
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export const getOrSet = async (key, ttl, fetchFn) => {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const data = await fetchFn();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
};

export default redis; // 👈 add this