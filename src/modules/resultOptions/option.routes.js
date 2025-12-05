import express from "express";
import { OptionController } from "./option.controller.js";

const router = express.Router();

router.post("/:parameterId", OptionController.add);
router.get("/list/:parameterId", OptionController.list);
router.delete("/:optionId", OptionController.delete);

export default router;
