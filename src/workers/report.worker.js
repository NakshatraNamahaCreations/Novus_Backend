import { Worker, QueueEvents } from "bullmq";
import { queueRedis } from "../config/redisQueue.js";
import { PrismaClient } from "@prisma/client";
import { generateReportPDF } from "../services/reportPdf.service.js";
import { uploadBufferToS3 } from "../config/s3.js";
import { whatsappQueue } from "../queues/whatsapp.queue.js";

const prisma = new PrismaClient();

// ✅ ADD THIS (QueueEvents) — for debug logs
const reportQueueEvents = new QueueEvents("report-queue", {
  connection: queueRedis,
});

reportQueueEvents.on("failed", ({ jobId, failedReason }) => {
  console.log("❌ report job failed", jobId, failedReason);
});

reportQueueEvents.on("completed", ({ jobId }) => {
  console.log("✅ report job completed", jobId);
});

// ✅ Worker
new Worker(
  "report-queue",
  async (job) => {
    const { orderId } = job.data;
    console.log("📄 Report generate job:", job.id, "orderId:", orderId);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { patient: { include: { testResults: true } } },
    });

    if (!order) throw new Error("Order not found");

    const pdfBuffer = await generateReportPDF(order);

    const key = `reports/${order.id}.pdf`;
    const url = await uploadBufferToS3({
      buffer: pdfBuffer,
      key,
      contentType: "application/pdf",
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { reportUrl: url },
    });

    await whatsappQueue.add(
      "whatsapp.sendReport",
      { orderId },
      {
        jobId: `whatsapp-report-${orderId}-${Date.now()}`,
        removeOnComplete: true,
      }
    );

    return true;
  },
  {
    connection: queueRedis,
    concurrency: 20,
  }
);

console.log("🚀 Report worker started");
