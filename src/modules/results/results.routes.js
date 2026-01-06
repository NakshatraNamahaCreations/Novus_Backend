import express from "express";
import { ResultController } from "./results.controller.js";

const router = express.Router();

router.post("/", ResultController.create);
router.get("/find", ResultController.find);
router.get("/find-result", ResultController.find1);

router.put("/:id", ResultController.update);
router.get("/:id", ResultController.getById);
router.get("/:id/print", ResultController.print);
router.get("/:id/download", ResultController.download);
router.get("/:id/download-pdf", ResultController.downloadPdf);

router.get("/:id/html", ResultController.htmlReport);

export default router;
