import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { notificationQueue } from "../../queues/notification.queue.js";

const prisma = new PrismaClient();

// Run every minute to check for scheduled notifications
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    const scheduledNotifications = await prisma.notification.findMany({
      where: {
        status: "scheduled",
        scheduledAt: {
          lte: now,
        },
      },
    });

    for (const notification of scheduledNotifications) {
      try {
        await notificationQueue.add(
          "send-notification",
          {
            notificationId: notification.id,
          },
          {
            jobId: `notification-${notification.id}`,
          }
        );

        // Update status to sent
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: "sent",
            sentAt: now,
          },
        });

        console.log(`Sent scheduled notification: ${notification.title}`);
      } catch (error) {
        console.error(
          `Failed to send scheduled notification ${notification.id}:`,
          error
        );

        // Update status to failed
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: "failed",
          },
        });
      }
    }
  } catch (error) {
    console.error("Error in notification scheduler:", error);
  }
});
