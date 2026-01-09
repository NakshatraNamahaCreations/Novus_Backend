import { Worker, QueueEvents } from "bullmq";
import dayjs from "dayjs";
import { PrismaClient } from "@prisma/client";

import { queueRedis } from "../config/redisQueue.js"; // ✅ same redis connection
import { WhatsAppMessage } from "../utils/whatsapp.js";
import { WHATSAPP_TEMPLATES } from "../templates/whatsapp.templates.js";

const prisma = new PrismaClient();

/* -----------------------------
   Helpers
------------------------------ */
const safe = (v, fallback = "N/A") =>
  v !== undefined && v !== null && v !== "" ? String(v) : fallback;

/* ----------------------------------
   Extract test / package names (ORDER level)
---------------------------------- */
const extractTestNames = (order) => {
  try {
    const names = new Set();

    for (const member of order.orderMembers || []) {
      for (const omp of member.orderMemberPackages || []) {
        if (omp.test?.name) names.add(omp.test.name);
        if (omp.package?.name) names.add(omp.package.name);
      }
    }

    return names.size ? Array.from(names).join(", ") : "As per prescription";
  } catch (err) {
    console.error("extractTestNames error:", err);
    return "As per prescription";
  }
};

/* ----------------------------------
   Extract test/package names (PATIENT level)
---------------------------------- */
const extractTestNamesForPatient = (order, patientId) => {
  try {
    const names = new Set();

    for (const member of order.orderMembers || []) {
      if (Number(member.patientId) !== Number(patientId)) continue;

      for (const omp of member.orderMemberPackages || []) {
        if (omp.test?.name) names.add(omp.test.name);
        if (omp.package?.name) names.add(omp.package.name);
      }
    }

    return names.size ? Array.from(names).join(", ") : "As per prescription";
  } catch (err) {
    console.error("extractTestNamesForPatient error:", err);
    return "As per prescription";
  }
};

/* ----------------------------------
   Fetch order with common includes
---------------------------------- */
const fetchOrder = async (orderId) => {
  try {
    return await prisma.order.findUnique({
      where: { id: Number(orderId) },
      include: {
        patient: true,
        address: true,
        slot: true,
        orderMembers: {
          include: {
            patient: true, // ✅ important for patient-wise send
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
  } catch (err) {
    console.error("fetchOrder error:", err);
    throw err;
  }
};

/* ----------------------------------
   Fetch patient-wise report URL (based on your model)
   pdfType: "plain" | "letterhead" | "full"
---------------------------------- */
const fetchPatientReportUrl = async ({
  orderId,
  patientId,
  pdfType = "full",
}) => {
  const row = await prisma.patientReportPdf.findUnique({
    where: {
      orderId_patientId: {
        orderId: Number(orderId),
        patientId: Number(patientId),
      },
    },
  });

  if (!row) return null;

  const type = String(pdfType).toLowerCase();
  if (type === "plain") return row.plainPdfUrl || null;
  if (type === "letterhead") return row.letterheadPdfUrl || null;

  return row.fullPdfUrl || null;
};

/* ----------------------------------
   Send REPORT message (ORDER-level reportUrl)
---------------------------------- */
const handleSendReport = async (order) => {
  const reportLink = order.reportUrl;
  if (!reportLink) throw new Error("Report URL not found yet on order");

  const testsStr = extractTestNames(order);
  const tpl = WHATSAPP_TEMPLATES.REPORT_SHARED_NOVUS;

  const variables = tpl.mapVariables({
    customerName: safe(order.patient?.fullName, "Customer"),
    tests: safe(testsStr, "As per prescription"),
    reportDate: dayjs().format("DD MMM YYYY"),
    reportLink,
  });

  await WhatsAppMessage({
    phone: `${order?.patient?.contactNo}`,
    templateId: tpl.templateId,
    message: tpl.message,
    variables,
  });

  return { success: true, type: "order-report" };
};

/* ----------------------------------
   Send PATIENT-wise report
---------------------------------- */
const handleSendPatientReport = async (
  order,
  { patientId, pdfType = "full" }
) => {
  if (!patientId) throw new Error("Missing patientId");

  const member = (order.orderMembers || []).find(
    (m) => Number(m.patientId) === Number(patientId)
  );

  const patient = member?.patient || order.patient;
  if (!patient?.contactNo) throw new Error("Patient phone not found");

  const reportLink = await fetchPatientReportUrl({
    orderId: order.id,
    patientId,
    pdfType,
  });

  if (!reportLink) {
    throw new Error(
      `Patient report not ready (orderId=${order.id}, patientId=${patientId}, pdfType=${pdfType})`
    );
  }

  const testsStr = extractTestNamesForPatient(order, patientId);
  const tpl = WHATSAPP_TEMPLATES.REPORT_SHARED_NOVUS;

  const variables = tpl.mapVariables({
    customerName: safe(patient?.fullName, "Customer"),
    tests: safe(testsStr, "As per prescription"),
    reportDate: dayjs().format("DD MMM YYYY"),
    reportLink,
  });

  await WhatsAppMessage({
    phone: `${patient.contactNo}`,
    templateId: tpl.templateId,
    message: tpl.message,
    variables,
  });

  return { success: true, type: "patient-report", pdfType };
};

/* ----------------------------------
   Welcome new patient (no orderId needed)
---------------------------------- */
const handleWelcomeNewPatient = async ({ contactNo, patientName }) => {
  const tpl = WHATSAPP_TEMPLATES.WELCOME_NEW_PATIENT;

  const variables = tpl.mapVariables({
    customerName: safe(patientName, "Customer"),
    supportNumber: process.env.SUPPORT_PHONE || "8050065924",
  });

  await WhatsAppMessage({
    phone: `${contactNo}`,
    templateId: tpl.templateId,
    message: tpl.message,
    variables,
  });

  return { success: true, type: "welcome-new-patient" };
};

/* ----------------------------------
   ✅ NEW: Send only ORDER CONFIRMED
   job.name: "whatsapp.sendOrderConfirmed"
---------------------------------- */
const handleSendOrderConfirmed = async (order) => {
  const testsStr = extractTestNames(order);

  const tpl = WHATSAPP_TEMPLATES.ORDER_CONFIRMED;

  const variables = tpl.mapVariables({
    customerName: safe(order.patient?.fullName, "Customer"),
    bookingId: safe(order.id),
    tests: safe(testsStr),
    collectionDate: dayjs(order.date).format("DD MMM YYYY"),
    timeSlot: order.slot
      ? `${dayjs(order.slot.startTime).format("hh:mm A")} - ${dayjs(
          order.slot.endTime
        ).format("hh:mm A")}`
      : "-",
    address: [
      order.address?.address || "NA",
     
    ]
      .filter(Boolean)
      .join(", "),
    supportNumber: process.env.SUPPORT_PHONE || "8050065924",
  });


  await WhatsAppMessage({
    phone: order.patient?.contactNo,
    templateId: tpl.templateId,
    message: tpl.message,
    variables,
  });

  return { success: true, type: "order-confirmed" };
};

/* ----------------------------------
   ✅ NEW: Send only PAYMENT CONFIRMED
   job.name: "whatsapp.sendPaymentConfirmed"
---------------------------------- */
const handleSendPaymentConfirmed = async (order) => {
  const tpl = WHATSAPP_TEMPLATES.PAYMENT_CONFIRMED;

  const variables = tpl.mapVariables({
    customerName: safe(order.patient?.fullName, "Customer"),
    amount: safe(order.finalAmount),
    paymentMode: safe(order.paymentMode, "Online"),
    transactionId: safe(order.merchantOrderId, order.id),
    date: dayjs(order.createdAt || new Date()).format("DD MMM YYYY"),
  });

  await WhatsAppMessage({
    phone: order.patient?.contactNo,
    templateId: tpl.templateId,
    message: tpl.message,
    variables,
  });

  return { success: true, type: "payment-confirmed" };
};

/* ----------------------------------
   Existing: Send ORDER + PAYMENT (now uses the 2 new handlers)
   job.name: "whatsapp.sendOrderAndPayment"
---------------------------------- */
const handleSendOrderAndPayment = async (order) => {
  await handleSendOrderConfirmed(order);
  await handleSendPaymentConfirmed(order);
  return { success: true, type: "order+payment" };
};

/* ----------------------------------
   QueueEvents (optional debug)
---------------------------------- */
const whatsappEvents = new QueueEvents("whatsapp", { connection: queueRedis });

whatsappEvents.on("failed", ({ jobId, failedReason }) => {
  console.log("❌ whatsapp job failed", jobId, failedReason);
});

whatsappEvents.on("completed", ({ jobId }) => {
  console.log("✅ whatsapp job completed", jobId);
});

/* ----------------------------------
   Worker
---------------------------------- */
new Worker(
  "whatsapp",
  async (job) => {
    try {
      console.log("📩 WhatsApp job received:", job.id, job.name, job.data);

      switch (job.name) {
        // ✅ jobs that don't need orderId
        case "whatsapp.welcomeNewPatient":
          return await handleWelcomeNewPatient({
            contactNo: job.data.contactNo,
            patientName: job.data.patientName,
          });

        // ✅ NEW: separate messages
        case "whatsapp.sendOrderConfirmed": {
          const { orderId } = job.data || {};
          if (!orderId) throw new Error("Missing orderId");
          const order = await fetchOrder(orderId);
          if (!order) throw new Error("Order not found");
          return await handleSendOrderConfirmed(order);
        }

        case "whatsapp.sendPaymentConfirmed": {
          const { orderId } = job.data || {};
          if (!orderId) throw new Error("Missing orderId");
          const order = await fetchOrder(orderId);
          if (!order) throw new Error("Order not found");
          return await handleSendPaymentConfirmed(order);
        }

        // ✅ existing jobs (need orderId)
        case "whatsapp.sendReport":
        case "whatsapp.sendPatientReport":
        case "whatsapp.sendOrderAndPayment":
        default: {
          const { orderId } = job.data || {};
          if (!orderId) throw new Error("Missing orderId");

          const order = await fetchOrder(orderId);
          if (!order) throw new Error("Order not found");

          if (job.name === "whatsapp.sendReport")
            return await handleSendReport(order);

          if (job.name === "whatsapp.sendPatientReport") {
            return await handleSendPatientReport(order, {
              patientId: job.data.patientId,
              pdfType: job.data.pdfType || "full",
            });
          }

          // default (and whatsapp.sendOrderAndPayment)
          return await handleSendOrderAndPayment(order);
        }
      }
    } catch (error) {
      console.error("❌ WhatsApp worker error:", error);
      throw error;
    }
  },
  { connection: queueRedis, concurrency: 10 }
);

console.log("✅ WhatsApp Worker running...");
