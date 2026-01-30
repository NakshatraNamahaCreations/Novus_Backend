// src/modules/pg/razorpay.routes.js

import express from "express";
import {
  createRazorpayPaymentLink,
  verifyPayment,
  getPaymentStatusByMerchantOrderId,
  createOrder
} from "./razorpay.controller.js";

const router = express.Router();

// Create link
router.get("/razorpay/link", createRazorpayPaymentLink);
router.post("/razorpay/create-order", createOrder);

router.post("/razorpay/verify", verifyPayment);


// Status poll
router.get("/razorpay/status/:merchantOrderId", getPaymentStatusByMerchantOrderId);

export default router;
