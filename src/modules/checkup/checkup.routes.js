import express from "express";
import multer from "multer";
import {
  addHealthPackage,
  getAllHealthPackages,
  getHealthPackageById,
  updateHealthPackage,
  deleteHealthPackage,
  getHealthPackagesByCategory,
  getSpotlightHealthPackages
} from "./checkup.controller.js";
import { authenticateUser } from "../../middlewares/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/", upload.single("image"),authenticateUser, addHealthPackage);
router.get("/", getAllHealthPackages);
router.get("/spotlight", getSpotlightHealthPackages);

router.get("/category/:categoryId", getHealthPackagesByCategory);

router.get("/:id", getHealthPackageById);
router.put("/:id", upload.single("image"), updateHealthPackage);
router.delete("/:id", deleteHealthPackage);

export default router;
