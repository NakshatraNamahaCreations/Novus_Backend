import { Worker } from "bullmq";
import { queueRedis } from "../config/redisQueue.js";
import { PrismaClient } from "@prisma/client";
import { sendPushNotification } from "../modules/notifications/notification.service.js";
import { sendWhatsAppMessage } from "../modules/notifications/notification.service.js";

const prisma = new PrismaClient();

export const notificationWorker = new Worker(
  "notifications",
  async (job) => {
    const { notificationId } = job.data;

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    let patients = [];

    if (notification.audience === "all") {
      patients = await prisma.patient.findMany({
        where: { status: "active" },
        include: { patientDevices: true }
      });
    }

    if (
      notification.audience === "selected_patients" &&
      notification.selectedPatients?.length
    ) {
      patients = await prisma.patient.findMany({
        where: {
          id: { in: notification.selectedPatients },
          status: "active"
        },
        include: { patientDevices: true }
      });
    }

    let success = 0;
    let failed = 0;

    for (const patient of patients) {
      /* ================= PUSH ================= */
      if (
        (notification.type === "push" || notification.type === "both") &&
        patient.patientDevices?.length
      ) {
        for (const device of patient.patientDevices) {
          const result = await sendPushNotification({
            token: device.fcmToken,
            title: notification.title,
            body: notification.message,
            image: notification.imageUrl,
            data: { deepLink: notification.deepLink }
          });

          await prisma.notificationLog.create({
            data: {
              notificationId,
              patientId: patient.id,
              type: "push",
              status: result.success ? "sent" : "failed",
              deviceToken: device.fcmToken,
              errorMessage: result.errorMessage
            }
          });

          result.success ? success++ : failed++;
        }
      }

      /* ================= WHATSAPP ================= */
      if (
        (notification.type === "whatsapp" || notification.type === "both") &&
        patient.contactNo
      ) {
        const result = await sendWhatsAppMessage({
          to: patient.contactNo,
          message: notification.message
        });

        await prisma.notificationLog.create({
          data: {
            notificationId,
            patientId: patient.id,
            type: "whatsapp",
            status: result.success ? "sent" : "failed",
            phoneNumber: patient.contactNo,
            errorMessage: result.errorMessage
          }
        });

        result.success ? success++ : failed++;
      }
    }

    /* ---------- FINAL STATUS ---------- */
    let status = "sent";
    if (failed > 0 && success > 0) status = "partial";
    if (failed > 0 && success === 0) status = "failed";

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        recipients: success,
        failureCount: failed,
        status,
        sentAt: new Date()
      }
    });

    return { success, failed };
  },
  {
    connection: queueRedis,
    concurrency: 5
  }
);

notificationWorker.on("failed", (job, err) => {
  console.error("❌ Notification job failed:", job.id, err.message);
});
