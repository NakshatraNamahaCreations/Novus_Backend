import { Worker, QueueEvents } from "bullmq";
import dayjs from "dayjs";
import { PrismaClient } from "@prisma/client";

import { queueRedis } from "../config/redisQueue.js";
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

    return names.size > 0
      ? Array.from(names).join(", ")
      : "As per prescription";
  } catch {
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

const formatOrderDateTime = (order) => {
  const dateStr = order?.date ? dayjs(order.date).format("DD MMM YYYY") : "-";

  // Prefer centerSlot for center visit (if available), else fallback to slot
  const s = order?.centerSlot || order?.slot;

  if (s?.startTime && s?.endTime) {
    const timeStr = `${dayjs(s.startTime).format("hh:mm A")} - ${dayjs(
      s.endTime,
    ).format("hh:mm A")}${s?.name ? ` (${s.name})` : ""}`;

    return `${dateStr} ${timeStr}`;
  }

  return dateStr;
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
        centerSlot: true,
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
        center: true,
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

const handleSendCenterConfirmation = async (order) => {

  console.log("order?.isHomeSample",order?.isHomeSample)
  console.log("!order?.centerId",!order?.centerId,order?.centerId)

  // Only for center visit orders
  if (order?.isHomeSample) return { skipped: true, reason: "home-sample" };
  if (!order?.centerId) return { skipped: true, reason: "no-centerId" };

  const centerPhone = order?.center?.mobile;

  console.log("centerPhone",centerPhone)
  if (!centerPhone) {
    return { skipped: true, reason: "center mobile missing" };
  }

  const tpl = WHATSAPP_TEMPLATES.CENTER_CONFIRMATION;

  const testsStr = extractTestNames(order);
  const dateTime = formatOrderDateTime(order);

  const variables = tpl.mapVariables({
    centerName: safe(order.center?.contactName || order.center?.name, "Center"),
    patientName: safe(order.patient?.fullName, "Patient"),
    tests: safe(testsStr, "As per prescription"),
    dateTime: safe(dateTime, "-"),
  });

  console.log("variables",variables)
  await WhatsAppMessage({
    phone: `${centerPhone}`,
    templateId: tpl.templateId,
    message: tpl.message,
    variables,
  });

  return { success: true, type: "center-confirmation" };
};

/* ----------------------------------
   Send PATIENT-wise report
---------------------------------- */
const handleSendPatientReport = async (
  order,
  { patientId, pdfType = "full" },
) => {
  if (!patientId) throw new Error("Missing patientId");

  const member = (order.orderMembers || []).find(
    (m) => Number(m.patientId) === Number(patientId),
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
      `Patient report not ready (orderId=${order.id}, patientId=${patientId}, pdfType=${pdfType})`,
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

  const tpl = order?.isHomeSample
    ? WHATSAPP_TEMPLATES.ORDER_CONFIRMED
    : WHATSAPP_TEMPLATES.CENTER_VISIT;

  let variables = [];

  if (order?.isHomeSample) {
    variables = tpl.mapVariables({
      customerName: safe(order.patient?.fullName, "Customer"),
      bookingId: safe(order.id),
      tests: safe(testsStr),
      collectionDate: order?.date
        ? dayjs(order.date).format("DD MMM YYYY")
        : "-",
      timeSlot: order?.slot
        ? `${dayjs(order.slot.startTime).format("hh:mm A")} - ${dayjs(
            order.slot.endTime,
          ).format(
            "hh:mm A",
          )}${order.slot?.name ? ` (${order.slot.name})` : ""}`
        : "-",
      address: [
        order.address?.address,
        order.address?.landmark,
        order.address?.city?.name || order.address?.city,
        order.address?.state,
        order.address?.pincode,
      ]
        .filter(Boolean)
        .join(", "),
      supportNumber: process.env.SUPPORT_PHONE || "8050065924",
    });
  } else {
    const centerAddress = [
      order.center?.address,
      order.center?.city?.name || order.center?.city,
      order.center?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    variables = tpl.mapVariables({
      customerName: safe(order.patient?.fullName, "Customer"),
      tests: safe(testsStr, "As per prescription"),
      centerName: safe(
        order.center?.name || order.address?.centerName,
        "Novus Health Labs",
      ),
      centerAddress: safe(centerAddress, "N/A"),
    });
  }

  // ✅ 1) Send to customer
  await WhatsAppMessage({
    phone: order.patient?.contactNo,
    templateId: tpl.templateId,
    message: tpl.message,
    variables,
  });

  // ✅ 2) ALSO send to center (only if isHomeSample=false and centerId exists)
  await handleSendCenterConfirmation(order);

  return {
    success: true,
    type: order?.isHomeSample ? "order-confirmed" : "center-visit",
  };
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
  { connection: queueRedis, concurrency: 10 },
);

console.log("✅ WhatsApp Worker running...");
