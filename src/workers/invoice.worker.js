import { Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";

import { generateAndUploadInvoice } from "../services/generateInvoice.service.js";
import { queueRedis } from "../config/redisQueue.js";
import { whatsappQueue } from "../queues/whatsapp.queue.js";

const prisma = new PrismaClient();

new Worker(
  "invoice",
  async (job) => {
    try {
      const { paymentId } = job.data || {};
      if (!paymentId) throw new Error("Missing paymentId");

      console.log("📄 Processing invoice for paymentId:", paymentId);

      // ✅ Fetch payment details needed for invoice generation
      const payment = await prisma.payment.findUnique({
        where: { paymentId },
        select: {
          id: true,
          paymentId: true,
          orderId: true,
          amount: true,
          currency: true,
          invoiceUrl: true,
          patient: {
            select: { fullName: true },
          },
        },
      });

      if (!payment) {
        throw new Error(`Payment not found for paymentId: ${paymentId}`);
      }

      // ✅ If invoice already exists, still ensure WhatsApp is queued (idempotent anyway)
      let invoiceUrl = payment.invoiceUrl || null;

      if (!invoiceUrl) {
        invoiceUrl = await generateAndUploadInvoice({
          paymentId: payment.id, // internal DB id
          amount: payment.amount,
          currency: payment.currency,
          patientName: payment.patient?.fullName || "Customer",
          orderId: payment.orderId,
        });

        await prisma.payment.update({
          where: { paymentId },
          data: { invoiceUrl },
        });

        console.log("✅ Invoice uploaded successfully to:", invoiceUrl);
      } else {
        console.log(
          "ℹ️ Invoice URL already exists, skipping generation:",
          invoiceUrl,
        );
      }

      await whatsappQueue.add(
        "whatsapp.sendPaymentConfirmed",
        { paymentId },
        {
          jobId: `payconfirm_${paymentId}`, 
          attempts: 5,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );

      console.log("📩 Queued WhatsApp payment confirmation for:", paymentId);

      return { success: true, paymentId, invoiceUrl };
    } catch (error) {
      console.error("❌ Error processing invoice job:", error);
      throw error;
    }
  },
  {
    connection: queueRedis,
    concurrency: 5,
    // NOTE: Worker options in BullMQ don't support "attempts/backoff" here;
    // attempts/backoff are set when adding jobs (Queue defaultJobOptions or add()).
  },
);

console.log("🚀 Invoice worker started");
