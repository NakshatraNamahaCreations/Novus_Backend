import { Worker, QueueEvents } from "bullmq";
import { queueRedis } from "../config/redisQueue.js";
import { PrismaClient, ReportDispatchStatus } from "@prisma/client";
import { generatePatient3Pdfs } from "../services/patientReportPdf.service.js";
import { uploadBufferToS3 } from "../config/s3.js";
import { whatsappQueue } from "../queues/whatsapp.queue.js";

const prisma = new PrismaClient();

/* -----------------------------
   Queue Events (logs)
----------------------------- */
const reportQueueEvents = new QueueEvents("report-queue", { connection: queueRedis });

reportQueueEvents.on("failed", ({ jobId, failedReason }) => {
  console.log("❌ report job failed", jobId, failedReason);
});

reportQueueEvents.on("completed", ({ jobId }) => {
  console.log("✅ report job completed", jobId);
});

/* -----------------------------
   Helpers
----------------------------- */
function buildKey({ orderId, patientId, variant }) {
  return `reports/order-${orderId}/patient-${patientId}/${variant}.pdf`;
}

async function safeQueueAdd(queue, name, data, opts) {
  try {
    await queue.add(name, data, opts);
  } catch (e) {
    const msg = String(e?.message || "").toLowerCase();
    // BullMQ throws "Job already exists" when jobId is duplicate
    if (msg.includes("already exists")) {
      console.log(`ℹ️ job already exists: ${opts?.jobId}`);
      return;
    }
    throw e;
  }
}

/* -----------------------------
   Worker
----------------------------- */
new Worker(
  "report-queue",
  async (job) => {
    const orderId = Number(job.data?.orderId);
    if (!orderId) throw new Error("Invalid orderId");

    console.log("📄 Patient-wise report job:", job.id, "orderId:", orderId);

    // IMPORTANT: fetch orderMember.id so we can update by orderMemberId
    const members = await prisma.orderMember.findMany({
      where: { orderId },
      select: { id: true, patientId: true },
    });

    if (!members.length) throw new Error("No order members found");

    for (const m of members) {
      const orderMemberId = m.id;
      const patientId = m.patientId;

      try {
        // 1) mark PatientReportPdf row PENDING (upsert)
        await prisma.patientReportPdf.upsert({
          where: { orderId_patientId: { orderId, patientId } },
          create: { orderId, patientId, status: "PENDING" },
          update: { status: "PENDING" },
        });

        // 2) generate 3 pdf buffers for one patient
        const { plainBuffer, letterheadBuffer, fullBuffer } = await generatePatient3Pdfs({
          orderId,
          patientId,
        });

        // 3) upload 3 PDFs
        const plainKey = buildKey({ orderId, patientId, variant: "plain" });
        const letterKey = buildKey({ orderId, patientId, variant: "letterhead" });
        const fullKey = buildKey({ orderId, patientId, variant: "full" });

        const [plainUrl, letterUrl, fullUrl] = await Promise.all([
          uploadBufferToS3({ buffer: plainBuffer, key: plainKey, contentType: "application/pdf" }),
          uploadBufferToS3({ buffer: letterheadBuffer, key: letterKey, contentType: "application/pdf" }),
          uploadBufferToS3({ buffer: fullBuffer, key: fullKey, contentType: "application/pdf" }),
        ]);

        // 4) save urls
        await prisma.patientReportPdf.update({
          where: { orderId_patientId: { orderId, patientId } },
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

        // ✅ 5) mark OrderMemberPackage items READY (use FK orderMemberId)
        const upd = await prisma.orderMemberPackage.updateMany({
          where: {
            orderMemberId, // ✅ reliable
            // dispatchStatus: ReportDispatchStatus.NOT_READY,
          },
          data: {
            dispatchStatus: ReportDispatchStatus.READY,
            readyAt: new Date(),
            dispatchedAt:new Date()
          },
        });

        console.log("✅ READY updated count:", upd.count, { orderId, patientId, orderMemberId });

        // ✅ 6) enqueue WhatsApp per patient (send FULL by default)
        const waJobId = `wa-patient-report-${orderId}-${patientId}`;
        await safeQueueAdd(
          whatsappQueue,
          "whatsapp.sendPatientReport",
          { orderId, patientId, pdfType: "full" },
          { jobId: waJobId, removeOnComplete: true, attempts: 3 }
        );

        console.log("✅ patient pdfs stored + WA queued:", { orderId, patientId });
      } catch (err) {
        console.error("❌ patient report failed:", { orderId, patientId, orderMemberId, err: err?.message });

        // mark FAILED (so you can see which patient failed)
        await prisma.patientReportPdf.upsert({
          where: { orderId_patientId: { orderId, patientId } },
          create: { orderId, patientId, status: "FAILED" },
          update: { status: "FAILED" },
        });

        // You can either continue other patients, or throw to fail whole job.
        // continue;  // ✅ keep going
        throw err;   // ❌ fail whole job (choose this if you want retry)
      }
    }

    return true;
  },
  {
    connection: queueRedis,
    concurrency: 5, // puppeteer heavy; reduce if CPU/memory spikes
  }
);

console.log("🚀 Patient report worker started");

/* -----------------------------
   Optional: Graceful shutdown
----------------------------- */
process.on("SIGINT", async () => {
  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});
