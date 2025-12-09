import express from "express";
import {
  registerVendor,
  loginVendor,
  logoutVendor,
  getAllVendors,
  getVendorById,
  getVendorsByCategory,
  updateVendor,
  deleteVendor,
  toggleBlockVendor,
  getVendorReviews,
  getEarningsHistory,
  addVendorReview,
  sendOtp,
  verifyOtp,
  addVendorEarning,
} from "./vendor.controller.js";

const router = express.Router();

// AUTH
router.post("/register", registerVendor);

router.post("/login", loginVendor);
router.post("/logout", logoutVendor);
// 📌 Send OTP
router.post("/send-otp", sendOtp);
router.post("/earnings", addVendorEarning);
router.post("/reviews", addVendorReview);

// 📌 Verify OTP & Login
router.post("/verify-otp", verifyOtp);

router.get("/earnings-history/:vendorId", getEarningsHistory);
router.get("/reviews/:vendorId", getVendorReviews);

// CRUD
router.get("/", getAllVendors);
router.get("/:id", getVendorById);
router.get("/category/:category", getVendorsByCategory);
router.put("/:id", updateVendor);
router.delete("/:id", deleteVendor);

// BLOCK / UNBLOCK
router.put("/block/:id", toggleBlockVendor);

export default router;
