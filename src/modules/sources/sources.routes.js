import { Router } from "express";
import {
  createSource,
  getCities,
  getSourceById,
  updateSource,
  deleteSource,
} from "./sources.controller.js";

const router = Router();

router.post("/", createSource);
router.get("/", getCities);
router.get("/:id", getSourceById);
router.put("/:id", updateSource);
router.delete("/:id", deleteSource);

export default router;
