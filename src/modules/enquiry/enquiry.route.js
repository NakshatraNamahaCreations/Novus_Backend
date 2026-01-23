import { Router } from "express";
import {
  createEnquiry,
  getEnquiries,
  getEnquiryById,
  updateEnquiry,
  updateEnquiryStatus,
  deleteEnquiry,
} from "./enquiry.controller.js";

import { authenticateUser } from "../../middlewares/auth.js";

const router = Router();


router.get("/", getEnquiries);
router.get("/:id", getEnquiryById);
router.patch("/:id", updateEnquiry);
router.patch("/:id/status", updateEnquiryStatus);
router.delete("/:id", deleteEnquiry);
// protect all routes
router.use(authenticateUser);

router.post("/", createEnquiry);


export default router;
