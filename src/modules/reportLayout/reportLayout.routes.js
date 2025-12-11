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

router.get("/", getLayouts);

router.post(
  "/",
  upload.fields([{ name: "headerImg" }, { name: "footerImg" }]),
  createLayout
);

router.put(
  "/:id",
  upload.fields([{ name: "headerImg" }, { name: "footerImg" }]),
  updateLayout
);

router.delete("/:id", deleteLayout);

export default router;
