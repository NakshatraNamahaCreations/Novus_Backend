import { Worker } from "bullmq";
import { queueRedis } from "../config/redisQueue.js";
import { PrismaClient } from "@prisma/client";
import { sendPushNotification } from "../modules/notifications/notification.service.js";

const prisma = new PrismaClient();

export const vendorNotificationWorker = new Worker(
  "vendor-notifications",
  async (job) => {
    const { orderId, latitude, longitude, testType, radiusKm } = job.data;

    // console.log(" orderId, latitude, longitude, testType, radiusKm", orderId, latitude, longitude, testType, radiusKm)
    if (latitude == null || longitude == null) return;

    // ✅ Redis GEORADIUS returns vendorIds (members) as strings
    const vendorIds = await queueRedis.sendCommand([
      "GEORADIUS",
      "vendors:geo",
      String(longitude),
      String(latitude),
      String(radiusKm || 5),
      "km"
    ]);

    // vendorIds can be: ["12","18", ...]
    for (const vendorIdStr of vendorIds) {
      const vendorId = Number(vendorIdStr);
      if (!vendorId) continue;

      // ❌ Skip rejected vendors
      const rejected = await queueRedis.sIsMember(
        `rejected:${orderId}`,
        String(vendorId)
      );
      if (rejected) continue;

      // 🟢 If online -> socket will handle
      const isOnline = await queueRedis.exists(`vendor:online:${vendorId}`);
      if (isOnline) continue;

      // ✅ Fetch ALL device tokens for this vendor
      const devices = await prisma.vendorDevice.findMany({
        where: { vendorId },
        select: { fcmToken: true }
      });

      if (!devices?.length) continue;

      // 🔔 Send push to each token
      for (const d of devices) {
        if (!d?.fcmToken) continue;

        await sendPushNotification({
          token: d.fcmToken,
          title: "New Job Available",
          body: `New ${testType} order near for you`,
          data: {
            orderId: String(orderId),
            type: "NEW_ORDER"
          }
        });
      }
    }
  },
  {
    connection: queueRedis,
    concurrency: 5
  }
);
