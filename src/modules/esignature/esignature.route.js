import express from "express";
import multer from "multer";
import {
  createESignature,
  getAllESignatures,
  getESignatureById,
  updateESignature,
  deleteESignature
} from "./esignature.controller.js";

const router = express.Router();

// Multer for file upload
const upload = multer({ storage: multer.memoryStorage() });

// Routes
router.post("/", upload.single("signatureImg"), createESignature);
router.get("/", getAllESignatures);
router.get("/:id", getESignatureById);
router.put("/:id", upload.single("signatureImg"), updateESignature);
router.delete("/:id", deleteESignature);


export default router;
