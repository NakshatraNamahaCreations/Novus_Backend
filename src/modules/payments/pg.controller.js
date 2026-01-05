import { PrismaClient } from "@prisma/client";
import phonepeClient from "../../config/phonepeClient.js";
import { StandardCheckoutPayRequest } from "pg-sdk-node";
import { v4 as uuidv4 } from "uuid";
import { WHATSAPP_TEMPLATES } from "../../templates/whatsapp.templates.js";
import { WhatsAppMessage } from "../../utils/whatsapp.js";

const prisma = new PrismaClient();

export const createPaymentLink = async (req, res) => {
  try {
    const { orderId, patientId } = req.query;

    if (!orderId || !patientId) {
      return res.status(400).json({ message: "orderId and patientId required" });
    }

    const order = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      include: { patient: true },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const amountInPaise = 100 * 100;
    const amountInRupees = amountInPaise / 100;

    const merchantOrderId = `ORD-${orderId}-${uuidv4().slice(0, 8)}`;

    const redirectUrl = `${process.env.BACKEND_URL}/api/pg/callback?orderId=${merchantOrderId}&patientId=${patientId}&refOrderId=${orderId}`;

    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(amountInPaise)
      .redirectUrl(redirectUrl)
      .build();

    const response = await phonepeClient.getClient().pay(request);

    // ✅ WhatsApp template + variables
    const tpl = WHATSAPP_TEMPLATES.payment_link;

    const variables = tpl.mapVariables({
      customerName: order.patient?.fullName || "Customer",
      amount: amountInRupees,
      bookingId: orderId,
      paymentLink: response.redirectUrl,
      supportContact: process.env.SUPPORT_PHONE || "1800-000-000",
    });

    await WhatsAppMessage({
      phone: `${order.patient?.contactNo}`,
      templateId: tpl.templateId,
      message: tpl.message,
      variables,
    });

    return res.json({
      success: true,
      paymentLink: response.redirectUrl,
      transactionId: merchantOrderId,
    });
  } catch (err) {
    console.error("Create Payment Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

  

// 🚀 Webhook callback from PhonePe
export const phonePeCallback = async (req, res) => {
  try {
    const { orderId, patientId, refOrderId } = req.query;

    console.log(req.query)

    if (!orderId || !patientId) {
      return res.status(400).send("Invalid callback params");
    }

    // ✅ VERIFY USING SDK
    const statusResp = await phonepeClient
      .getClient()
      .getOrderStatus(orderId);

      console.log("statusResp",statusResp)
    if (statusResp.state !== "COMPLETED") {
     
      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
    }
const phonePeMethod = statusResp.paymentDetails?.[0]?.paymentMode;



await prisma.payment.create({
  data: {
    amount: statusResp.amount / 100,
    paymentMode:"ONLINE",
    paymentId: refOrderId,
  
    paymentMethod: "NETBANKING",
 
    paymentStatus: statusResp.state,

    order: {
      connect: { id: Number(refOrderId) }
    },
    patient: {
      connect: { id: Number(patientId) }
    }
  }
});

   

    return res.redirect(`${process.env.FRONTEND_URL}/payment-success`);
  } catch (err) {
    console.error("Callback Error:", err);
    return res.status(500).send("Payment verification failed");
  }
};

// 🚀 Verify Payment Status
export const verifyPhonePePayment = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const link = await prisma.paymentLink.findUnique({
      where: { transactionId },
      include: { order: true }
    });

    if (!link) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    const response = await phonepeClient.checkPaymentStatus(transactionId);

    // Update local status
    await prisma.paymentLink.update({
      where: { transactionId },
      data: { 
        status: response.data.state,
        gatewayTransactionId: response.data.transactionId
      }
    });

    // If successful and not yet recorded
    if (response.data.state === "COMPLETED") {
      const existingPayment = await prisma.payment.findFirst({
        where: { transactionId: response.data.transactionId }
      });

      if (!existingPayment) {
        await prisma.payment.create({
          data: {
            orderId: link.orderId,
            amount: link.amount,
            paymentMode: "ONLINE",
            transactionId: response.data.transactionId,
            collectedBy: "PhonePe Gateway"
          }
        });
      }
    }

    return res.json({
      success: true,
      status: response.data.state,
      transactionId: response.data.transactionId,
      amount: link.amount
    });

  } catch (err) {
    console.error("Payment Verification Error:", err);
    return res.status(500).json({ 
      success: false,
      message: err.message || "Verification failed" 
    });
  }
};