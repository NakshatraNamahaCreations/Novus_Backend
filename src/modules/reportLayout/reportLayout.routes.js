import express from "express";
import multer from "multer";
import {
  createLayout,
  getLayouts,
  updateLayout,
  deleteLayout,
} from "./reportLayout.controller.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// GET single layout
router.get("/", getLayouts);

// CREATE (only once)
router.post(
  "/",
  upload.fields([
    { name: "headerImg", maxCount: 1 },
    { name: "footerImg", maxCount: 1 },
    { name: "frontPageLastImg", maxCount: 1 },
    { name: "lastPageImg", maxCount: 1 },
  ]),
  createLayout
);

// UPDATE single layout ✅ (NO :id)
router.put(
  "/",
  upload.fields([
    { name: "headerImg", maxCount: 1 },
    { name: "footerImg", maxCount: 1 },
    { name: "frontPageLastImg", maxCount: 1 },
    { name: "lastPageImg", maxCount: 1 },
  ]),
  updateLayout
);

// DELETE single layout ✅ (NO :id)
router.delete("/", deleteLayout);

export default router;
