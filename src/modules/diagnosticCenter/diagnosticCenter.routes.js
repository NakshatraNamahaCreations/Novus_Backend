import { Router } from "express";
import {
  createDiagnosticCenter,
  getDiagnosticCenters,
  getDiagnosticCenterById,
  updateDiagnosticCenter,
  deleteDiagnosticCenter
} from "./diagnosticCenter.controller.js";

const router = Router();

router.post("/", createDiagnosticCenter);
router.get("/", getDiagnosticCenters);
router.get("/:id", getDiagnosticCenterById);
router.put("/:id", updateDiagnosticCenter);
router.delete("/:id", deleteDiagnosticCenter);

export default router;
