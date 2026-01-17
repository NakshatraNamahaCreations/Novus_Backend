import express from "express";
import multer from "multer";
import {
  addSpotlight,
  getAllSpotlights,
  getSpotlightById,
  updateSpotlight,
  deleteSpotlight,
  getSpotlightsByShowIn,
} from "./spotlight.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("image"), addSpotlight);
router.get("/", getAllSpotlights); // optional ?showIn=HOME_MIDDLE
router.get("/:id", getSpotlightById);
router.put("/:id", upload.single("image"), updateSpotlight);
router.delete("/:id", deleteSpotlight);

router.get("/show-in/:place", getSpotlightsByShowIn);

export default router;
