import express from "express";
import multer from "multer";
import {
  addHealthPackage,
  getAllHealthPackages,
  getHealthPackageById,
  updateHealthPackage,
  deleteHealthPackage,
  restoreHealthPackage,
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

router.post("/:id/restore", authenticateUser, restoreHealthPackage);
router.get("/:id", getHealthPackageById);
router.put("/:id", upload.single("image"), updateHealthPackage);
// DELETE archives the package (soft delete). Hard delete only with ?force=true and zero order references.
router.delete("/:id", authenticateUser, deleteHealthPackage);

export default router;
