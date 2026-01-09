import express from "express";
import multer from "multer";
import {
  addCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,getPopularCategories
} from "./category.controller.js";

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

const categoryUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "banner", maxCount: 1 },
]);

router.post("/", categoryUpload, addCategory);
router.get("/", getAllCategories);
router.get("/popular", getPopularCategories);

router.get("/:id", getCategoryById);
router.put("/:id", categoryUpload, updateCategory);
router.delete("/:id", deleteCategory);

export default router;
