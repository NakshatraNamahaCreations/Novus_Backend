import { Worker } from "bullmq";
import Redis from "ioredis";
import dayjs from "dayjs";
import { PrismaClient } from "@prisma/client";
import { WhatsAppMessage } from "../utils/whatsapp.js";
import { WHATSAPP_TEMPLATES } from "../templates/whatsapp.templates.js";

const prisma = new PrismaClient();

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
});

const safe = (v, fallback = "N/A") =>
  v !== undefined && v !== null && v !== "" ? String(v) : fallback;

/* ----------------------------------
   Extract test / package names
---------------------------------- */
const extractTestNames = (order) => {
  const names = new Set();

  for (const member of order.orderMembers || []) {
    for (const omp of member.orderMemberPackages || []) {
      // 🧪 Individual test
      if (omp.test?.name) {
        names.add(omp.test.name);
      }

      // 📦 Package
      if (omp.package?.name) {
        names.add(omp.package.name);
      }
    }
  }

  return names.size ? Array.from(names).join(", ") : "As per prescription";
};

new Worker(
  "whatsapp",
  async (job) => {
    try {
      const { orderId } = job.data;
      if (!orderId) throw new Error("Missing orderId");

     
      /* 🔹 Fetch order with relations */
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          patient: true,
          address: true,
          slot: true,
          orderMembers: {
            include: {
              orderMemberPackages: {
                include: {
                  test: { select: { name: true } },
                  package: { select: { name: true } },
                },
              },
            },
          },
        },
      });

  

      if (!order?.patient?.contactNo) {
        throw new Error("Patient phone not found");
      }

      /* 🔹 Extract tests */
      const testsStr = extractTestNames(order);

      /* ===============================
         1️⃣ ORDER CONFIRMED MESSAGE
      =============================== */
      const orderTemplate = WHATSAPP_TEMPLATES.ORDER_CONFIRMED;

      const orderVariables = orderTemplate.mapVariables({
        customerName: safe(order.patient.fullName, "Customer"),
        bookingId: safe(order.id),
        tests: testsStr,
        collectionDate: dayjs(order.date).format("DD MMM YYYY"),
        timeSlot: order.slot
          ? `${dayjs(order.slot.startTime).format("hh:mm A")} - ${dayjs(
              order.slot.endTime
            ).format("hh:mm A")}`
          : "Scheduled Slot",
        address: [
          order.address?.houseNo,
          order.address?.area,
          order.address?.city,
          order.address?.pincode,
        ]
          .filter(Boolean)
          .join(", "),
        supportNumber: process.env.SUPPORT_PHONE || "8050065924",
      });

      await WhatsAppMessage({
        phone: order.patient.contactNo,
        templateId: orderTemplate.templateId,
        message: orderTemplate.message,
        variables: orderVariables,
      });

      /* ===============================
         2️⃣ PAYMENT CONFIRMED MESSAGE
      =============================== */
      const paymentTemplate = WHATSAPP_TEMPLATES.PAYMENT_CONFIRMED;

      const paymentVariables = paymentTemplate.mapVariables({
        customerName: safe(order.patient.fullName, "Customer"),
        amount: safe(order.totalAmount),
        paymentMode: safe(order.paymentMode, "Online"),
        transactionId: safe(order.merchantOrderId, order.id),
        date: dayjs(order.createdAt || new Date()).format("DD MMM YYYY"),
      });

      await WhatsAppMessage({
        phone: order.patient.contactNo,
        templateId: paymentTemplate.templateId,
        message: paymentTemplate.message,
        variables: paymentVariables,
      });

      return { success: true };
    } catch (error) {
      console.error("❌ WhatsApp worker error:", error);
      throw error;
    }
  },
  { connection, concurrency: 10 }
);

console.log("✅ WhatsApp Worker running...");
