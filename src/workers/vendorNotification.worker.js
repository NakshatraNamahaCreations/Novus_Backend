import { Worker } from "bullmq";
import { queueRedis } from "../config/redisQueue.js";
import { PrismaClient } from "@prisma/client";
import { sendPushNotification } from "../modules/notifications/notification.service.js";


const prisma = new PrismaClient();


export const vendorNotificationWorker = new Worker(
  "vendor-notifications",
  async (job) => {
    const { orderId, pincode, latitude, longitude, testType, radiusKm } =
      job.data;

    // 🔍 Find vendors by GEO
    const vendors = await queueRedis.sendCommand([
      "GEORADIUS",
      "vendors:geo",
      String(longitude),
      String(latitude),
      String(radiusKm || 5),
      "km"
    ]);

    for (const vendorId of vendors.map(v => v[0])) {
      // ❌ Skip rejected vendors
      const rejected = await queueRedis.sIsMember(
        `rejected:${orderId}`,
        vendorId
      );
      if (rejected) continue;

      // 🟢 Check online status
      const isOnline = await queueRedis.exists(
        `vendor:online:${vendorId}`
      );

      if (isOnline) {
        // ONLINE vendors already get socket event
        continue;
      }

      // 🔔 OFFLINE vendors → PUSH
      const vendor = await prisma.vendor.findUnique({
        where: { id: Number(vendorId) },
        select: { fcmToken: true }
      });

      if (!vendor?.fcmToken) continue;

      await sendPushNotification({
        token: vendor.fcmToken,
        title: "New Job Available",
        body: `New ${testType} order near you`,
        data: {
          orderId: String(orderId),
          type: "NEW_ORDER"
        }
      });
    }
  },
  {
    connection: queueRedis,
    concurrency: 5
  }
);
