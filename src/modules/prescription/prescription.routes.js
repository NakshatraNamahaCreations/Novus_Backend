import express from "express";
import multer from "multer";
import {
  uploadPrescription,
  getAllPrescriptions,
  getPrescriptionById,
  reviewPrescription,
  deletePrescription,
  getPrescriptionsByPatientId
} from "./prescription.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Patient uploads a prescription (image/pdf)
router.post("/", upload.single("file"), uploadPrescription);

// Admin or doctor reviews (approve/reject)
router.put("/review/:id", reviewPrescription);
router.get("/patient/:patientId", getPrescriptionsByPatientId);

// Get all prescriptions
router.get("/", getAllPrescriptions);

// Get single prescription
router.get("/:id", getPrescriptionById);

// Delete prescription (optional)
router.delete("/:id", deletePrescription);

export default router;
