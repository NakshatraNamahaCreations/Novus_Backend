import cron from 'node-cron';

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// run every hour, delete history older than 24 hours
export const startCleanupJob = (hours = 24) => {
  // run at minute 0 every hour
  cron.schedule('0 * * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      const { count } = await prisma.vendorLocationHistory.deleteMany({
        where: { recordedAt: { lt: cutoff } }
      });
      console.log('cleanup removed', count, 'old location records');
    } catch (err) {
      console.error('cleanup error', err);
    }
  });
};

export async function clearAllOrders() {
  try {
    const orderKeys = await redis.keys("order:*");
    const rejectKeys = await redis.keys("rejected:*");

    const all = [...orderKeys, ...rejectKeys];

    if (all.length) {
      await redis.del(all);
      console.log(`🧹 Deleted ${all.length} Redis order keys`);
    } else {
      console.log("✔ No order keys found to delete");
    }

  } catch (err) {
    console.error("clearAllOrders error:", err);
  }
}