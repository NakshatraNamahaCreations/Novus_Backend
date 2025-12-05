import express from "express";
import multer from "multer";
import {
  upsertVendorProfile,
  getVendorProfile,
  deleteVendorProfile,
  updateVendorProfile,
} from "./vendorProfile.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// CREATE or UPSERT
router.post("/:vendorId", upload.single("photo"), upsertVendorProfile);

// ✅ UPDATE Profile only (must exist)
router.put("/:vendorId", upload.single("photo"), updateVendorProfile);

// GET Profile
router.get("/:vendorId", getVendorProfile);

// DELETE Profile
router.delete("/:vendorId", deleteVendorProfile);

export default router;
