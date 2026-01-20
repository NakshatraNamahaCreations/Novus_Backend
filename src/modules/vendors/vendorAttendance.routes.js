import { Router } from "express";
import {
  vendorCheckIn,
  vendorMonthlyAttendance,
  vendorTodayAttendance, // optional (remove if you didn't create it)
  adminVendorMonthlyAttendance
} from "./vendorAttendance.controller.js";

import { vendorAuth } from "../../middlewares/vendorAuth.js";
import multer from "multer";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // ✅ 5MB max
  fileFilter: (req, file, cb) => {
    // ✅ allow only images
    if (!file.mimetype?.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
  },
});

// ✅ check-in with selfie
router.post("/checkin", vendorAuth, upload.single("selfie"), vendorCheckIn);

// ✅ monthly count for logged-in vendor
router.get("/monthly", vendorAuth, vendorMonthlyAttendance);
// Admin: monthly attendance for a vendor
router.get("/:vendorId/attendance/monthly", adminVendorMonthlyAttendance);

// ✅ optional: get today's attendance (remove if not needed)
router.get("/today", vendorAuth, vendorTodayAttendance);

export default router;
