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

const safe = (v, fallback = "N/A") =>
  v !== undefined && v !== null && v !== "" ? String(v) : fallback;

const formatTime12Hr = (value) => {
  try {
    if (!value) return "-";

    // Handles Date object / ISO datetime / prisma datetime
    if (value instanceof Date || typeof value === "string") {
      const d = dayjs(value).tz(IST);
      if (d.isValid()) return d.format("hh:mm A");
    }

    return "-";
  } catch {
    return "-";
  }
};



const formatOrderDateTime = (order) => {
  try {
    const dateStr = getOrderDate(order);
    const slotStr = getOrderSlot(order);

    if (dateStr === "-" && slotStr === "-") return "-";
    if (slotStr === "-") return dateStr;

    return `${dateStr} ${slotStr}`;
  } catch {
    return "-";
  }
};


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



const fetchOrder = async (orderId) => {
  return prisma.order.findUnique({
    where: { id: Number(orderId) },
    include: {
      patient: true,
      address: true,
      slot: true,
      centerSlot: true,
      doctor: true,
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
};

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

const sendTemplateMessage = async ({
  phone,
  template,
  payload,
  media = null,
}) => {
  const variables = template.mapVariables(payload);

  console.log("templateId:", template?.templateId);
  console.log("phone:", phone);
  console.log("payload:", payload);
  console.log("variables:", variables);
  console.log("media:", media);

  await WhatsAppMessage({
    phone: String(phone),
    templateId: template.templateId,
    message: template.message,
    variables,
    ...(media ? { media } : {}),
  });
};

const getProcessingCentreName = (order) =>
  safe(order?.center?.name || order?.address?.centerName || "Novus Health Labs");

const getOrderDate = (order) => {
  try {
    return order?.date ? dayjs(order.date).tz(IST).format("DD MMM YYYY") : "-";
  } catch {
    return "-";
  }
};

const getOrderSlot = (order) => {
  try {
    const slot = order?.slot || order?.centerSlot;
    if (!slot) return "-";

    if (slot?.startTime && slot?.endTime) {
      const start = formatTime12Hr(slot.startTime);
      const end = formatTime12Hr(slot.endTime);

      return `${start} - ${end}${slot?.name ? ` (${slot.name})` : ""}`;
    }

    return slot?.name || "-";
  } catch (err) {
    console.error("getOrderSlot error:", err);
    return "-";
  }
};
/* -------------------------------
   Individual handlers
-------------------------------- */

const handleWelcomeNewPatient = async ({ contactNo, patientName }) => {
  const tpl = WHATSAPP_TEMPLATES.WELCOME_NEW_PATIENT;

  await sendTemplateMessage({
    phone: contactNo,
    template: tpl,
    payload: {
      customerName: safe(patientName, "Customer"),
    },
  });

  return { success: true, type: "welcome-new-patient" };
};

const handleSendOrderConfirmed = async (order) => {
  const tpl = order?.isHomeSample
    ? WHATSAPP_TEMPLATES.ORDER_CONFIRMED
    : WHATSAPP_TEMPLATES.CENTER_VISIT;

  if (order?.isHomeSample) {
    const testsStr = extractTestNames(order);

    const fullAddress = [
      order?.address?.addressLine1,
      order?.address?.addressLine2,
      order?.address?.landmark,
      order?.address?.area,
      order?.address?.city?.name || order?.address?.city,
      order?.address?.state?.name || order?.address?.state,
      order?.address?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    await sendTemplateMessage({
      phone: order.patient?.contactNo,
      template: tpl,
      payload: {
        customerName: safe(order.patient?.fullName, "Customer"),
        bookingId: safe(order.id, "-"),
        tests: safe(testsStr, "As per prescription"),
        collectionDate: safe(getOrderDate(order), "-"),
        timeSlot: safe(getOrderSlot(order), "-"),
        address: safe(fullAddress, "N/A"),
        supportNumber: safe(
          process.env.SUPPORT_PHONE || process.env.SUPPORT_CONTACT,
          "8050065924"
        ),
      },
    });
  } else {
    const testsStr = extractTestNames(order);

    const centerAddress = [
      order?.center?.address,
      order?.center?.area,
      order?.center?.city?.name || order?.center?.city,
      order?.center?.state?.name || order?.center?.state,
      order?.center?.pincode,
    ]
      .filter(Boolean)
      .join(", ");

    await sendTemplateMessage({
      phone: order.patient?.contactNo,
      template: tpl,
      payload: {
        customerName: safe(order.patient?.fullName, "Customer"),
        tests: safe(testsStr, "As per prescription"),
        centerName: safe(order.center?.name, "Novus Health Labs"),
        centerAddress: safe(centerAddress, "N/A"),
      },
    });

    await handleSendCenterConfirmation(order);
  }

  return {
    success: true,
    type: order?.isHomeSample ? "order-confirmed" : "center-visit",
  };
};

const handleSendCenterConfirmation = async (order) => {
  if (order?.isHomeSample) return { skipped: true, reason: "home-sample" };
  if (!order?.centerId) return { skipped: true, reason: "no-centerId" };
  if (!order?.center?.mobile) return { skipped: true, reason: "center mobile missing" };

  const tpl = WHATSAPP_TEMPLATES.CENTER_CONFIRMATION;

  await sendTemplateMessage({
    phone: order.center.mobile,
    template: tpl,
    payload: {
      centerName: safe(order.center?.contactName || order.center?.name, "Center"),
      patientName: safe(order.patient?.fullName, "Patient"),
      tests: safe(extractTestNames(order), "As per prescription"),
      dateTime: safe(formatOrderDateTime(order), "-"),
    },
  });

  return { success: true, type: "center-confirmation" };
};

const handleSendPaymentConfirmed = async ({ paymentId }) => {
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

  await sendTemplateMessage({
    phone: payment.patient?.contactNo,
    template: tpl,
    payload: {
      customerName: safe(payment.patient?.fullName, "Customer"),
      invoiceUrl: safe(payment.invoiceUrl, "-"),
    },
    media: payment.invoiceUrl,
  });

  return { success: true, type: "payment-confirmed" };
};

const handleSendPaymentLink = async ({
  phone,
  customerName,
  amount,
  bookingId,
  paymentLink,
  supportContact,
}) => {
  const tpl = WHATSAPP_TEMPLATES.PAYMENT_LINK;

  await sendTemplateMessage({
    phone,
    template: tpl,
    payload: {
      customerName: safe(customerName, "Customer"),
      amount: safe(amount, "0"),
      bookingId: safe(bookingId, "-"),
      paymentLink: safe(paymentLink, "-"),
      supportContact: safe(
        supportContact,
        process.env.SUPPORT_PHONE || "8050065924"
      ),
    },
  });

  return { success: true, type: "payment-link" };
};

const handleSendReport = async (order) => {
  const patientId = order?.patientId;

  let reportLink = order?.reportUrl;

  if (!reportLink && patientId) {
    reportLink = await fetchPatientReportUrl({
      orderId: order.id,
      patientId,
      pdfType: "full",
    });
  }

  if (!reportLink) {
    throw new Error(
      `Report URL not found yet (orderId=${order?.id}, patientId=${patientId})`
    );
  }

  const tpl = WHATSAPP_TEMPLATES.REPORT_SHARED_NOVUS;

  await sendTemplateMessage({
    phone: order?.patient?.contactNo,
    template: tpl,
    payload: {
      customerName: safe(order?.patient?.fullName, "Customer"),
      tests: safe(extractTestNames(order), "Medical Test"),
      reportDate: dayjs().tz(IST).format("DD MMM YYYY"),
      reportLink,
    },

  });

  return { success: true, type: "order-report" };
};

const handleSendDoctorReportConfirmation = async (
  order,
  { patientId, pdfType = "full" }
) => {
  if (!order?.doctorId) return { skipped: true, reason: "no-doctorId" };

  const doctorPhone = order?.doctor?.mobile || order?.doctor?.number;
  if (!doctorPhone) return { skipped: true, reason: "doctor mobile missing" };

  const tpl = WHATSAPP_TEMPLATES.DOCTOR_REPORT_CONFIRMATION;

  const reportLink = await fetchPatientReportUrl({
    orderId: order.id,
    patientId,
    pdfType,
  });

  if (!reportLink) return { skipped: true, reason: "report link not ready" };

  const member = (order.orderMembers || []).find(
    (m) => Number(m.patientId) === Number(patientId)
  );

  const patient = member?.patient || order.patient;

  const age = patient?.age ? String(patient.age) : "";
  const gender = patient?.gender ? String(patient.gender) : "";
  const ageGender = safe([age, gender].filter(Boolean).join(" / "), "N/A");

  await sendTemplateMessage({
    phone: doctorPhone,
    template: tpl,
    payload: {
      doctorName: safe(order?.doctor?.name, "Doctor"),
      patientName: safe(patient?.fullName, "Patient"),
      ageGender,
      testsDone: safe(
        extractTestNamesForPatient(order, patientId),
        "As per prescription"
      ),
      reportLink,
    },
  });

  return { success: true, type: "doctor-report-confirmation" };
};

const handleSendPatientReport = async (order, { patientId, pdfType = "full" }) => {
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

  const tpl = WHATSAPP_TEMPLATES.REPORT_SHARED_NOVUS;

  await sendTemplateMessage({
    phone: patient.contactNo,
    template: tpl,
    payload: {
      customerName: safe(patient?.fullName, "Customer"),
      tests: safe(extractTestNamesForPatient(order, patientId), "Medical Test"),
      reportDate: dayjs().tz(IST).format("DD MMM YYYY"),
      reportLink,
    },

  });

  await handleSendDoctorReportConfirmation(order, { patientId, pdfType });

  return { success: true, type: "patient-report", pdfType };
};

const handleSampleCollected = async ({ phone, customerName, collectionDateTime }) => {
  const tpl = WHATSAPP_TEMPLATES.SAMPLE_COLLECTED;

  await sendTemplateMessage({
    phone,
    template: tpl,
    payload: {
      customerName: safe(customerName, "Customer"),
      collectionDateTime: safe(collectionDateTime, "-"),
    },
  });

  return { success: true, type: "sample-collected" };
};

const handleSampleCollectedFromOrder = async (order) => {
  return handleSampleCollected({
    phone: order?.patient?.contactNo,
    customerName: order?.patient?.fullName,
    collectionDateTime: dayjs().tz(IST).format("DD MMM YYYY hh:mm A"),
  });
};

const handleSampleExecutiveOnTheWay = async ({ phone, customerName }) => {
  const tpl = WHATSAPP_TEMPLATES.SAMPLE_COLLECTION_EXECUTIVE_ON_THE_WAY;

  await sendTemplateMessage({
    phone,
    template: tpl,
    payload: {
      customerName: safe(customerName, "Customer"),
    },
  });

  return { success: true, type: "sample-executive-on-the-way" };
};

const handleSampleExecutiveOnTheWayFromOrder = async (order) => {
  return handleSampleExecutiveOnTheWay({
    phone: order?.patient?.contactNo,
    customerName: order?.patient?.fullName,
  });
};

const handleHomeSampleBookedAdmin = async ({
  adminPhone,
  adminName,
  patientName,
  tests,
  date,
  slot,
}) => {
  const tpl = WHATSAPP_TEMPLATES.HOME_SAMPLE_BOOKED_ADMIN;

  await sendTemplateMessage({
    phone: adminPhone,
    template: tpl,
    payload: {
      adminName: safe(adminName, "Admin"),
      patientName: safe(patientName, "Patient"),
      tests: safe(tests, "As per prescription"),
      date: safe(date, "-"),
      slot: safe(slot, "-"),
    },
  });

  return { success: true, type: "home-sample-booked-admin" };
};

const handleHomeSampleBookedAdminFromOrder = async (order, { adminPhone, adminName }) => {
  return handleHomeSampleBookedAdmin({
    adminPhone,
    adminName,
    patientName: safe(order?.patient?.fullName, "Patient"),
    tests: extractTestNames(order),
    date: getOrderDate(order),
    slot: getOrderSlot(order),
  });
};

const handleFeedbackRequest = async ({ phone, customerName, feedbackLink }) => {
  const tpl = WHATSAPP_TEMPLATES.FEEDBACK_REQUEST_NOVUS;

  await sendTemplateMessage({
    phone,
    template: tpl,
    payload: {
      customerName: safe(customerName, "Customer"),
      feedbackLink: safe(feedbackLink, "-"),
    },
  });

  return { success: true, type: "feedback-request" };
};

const handleThankYou = async ({ phone, customerName }) => {
  const tpl = WHATSAPP_TEMPLATES.THANK_YOU_NOVUS;

  await sendTemplateMessage({
    phone,
    template: tpl,
    payload: {
      customerName: safe(customerName, "Customer"),
    },
  });

  return { success: true, type: "thank-you" };
};

const handleSendOrderAndPayment = async (order) => {
  await handleSendOrderConfirmed(order);
  return { success: true, type: "order+payment" };
};

/* -------------------------------
   Queue events
-------------------------------- */

const whatsappEvents = new QueueEvents("whatsapp", { connection: queueRedis });

whatsappEvents.on("failed", ({ jobId, failedReason }) => {
  console.log("❌ whatsapp job failed", jobId, failedReason);
});

whatsappEvents.on("completed", ({ jobId }) => {
  console.log("✅ whatsapp job completed", jobId);
});

/* -------------------------------
   Worker
-------------------------------- */

new Worker(
  "whatsapp",
  async (job) => {
    try {
      console.log("📩 WhatsApp job received:", job.id, job.name, job.data);

      switch (job.name) {
        case "whatsapp.welcomeNewPatient":
          return handleWelcomeNewPatient({
            contactNo: job.data.contactNo,
            patientName: job.data.patientName,
          });

        case "whatsapp.sendOrderConfirmed": {
          const { orderId } = job.data || {};
          if (!orderId) throw new Error("Missing orderId");
          const order = await fetchOrder(orderId);
          if (!order) throw new Error("Order not found");
          return handleSendOrderConfirmed(order);
        }

        case "whatsapp.sendPaymentConfirmed": {
          const { paymentId } = job.data || {};
          if (!paymentId) throw new Error("Missing paymentId");
          return handleSendPaymentConfirmed({ paymentId });
        }

        case "whatsapp.sendPaymentLink":
          return handleSendPaymentLink({
            phone: job.data.phone,
            customerName: job.data.customerName,
            amount: job.data.amount,
            bookingId: job.data.bookingId,
            paymentLink: job.data.paymentLink,
            supportContact: job.data.supportContact,
          });

        case "whatsapp.sendSampleCollected": {
          const { orderId } = job.data || {};
          if (orderId) {
            const order = await fetchOrder(orderId);
            if (!order) throw new Error("Order not found");
            return handleSampleCollectedFromOrder(order);
          }

          return handleSampleCollected({
            phone: job.data.phone,
            customerName: job.data.customerName,
            collectionDateTime: job.data.collectionDateTime,
          });
        }

        case "whatsapp.sendSampleExecutiveOnTheWay": {
          const { orderId } = job.data || {};
          if (orderId) {
            const order = await fetchOrder(orderId);
            if (!order) throw new Error("Order not found");
            return handleSampleExecutiveOnTheWayFromOrder(order);
          }

          return handleSampleExecutiveOnTheWay({
            phone: job.data.phone,
            customerName: job.data.customerName,
          });
        }

        case "whatsapp.sendHomeSampleBookedAdmin": {
          const { orderId, adminPhone, adminName } = job.data || {};

          if (orderId) {
            const order = await fetchOrder(orderId);
            if (!order) throw new Error("Order not found");
            return handleHomeSampleBookedAdminFromOrder(order, {
              adminPhone,
              adminName,
            });
          }

          return handleHomeSampleBookedAdmin({
            adminPhone,
            adminName,
            patientName: job.data.patientName,
            tests: job.data.tests,
            date: job.data.date,
            slot: job.data.slot,
          });
        }

        case "whatsapp.sendFeedbackRequest":
          return handleFeedbackRequest({
            phone: job.data.phone,
            customerName: job.data.customerName,
            feedbackLink: job.data.feedbackLink,
          });

        case "whatsapp.sendThankYou":
          return handleThankYou({
            phone: job.data.phone,
            customerName: job.data.customerName,
          });

        case "whatsapp.sendReport": {
          const { orderId } = job.data || {};
          if (!orderId) throw new Error("Missing orderId");
          const order = await fetchOrder(orderId);
          if (!order) throw new Error("Order not found");
          return handleSendReport(order);
        }

        case "whatsapp.sendPatientReport": {
          const { orderId, patientId, pdfType = "full" } = job.data || {};
          if (!orderId) throw new Error("Missing orderId");
          const order = await fetchOrder(orderId);
          if (!order) throw new Error("Order not found");
          return handleSendPatientReport(order, { patientId, pdfType });
        }

        case "whatsapp.sendOrderAndPayment": {
          const { orderId } = job.data || {};
          if (!orderId) throw new Error("Missing orderId");
          const order = await fetchOrder(orderId);
          if (!order) throw new Error("Order not found");
          return handleSendOrderAndPayment(order);
        }

        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }
    } catch (error) {
      console.error("❌ WhatsApp worker error:", error);
      throw error;
    }
  },
  { connection: queueRedis, concurrency: 10 }
);

console.log("✅ WhatsApp Worker running...");