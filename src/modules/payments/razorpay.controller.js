// src/modules/pg/razorpay.controller.js

import { PrismaClient } from "@prisma/client";
import razorpay from "../../config/razorpayClient.js";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { WHATSAPP_TEMPLATES } from "../../templates/whatsapp.templates.js";
import { WhatsAppMessage } from "../../utils/whatsapp.js";

const prisma = new PrismaClient();

/** -----------------------------
 * Helpers
------------------------------ */
function cleanPhone10(input) {
  const s = String(input || "").replace(/\D/g, "");
  return s.length === 10 ? s : null;
}

function mapRazorpayMethodToEnum(method) {
  const m = String(method || "").toLowerCase();
  if (m === "upi") return "UPI";
  if (m === "card") return "CARD";
  if (m === "netbanking") return "NET_BANKING";
  if (m === "wallet") return "WALLET";
  return "UPI";
}

/** -----------------------------
 * 1) Create Payment Link (WhatsApp)
 * - Stores merchantOrderId in Order table (NO PaymentLink table needed)
------------------------------ */
export const createRazorpayPaymentLink = async (req, res) => {
  try {
    const { orderId, patientId } = req.query;

    if (!orderId || !patientId) {
      return res.status(400).json({ message: "orderId and patientId required" });
    }

    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      include: { patient: true },
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    const amountInPaise = Math.round(Number(order.finalAmount || 0) * 100);
    if (!amountInPaise || amountInPaise <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }
    const amountInRupees = amountInPaise / 100;

    const contactNo = cleanPhone10(order.patient?.contactNo);
    if (!contactNo) {
      return res.status(400).json({ message: "Invalid patient contact number" });
    }

    // Create unique merchantOrderId for this payment attempt
    const merchantOrderId = `ORD-${orderId}-${uuidv4().slice(0, 8)}`;

    // ✅ Save mapping in Order (so webhook/callback can map)
    // NOTE: merchantOrderId is @unique in schema, so each new attempt overwrites old one for same order (good)
    await prisma.order.update({
      where: { id: Number(orderId) },
      data: { merchantOrderId },
    });

    // ✅ Callback should be frontend (UX only). Webhook is source-of-truth.
    const callbackUrl = `${process.env.FRONTEND_URL}/payment-success`;

    // ✅ Create Razorpay Payment Link
    const link = await razorpay.paymentLink.create({
      amount: amountInPaise,
      currency: "INR",
      description: `Payment for Order #${orderId}`,
      customer: {
        name: order.patient?.fullName || "Customer",
        contact: contactNo,
      },
      notify: { sms: true, email: false },
      reminder_enable: true,
      callback_url: callbackUrl,
      callback_method: "get",
      notes: {
        orderId: String(orderId),
        patientId: String(patientId),
        merchantOrderId,
      },
    });

    // ✅ Send WhatsApp payment link
    const tpl = WHATSAPP_TEMPLATES.payment_link;
    const variables = tpl.mapVariables({
      customerName: order.patient?.fullName || "Customer",
      amount: amountInRupees,
      bookingId: orderId,
      paymentLink: link.short_url,
      supportContact: process.env.SUPPORT_PHONE || "1800-000-000",
    });

    await WhatsAppMessage({
      phone: contactNo,
      templateId: tpl.templateId,
      message: tpl.message,
      variables,
    });

    return res.json({
      success: true,
      paymentLink: link.short_url,
      gatewayLinkId: link.id,
      transactionId: merchantOrderId,
    });
  } catch (err) {
    console.error("Create Razorpay Payment Link Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** -----------------------------
 * 2) Webhook (SOURCE OF TRUTH)
 * IMPORTANT:
 * - Route must be mounted with express.raw({ type: "application/json" })
 * - req.body here is Buffer (raw body)
------------------------------ */
export const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.body; // Buffer

    console.log("rawBody",rawBody,signature)

    if (!signature || !rawBody) {
      return res.status(400).send("Missing signature/body");
    }

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const event = payload?.event;

    console.log("event",event)

    // (Optional) log every webhook payload
    // await prisma.paymentWebhookLog.create({ data: { event: event || "unknown", payload, status: "RECEIVED" } });

    if (event === "payment_link.paid") {
      const linkEntity = payload?.payload?.payment_link?.entity;
      const paymentEntity = payload?.payload?.payment?.entity;

      const notes = linkEntity?.notes || {};
      const orderId = Number(notes.orderId);
      const patientId = Number(notes.patientId);
      const merchantOrderId = notes.merchantOrderId;

      if (!orderId || !patientId) {
        return res.json({ ok: true }); // ignore un-mapped payload
      }

      const paymentId = paymentEntity?.id || linkEntity?.id; // must be unique in Payment table
      const amount = Number(paymentEntity?.amount || linkEntity?.amount || 0) / 100;
      const currency = (paymentEntity?.currency || "INR").toUpperCase();
      const paymentMethod = mapRazorpayMethodToEnum(paymentEntity?.method);

      // ✅ Idempotency: don't insert twice
      const exists = await prisma.payment.findUnique({ where: { paymentId } });
      if (!exists) {
        await prisma.$transaction(async (tx) => {
          // Create payment row
          await tx.payment.create({
            data: {
              paymentId,
              amount,
              currency,
              paymentMode: "ONLINE",
              paymentMethod,
              paymentStatus: "COMPLETED",
              referenceId: merchantOrderId || null,
              gatewayResponse: payload,
              order: { connect: { id: orderId } },
              patient: { connect: { id: patientId } },
            },
          });

          // Update order status
          await tx.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: "paid", // your Order.paymentStatus is string
              paymentMode: "ONLINE",
              merchantOrderId: merchantOrderId || undefined, // keep mapping
            },
          });
        });
      }
    }

    // You can also handle failed/cancelled:
    // payment_link.cancelled, payment.failed, etc. based on enabled events.

    return res.json({ ok: true });
  } catch (err) {
    console.error("Razorpay Webhook Error:", err);
    return res.status(500).json({ ok: false });
  }
};

/** -----------------------------
 * 3) Status API for /payment-processing page
 * Frontend polls this by merchantOrderId
------------------------------ */
export const getPaymentStatusByMerchantOrderId = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { merchantOrderId },
      select: {
        id: true,
        paymentStatus: true,
        paymentMode: true,
        updatedAt: true,
      },
    });

    if (!order) return res.status(404).json({ success: false, message: "Not found" });

    return res.json({
      success: true,
      orderId: order.id,
      paymentStatus: order.paymentStatus,
      paymentMode: order.paymentMode,
      updatedAt: order.updatedAt,
    });
  } catch (err) {
    console.error("Get Payment Status Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const createOrder =async (req, res) => {
  try {
    const { amountPaise, receipt, notes } = req.body;

    if (!amountPaise || !receipt) {
      return res.status(400).json({ message: "amountPaise and receipt required" });
    }

    const order = await razorpay.orders.create({
      amount: Number(amountPaise),
      currency: "INR",
      receipt: String(receipt),
      notes: notes || {},
    });

    return res.status(200).json({
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    });
  } catch (e) {
    console.error("Razorpay create-order error:", e);
    return res.status(500).json({ message: "create-order failed", error: e?.message });
  }
}



export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

   

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment verification fields" });
    }

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

      console.log("expected",expected)
      console.log("razorpay_signature",razorpay_signature)


    const isValid = expected === razorpay_signature;

   

    if (!isValid) {
      return res.status(400).json({ message: "Signature verification failed" });
    }

    return res.json({ message: "Payment verified", isValid: true });
  } catch (e) {
    return res.status(500).json({ message: "verifyPayment failed", error: e.message });
  }
};