import express from "express";
import { StandardCheckoutPayRequest, MetaInfo } from "pg-sdk-node";
import phonepeClient from "../../config/phonepeClient.js";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const router = express.Router();
const prisma = new PrismaClient();

router.post("/initiate", async (req, res) => {
  try {
    const { amount, userId } = req.body;

    if (!amount || !userId) {
      return res.status(400).json({ success: false, message: "Amount and userId required" });
    }

    const merchantOrderId = randomUUID();
    const amountInPaise = Math.round(amount * 100);

  
    const metaInfo = MetaInfo.builder()
      .udf1(String(userId))
      .build();

    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(amountInPaise)
      .redirectUrl(`${process.env.PHONEPE_CALLBACK_URL}?orderId=${merchantOrderId}`)
      .metaInfo(metaInfo)
      .build();

    // ⭐ THIS is the correct function
    const response = await phonepeClient.pay(request);

    return res.json({
      success: true,
      redirectUrl: response.redirectUrl,
      orderId: merchantOrderId
    });

  } catch (error) {
    console.error("Payment Initiation Error:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.get("/callback", async (req, res) => {
    // 1. Extract the Merchant Order ID from the query string
    const { orderId } = req.query;
   

    if (!orderId) {
        // Redirect to a failure page if the order ID is missing or tampered with
        console.error("Callback Error: Missing merchantOrderId");
        return res.redirect("/payment-failed");
    }

    let finalStatus = "FAILED";


    try {
        // 2. Call the PhonePe Order Status API (This is the definitive check)
        const statusResponse = await phonepeClient.getOrderStatus(orderId);
        
        console.log(statusResponse,"statusResponse")
        // 3. Process the response
        if ( statusResponse.state === 'COMPLETED') {
            finalStatus = 'SUCCESS';
            // phonepeTxnId = statusResponse.transactionId;
        } else if (statusResponse.state === 'PAYMENT_PENDING' || statusResponse.state === 'FAILED') {
             // Let a webhook handle the final PENDING resolution, but update the state based on the current check
             finalStatus = statusResponse.state === 'PAYMENT_PENDING' ? 'PENDING' : 'FAILED';
            //  phonepeTxnId = statusResponse.transactionId;
        }

        
        
        // 5. Redirect the user to the appropriate frontend page
        if (finalStatus === 'SUCCESS') {

          console.log("sucesss")
            // Include orderId in redirect for frontend to display status
            return res.redirect(`/payment-success?orderId=${orderId}`);
        } else {
          console.log("failure")
            return res.redirect(`/payment-failed?orderId=${orderId}`);
        }

    } catch (error) {
        console.error(`Callback Processing Error for Order ${orderId}:`, error);

        // Fallback: Ensure the order is marked as FAILED if the status check itself fails
        await prisma.order.update({
            where: { merchantOrderId: orderId },
            data: { status: 'FAILED' },
        }).catch(e => console.error("Prisma Fallback Update Failed:", e)); // Log error if even the fallback fails

        return res.redirect(`/payment-failed?orderId=${orderId}`);
    }
});


export default router;
