import IORedis from "ioredis";

export const queueRedis = new IORedis(
  process.env.REDIS_QUEUE_URL || "redis://127.0.0.1:6379/1",
  {
    maxRetriesPerRequest: null
  }
);

queueRedis.on("connect", () => {
  console.log("✅ Queue Redis connected");
});

queueRedis.on("error", (err) => {
  console.error("❌ Queue Redis error", err);
});
