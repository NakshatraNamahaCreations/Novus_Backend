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

/** Bust the app-facing catalogue caches (spotlight + banner lists).
 *  Call after archiving / restoring a package or test so the app stops (or resumes) showing its banners. */
export const invalidateCatalogueCaches = async () => {
  try {
    const [ks, kb] = await Promise.all([redis.keys("spotlights:*"), redis.keys("banners:*")]);
    const all = [...ks, ...kb];
    if (all.length) await redis.del(...all);
  } catch (e) {
    console.warn("catalogue cache invalidation failed:", e?.message || e);
  }
};

export default redis; // 👈 add this