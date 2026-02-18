import express from "express";
import { TestReportItemController } from "./testReportItems.controller.js";

const router = express.Router();

// list items for a test
router.get("/list/:testId", TestReportItemController.listByTest);

// create heading/notes/richtext item
router.post("/:testId", TestReportItemController.create);

// update item (title/text/html/sortOrder)
router.put("/:itemId", TestReportItemController.update);

// delete item
router.delete("/:itemId", TestReportItemController.remove);

// reorder items
router.put("/reorder/:testId", TestReportItemController.reorder);

export default router;
