import express from "express";
import {
  loginOrRegister,
  resendOtp,
  verifyOtp,
  updateProfile,
  logout,
  updateStatus,
  addFamilyMember,
  getFamilyMembers,
  updateFamilyMember,
  deleteFamilyMember,
  getAllPatients,
  getPatientById,
  createPatient,
  getPatientByMobile
} from "./patient.controller.js";

const router = express.Router();

// Auth
router.post("/login", loginOrRegister);
router.post("/resend-otp", resendOtp);
router.post("/verify-otp", verifyOtp);
router.get("/by-mobile", getPatientByMobile);


router.post("/", createPatient);

router.get("/", getAllPatients);
// Profile
router.get("/:id", getPatientById); 
router.put("/:id", updateProfile);
router.post("/:id/logout", logout);
router.patch("/:id/status", updateStatus);

// Family Hub
router.post("/:primaryId/family", addFamilyMember);
router.get("/:primaryId/family", getFamilyMembers);
router.put("/family/:memberId", updateFamilyMember);
router.delete("/family/:memberId", deleteFamilyMember);

export default router;
