

import { Worker, QueueEvents } from "bullmq";
import { queueRedis } from "../config/redisQueue.js";
import { PrismaClient } from "@prisma/client";
import { generatePatient3Pdfs } from "../services/patientReportPdf.service.js";
import { uploadBufferToS3 } from "../config/s3.js";
import { whatsappQueue } from "../queues/whatsapp.queue.js";

const prisma = new PrismaClient();

const reportQueueEvents = new QueueEvents("report-queue", { connection: queueRedis });

reportQueueEvents.on("failed", ({ jobId, failedReason }) => {
  console.log("❌ report job failed", jobId, failedReason);
});
reportQueueEvents.on("completed", ({ jobId }) => {
  console.log("✅ report job completed", jobId);
});

function buildKey({ orderId, patientId, variant }) {
  // overwrite always (no v1/v2 folders) -> storage stays controlled
  return `reports/order-${orderId}/patient-${patientId}/${variant}.pdf`;
}

new Worker(
  "report-queue",
  async (job) => {
    const { orderId } = job.data;
    console.log("📄 Patient-wise report job:", job.id, "orderId:", orderId);

    // get all patients in this order
    const members = await prisma.orderMember.findMany({
      where: { orderId: Number(orderId) },
      select: { patientId: true },
    });

    if (!members.length) throw new Error("No order members found");

    for (const m of members) {
      const patientId = m.patientId;

      // mark DB row PENDING (upsert)
      await prisma.patientReportPdf.upsert({
        where: { orderId_patientId: { orderId: Number(orderId), patientId } },
        create: { orderId: Number(orderId), patientId, status: "PENDING" },
        update: { status: "PENDING" },
      });

      // generate 3 pdf buffers for one patient
      const { plainBuffer, letterheadBuffer, fullBuffer } = await generatePatient3Pdfs({
        orderId,
        patientId,
      });

      // upload 3 PDFs
      const plainKey = buildKey({ orderId, patientId, variant: "plain" });
      const letterKey = buildKey({ orderId, patientId, variant: "letterhead" });
      const fullKey = buildKey({ orderId, patientId, variant: "full" });

      const plainUrl = await uploadBufferToS3({
        buffer: plainBuffer,
        key: plainKey,
        contentType: "application/pdf",
      });

      const letterUrl = await uploadBufferToS3({
        buffer: letterheadBuffer,
        key: letterKey,
        contentType: "application/pdf",
      });

      const fullUrl = await uploadBufferToS3({
        buffer: fullBuffer,
        key: fullKey,
        contentType: "application/pdf",
      });

      // save urls
      await prisma.patientReportPdf.update({
        where: { orderId_patientId: { orderId: Number(orderId), patientId } },
        data: {
          plainPdfUrl: plainUrl,
          letterheadPdfUrl: letterUrl,
          fullPdfUrl: fullUrl,
          plainPdfKey: plainKey,
          letterheadPdfKey: letterKey,
          fullPdfKey: fullKey,
          status: "READY",
          generatedAt: new Date(),
        },
      });

      // enqueue WhatsApp per patient (send FULL by default)
      await whatsappQueue.add(
        "whatsapp.sendPatientReport",
        { orderId: Number(orderId), patientId, pdfType: Date.now() },
        {
          jobId: `wa-patient-report-${orderId}-${patientId}-${Date.now()}`,
          removeOnComplete: true,
        }
      );

      console.log("✅ patient pdfs stored:", { orderId, patientId });
    }

    return true;
  },
  {
    connection: queueRedis,
    concurrency: 5, // keep lower because puppeteer heavy
  }
);

console.log("🚀 Patient report worker started");
