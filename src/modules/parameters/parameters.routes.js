import express from "express";
import { ParameterController } from "./parameters.controller.js";

const router = express.Router();

router.post("/:testId", ParameterController.addParameter);
router.put("/:parameterId", ParameterController.updateParameter);
router.delete("/:parameterId", ParameterController.deleteParameter);
router.get("/list/:testId", ParameterController.listByTest);

export default router;
