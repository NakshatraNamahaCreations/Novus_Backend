
import { Queue } from "bullmq";
import { queueRedis } from "../config/redisQueue.js";

export const invoiceQueue = new Queue("invoice", {
  connection: queueRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: true
  }
});
