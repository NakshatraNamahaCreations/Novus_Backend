import express from "express";
import multer from "multer";
import {
  addCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "./category.controller.js";

// Use memory storage → buffer is available in req.file
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.post("/", upload.single("image"), addCategory);       // CREATE
router.get("/", getAllCategories);                           // READ all
router.get("/:id", getCategoryById);                         // READ one
router.put("/:id", upload.single("image"), updateCategory);  // UPDATE
router.delete("/:id", deleteCategory);                       // DELETE

export default router;
