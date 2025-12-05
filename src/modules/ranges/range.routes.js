import express from "express";
import { RangeController } from "./range.controller.js";

const router = express.Router();

router.post("/:parameterId", RangeController.addRange);
router.put("/update/:rangeId", RangeController.updateRange);
router.delete("/:rangeId", RangeController.deleteRange);
router.get("/list/:parameterId", RangeController.listRanges);

export default router;
