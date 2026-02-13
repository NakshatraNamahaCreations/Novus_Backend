import { Worker, QueueEvents } from "bullmq";
import dayjs from "dayjs";

import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";

import { PrismaClient } from "@prisma/client";

import { queueRedis } from "../config/redisQueue.js";
import { WhatsAppMessage } from "../utils/whatsapp.js";
import { WHATSAPP_TEMPLATES } from "../templates/whatsapp.templates.js";



const prisma = new PrismaClient();




dayjs.extend(utc);
dayjs.extend(timezone);

dayjs.extend(customParseFormat);

const IST = "Asia/Kolkata";

const toIST12Hr = (dt) => {
  try {
    if (!dt) return "-";
    return dayjs.utc(dt).tz(IST).format("hh:mm A");
  } catch {
    return "-";
  }
};
const to12HrFromHHmm = (t) => {
  try {
    if (!t) return "-";
    // parses "22:00" properly
    return dayjs(t, "HH:mm").format("hh:mm A");
  } catch {
    return "-";
  }
};


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

    return names.size > 0 ? Array.from(names).join(", ") : "As per prescription";
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
  try {
    const dateStr = order?.date ? dayjs(order.date).format("DD MMM YYYY") : "-";
    const s = order?.centerSlot || order?.slot;



    if (s?.startTime && s?.endTime) {
      const timeStr = `${to12HrFromHHmm(s.startTime)} - ${to12HrFromHHmm(s.endTime)}${
        s?.name ? ` (${s.name})` : ""
      }`;

     
      return `${dateStr} ${timeStr}`;
    }

    return dateStr;
  } catch {
    return "-";
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
        centerSlot: true,
        orderMembers: {
          include: {
            patient: true,
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
   Fetch patient-wise report URL
---------------------------------- */
const fetchPatientReportUrl = async ({ orderId, patientId, pdfType = "full" }) => {
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
  try {
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
  } catch (err) {
    console.error("handleSendReport error:", err);
    throw err;
  }
};

const handleSendCenterConfirmation = async (order) => {
  try {
    // Only for center visit orders
    if (order?.isHomeSample) return { skipped: true, reason: "home-sample" };
    if (!order?.centerId) return { skipped: true, reason: "no-centerId" };

    const centerPhone = order?.center?.mobile;
    if (!centerPhone) return { skipped: true, reason: "center mobile missing" };

    const tpl = WHATSAPP_TEMPLATES.CENTER_CONFIRMATION;
    const testsStr = extractTestNames(order);
    const dateTime = formatOrderDateTime(order);

    console.log("dateTime",dateTime)

    const variables = tpl.mapVariables({
      centerName: safe(order.center?.contactName || order.center?.name, "Center"),
      patientName: safe(order.patient?.fullName, "Patient"),
      tests: safe(testsStr, "As per prescription"),
      dateTime: safe(dateTime, "-"),
    });

    await WhatsAppMessage({
      phone: `${centerPhone}`,
      templateId: tpl.templateId,
      message: tpl.message,
      variables,
    });

    return { success: true, type: "center-confirmation" };
  } catch (err) {
    console.error("handleSendCenterConfirmation error:", err);
    throw err;
  }
};

/* ----------------------------------
   Send PATIENT-wise report
---------------------------------- */
const handleSendPatientReport = async (order, { patientId, pdfType = "full" }) => {
  try {
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
  } catch (err) {
    console.error("handleSendPatientReport error:", err);
    throw err;
  }
};

/* ----------------------------------
   Welcome new patient (no orderId needed)
---------------------------------- */
const handleWelcomeNewPatient = async ({ contactNo, patientName }) => {
  try {
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
  } catch (err) {
    console.error("handleWelcomeNewPatient error:", err);
    throw err;
  }
};

/* ----------------------------------
   Send ORDER CONFIRMED
---------------------------------- */
const handleSendOrderConfirmed = async (order) => {
  try {
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
        collectionDate: order?.date ? dayjs(order.date).format("DD MMM YYYY") : "-",
        timeSlot: order?.slot
  ? `${toIST12Hr(order.slot.startTime)} - ${toIST12Hr(order.slot.endTime)}${
      order.slot?.name ? ` (${order.slot.name})` : ""
    }`
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

    // ✅ Send to customer
    await WhatsAppMessage({
      phone: order.patient?.contactNo,
      templateId: tpl.templateId,
      message: tpl.message,
      variables,
    });

    // ✅ Send to center if needed
    await handleSendCenterConfirmation(order);

    return { success: true, type: order?.isHomeSample ? "order-confirmed" : "center-visit" };
  } catch (err) {
    console.error("handleSendOrderConfirmed error:", err);
    throw err;
  }
};

/* ----------------------------------
   ✅ PAYMENT CONFIRMED (uses Payment.invoiceUrl)
   job.name: "whatsapp.sendPaymentConfirmed"
---------------------------------- */
const handleSendPaymentConfirmed = async ({ paymentId }) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { paymentId },
      select: {
        invoiceUrl: true,
        patient: {
          select: {
            fullName: true,
            contactNo: true,
          },
        },
      },
    });

    if (!payment) throw new Error(`Payment not found for paymentId: ${paymentId}`);
    if (!payment.invoiceUrl) throw new Error("Invoice URL not ready yet");

    const tpl = WHATSAPP_TEMPLATES.PAYMENT_CONFIRMED;

    const variables = tpl.mapVariables({
      customerName: safe(payment.patient?.fullName, "Customer"),
      invoiceUrl: safe(payment.invoiceUrl, "-"),
      supportNumber: process.env.SUPPORT_PHONE || "8050065924",
    });

    await WhatsAppMessage({
      phone: `${payment.patient?.contactNo}`,
      templateId: tpl.templateId,
      message: tpl.message,
      variables,
    });

    return { success: true, type: "payment-confirmed" };
  } catch (err) {
    console.error("handleSendPaymentConfirmed error:", err);
    throw err;
  }
};


/* ----------------------------------
   Existing: Send ORDER + PAYMENT
---------------------------------- */
const handleSendOrderAndPayment = async (order) => {
  try {
    await handleSendOrderConfirmed(order);
    // If you still want payment from order-level, keep it separate;
    // BUT for invoiceUrl-based payment, use paymentId job instead.
    return { success: true, type: "order+payment" };
  } catch (err) {
    console.error("handleSendOrderAndPayment error:", err);
    throw err;
  }
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

        // ✅ separate order confirmed
        case "whatsapp.sendOrderConfirmed": {
          const { orderId } = job.data || {};
          if (!orderId) throw new Error("Missing orderId");
          const order = await fetchOrder(orderId);
          if (!order) throw new Error("Order not found");
          return await handleSendOrderConfirmed(order);
        }

        // ✅ PAYMENT CONFIRMED after invoiceUrl (uses paymentId)
        case "whatsapp.sendPaymentConfirmed": {
          const { paymentId } = job.data || {};
          if (!paymentId) throw new Error("Missing paymentId");
          return await handleSendPaymentConfirmed({ paymentId });
        }

        // ✅ existing jobs that need orderId
        case "whatsapp.sendReport":
        case "whatsapp.sendPatientReport":
        case "whatsapp.sendOrderAndPayment":
        default: {
          const { orderId } = job.data || {};
          if (!orderId) throw new Error("Missing orderId");

          const order = await fetchOrder(orderId);
          if (!order) throw new Error("Order not found");

          if (job.name === "whatsapp.sendReport") return await handleSendReport(order);

          if (job.name === "whatsapp.sendPatientReport") {
            return await handleSendPatientReport(order, {
              patientId: job.data.patientId,
              pdfType: job.data.pdfType || "full",
            });
          }

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
