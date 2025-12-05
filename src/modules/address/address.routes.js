import express from "express";
import {
  createAddress,
  getAllAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
  getAddressByPatientId,
} from "./address.controller.js";

const router = express.Router();

// CREATE
router.post("/", createAddress);

// READ ALL
router.get("/", getAllAddresses);

// READ SINGLE BY ID
router.get("/:id", getAddressById);

// READ ADDRESS BY PATIENT ID
router.get("/patient/:patientId", getAddressByPatientId);

// UPDATE
router.put("/:id", updateAddress);

// DELETE
router.delete("/:id", deleteAddress);

export default router;
