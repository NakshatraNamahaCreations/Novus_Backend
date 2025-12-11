import express from "express";
import { 
  createPaymentLink, 
  phonePeCallback, 
  verifyPhonePePayment 
} from "./pg.controller.js";

const router = express.Router();

router.post("/orders/:orderId/payment-link", createPaymentLink);
router.post("/pg/callback", phonePeCallback);
router.get("/pg/verify/:transactionId", verifyPhonePePayment);

export default router;
