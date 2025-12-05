import express from "express";
import {
  createCenter,
  getAllCenters,
  getCenterById,
  updateCenter,
  deleteCenter,
  getNearbyCenters,
  loginCenter,
  logoutCenter
} from "./center.controller.js";

const router = express.Router();


router.get("/nearby", getNearbyCenters);

router.post("/login", loginCenter);
router.post("/logout", logoutCenter);
// CREATE
router.post("/", createCenter);

// READ ALL
router.get("/", getAllCenters);


// READ ONE
router.get("/:id", getCenterById);

// UPDATE
router.put("/:id", updateCenter);

// DELETE
router.delete("/:id", deleteCenter);

export default router;
