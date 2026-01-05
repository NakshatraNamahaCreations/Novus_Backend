import { Worker, QueueEvents } from "bullmq";

import dayjs from "dayjs";
import { PrismaClient } from "@prisma/client";

import { queueRedis } from "../config/redisQueue.js"; // ✅ use SAME redis connection everywhere
import { WhatsAppMessage } from "../utils/whatsapp.js";
import { WHATSAPP_TEMPLATES } from "../templates/whatsapp.templates.js";

const prisma = new PrismaClient();




const safe = (v, fallback = "N/A") =>
  v !== undefined && v !== null && v !== "" ? String(v) : fallback;

/* ----------------------------------
   Extract test / package names
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
   Fetch order with common includes
---------------------------------- */
const fetchOrder = async (orderId) => {
  try {
    return await prisma.order.findUnique({
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
  } catch (err) {
    console.error("fetchOrder error:", err);
    throw err;
  }
};

/* ----------------------------------
   Send REPORT message
   job.name: "whatsapp.sendReport"
---------------------------------- */
const handleSendReport = async (order) => {
  try {
    const reportLink = order.reportUrl;


    if (!reportLink) {
      // ✅ retry later
      throw new Error("Report URL not found yet on order");
    }

    const testsStr = extractTestNames(order);
    

    const tpl = WHATSAPP_TEMPLATES.REPORT_SHARED_NOVUS;

    const variables = tpl.mapVariables({
      customerName: safe(order.patient?.fullName, "Customer"),
      tests: safe(testsStr, "As per prescription"),
      reportDate: dayjs(new Date()).format("DD MMM YYYY"),
      reportLink: reportLink,
    });

 

    await WhatsAppMessage({
      phone:`${order?.patient?.contactNo}`,
      templateId: tpl.templateId,
      message: tpl.message,
      variables,
    });

    return { success: true, type: "report" };
  } catch (err) {
    console.error("handleSendReport error:", err);
    throw err;
  }
};

/* ----------------------------------
   Send ORDER + PAYMENT messages
   job.name: "whatsapp.sendOrderAndPayment"
---------------------------------- */
const handleSendOrderAndPayment = async (order) => {
  try {
    const testsStr = extractTestNames(order);

    // 1️⃣ ORDER CONFIRMED
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

    // 2️⃣ PAYMENT CONFIRMED
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

    return { success: true, type: "order+payment" };
  } catch (err) {
    console.error("handleSendOrderAndPayment error:", err);
    throw err;
  }
};

new Worker(
  "whatsapp",
  async (job) => {
    try {
      const { orderId } = job.data || {};
      console.log("📩 WhatsApp job received:", job.id, job.name, job.data);

      if (!orderId) throw new Error("Missing orderId");

  
      const order = await fetchOrder(orderId);
   
      if (!order) throw new Error("Order not found");
      if (!order?.patient?.contactNo) throw new Error("Patient phone not found");

      // ✅ Route by job.name
      switch (job.name) {
        case "whatsapp.sendReport":
          return await handleSendReport(order);

        case "whatsapp.sendOrderAndPayment":
          return await handleSendOrderAndPayment(order);

        // ✅ Backward compatibility: if someone adds jobs without name
        default:
          return await handleSendOrderAndPayment(order);
      }
    } catch (error) {
      console.error("❌ WhatsApp worker error:", error);
      throw error; // required for retries
    }
  },
  {
    connection: queueRedis, // ✅ same redis instance
    concurrency: 10,
  }
);

console.log("✅ WhatsApp Worker running...");
