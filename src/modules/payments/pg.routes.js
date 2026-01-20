import express from "express";
import { 
  createPaymentLink, 
  phonePeCallback, 
  verifyPhonePePayment ,
  redirectapp,
  callackapp
} from "./pg.controller.js";

const router = express.Router();

router.post("/generate-payment-link", createPaymentLink);
router.post("/redirect", redirectapp);
router.post("/callback-app", callackapp);


router.get("/callback", phonePeCallback);
router.get("/pg/verify/:transactionId", verifyPhonePePayment);

export default router;
