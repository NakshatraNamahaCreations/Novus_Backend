import express from "express";
import { ResultController } from "./results.controller.js";

const router = express.Router();

router.post("/", ResultController.create);
router.get("/find", ResultController.find);
router.get("/:id", ResultController.getById);

router.get("/:id/html", ResultController.htmlReport);

export default router;
