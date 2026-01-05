import express from "express";
import { 
  createPaymentLink, 
  phonePeCallback, 
  verifyPhonePePayment 
} from "./pg.controller.js";

const router = express.Router();

router.post("/generate-payment-link", createPaymentLink);
router.get("/callback", phonePeCallback);
router.get("/pg/verify/:transactionId", verifyPhonePePayment);

export default router;
