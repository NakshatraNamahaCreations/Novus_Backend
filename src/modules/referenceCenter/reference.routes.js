import { Router } from "express";
import {
  createReferenceCenter,
  getReferenceCenters,
  getReferenceCenterById,
  updateReferenceCenter,
  deleteReferenceCenter
} from "./reference.controller.js";

const router = Router();

router.post("/", createReferenceCenter);
router.get("/", getReferenceCenters);
router.get("/:id", getReferenceCenterById);
router.put("/:id", updateReferenceCenter);
router.delete("/:id", deleteReferenceCenter);

export default router;
