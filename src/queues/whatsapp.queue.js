import { Queue } from "bullmq";
import { queueRedis } from "../config/redisQueue.js";

export const whatsappQueue = new Queue("whatsapp", {
  connection: queueRedis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});
