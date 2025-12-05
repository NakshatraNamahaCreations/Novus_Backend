import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379"
});

// auto reconnect logging
redis.on("error", (err) => console.error("Redis Error:", err));
redis.on("connect", () => console.log("Redis connected"));

await redis.connect().catch((err) =>
  console.error("Redis connect failed:", err)
);

// export as default for ES module usage
export default redis;
