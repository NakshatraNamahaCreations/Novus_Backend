import express from "express";
import { TestTemplateController } from "./testTemplate.controller.js";

const router = express.Router();

// Ensure template exists for a test
router.post("/ensure/:testId", TestTemplateController.ensureTemplate);

// Create a new block (New Test Heading, Notes, Rich Text, Table, etc.)
router.post("/blocks/:testId", TestTemplateController.createBlock);

// Update block (Edit)
router.put("/blocks/:blockId", TestTemplateController.updateBlock);

// Delete block
router.delete("/blocks/:blockId", TestTemplateController.deleteBlock);

// List blocks by test (optionally gender)
router.get("/blocks/list/:testId", TestTemplateController.listBlocksByTest);

// Reorder blocks (change position)
router.put("/blocks/reorder/:testId", TestTemplateController.reorderBlocks);

export default router;
