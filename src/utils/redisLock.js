import crypto from "crypto";
import redis from "../config/redis.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const acquireLock = async (
  key,
  opts = { ttlMs: 8000, waitMs: 6000, retryDelayMs: 120 }
) => {
  const token = crypto.randomBytes(16).toString("hex");
  const start = Date.now();

  while (Date.now() - start < opts.waitMs) {
    const ok = await redis.set(
      key,
      token,
      "NX",
      "PX",
      opts.ttlMs
    );

    if (ok === "OK") {
      return {
        release: async () => {
          await redis.del(key);
        },
      };
    }

    await sleep(opts.retryDelayMs);
  }

  throw new Error("Slot is busy, please retry");
};
