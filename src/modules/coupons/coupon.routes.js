import express from "express";
import {
  createCoupon,
  getAllCoupons,
  getCouponByCode,
  applyCoupon,
  toggleCouponStatus,
  recordCouponUsage,
  getActiveCoupons
} from "./coupon.controller.js";

const router = express.Router();

router.post("/", createCoupon);                // Create new coupon
router.get("/", getAllCoupons);  
router.get("/active", getActiveCoupons);               // Get all coupons
router.get("/:code", getCouponByCode);         // Get coupon by code
router.post("/apply", applyCoupon);            // Validate & apply coupon
router.put("/:id/toggle", toggleCouponStatus); // Activate / deactivate
router.post("/usage", recordCouponUsage);      // Track coupon usage

export default router;
