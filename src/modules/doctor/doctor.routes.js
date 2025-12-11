import express from "express";
import {
  createDoctor,
  getDoctors,
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  getDoctorsByPatientId
} from "./doctor.controller.js";

const router = express.Router();

router.post("/", createDoctor);
router.get("/patient/:patientId", getDoctorsByPatientId);

router.get("/", getDoctors);
router.get("/:id", getDoctorById);
router.put("/:id", updateDoctor);
router.delete("/:id", deleteDoctor);

export default router;
