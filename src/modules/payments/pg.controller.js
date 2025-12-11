import { PrismaClient } from "@prisma/client";
import phonepeClient from "../../config/phonepeClient.js";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();

export const createPaymentLink = async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { patient: true }
    });

    if (!order) return res.status(404).json({ message: "Order not found" });

    const balance = 100;

    const transactionId = `ORD-${orderId}-${uuidv4().split("-")[0]}`;

    const payload = {
      merchantId: process.env.PHONEPE_MERCHANT_ID,
      merchantTransactionId: transactionId,
      merchantUserId: `USER-${order.patient.id}`,
      amount: balance * 100,
      redirectUrl: `${process.env.FRONTEND_URL}/payment/status?txnId=${transactionId}`,
      redirectMode: "POST",
      callbackUrl: `${process.env.BASE_URL}/api/payments/pg/callback`,
      mobileNumber: order.patient.phone,
      paymentInstrument: { type: "PAY_PAGE" }
    };

    const response = await phonepeClient.createPayment(payload);

    return res.json({
      success: true,
      paymentLink: response.data.instrumentResponse.redirectInfo.url,
      transactionId
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
  

// 🚀 Webhook callback from PhonePe
export const phonePeCallback = async (req, res) => {
  try {
    const xVerify = req.headers["x-verify"];
    const responseBody = req.body;

    console.log("PhonePe CALLBACK:", responseBody);

    // Verify callback authenticity
    if (!phonepeClient.verifyCallback(xVerify, responseBody)) {
      console.error("Invalid callback checksum");
      return res.status(400).json({ message: "Invalid checksum" });
    }

    // Decode the base64 response
    const decodedResponse = JSON.parse(
      Buffer.from(responseBody.response, "base64").toString("utf-8")
    );

    const { merchantTransactionId, transactionId, amount, state } = decodedResponse;

    const link = await prisma.paymentLink.findUnique({
      where: { transactionId: merchantTransactionId }
    });

    if (!link) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // Update link status
    await prisma.paymentLink.update({
      where: { transactionId: merchantTransactionId },
      data: { 
        status: state,
        gatewayTransactionId: transactionId
      }
    });

    if (state === "COMPLETED") {
      // Check if payment already recorded
      const existingPayment = await prisma.payment.findFirst({
        where: { transactionId }
      });

      if (!existingPayment) {
        // Insert final payment record
        await prisma.payment.create({
          data: {
            orderId: link.orderId,
            amount: link.amount,
            paymentMode: "ONLINE",
            transactionId,
            collectedBy: "PhonePe Gateway"
          }
        });
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("PhonePe Webhook Error:", err);
    return res.status(500).json({ message: "Callback failed" });
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