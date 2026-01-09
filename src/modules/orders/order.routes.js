import express from "express";
import multer from "multer";
import {
  createOrder,
  createAdminOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  updateDocumentImage,
  vendorStartJob,
  getOrdersByPatientId,
  getOrdersByPrimaryPatientId,
  getOrdersByVendor,
  rejectOrderByVendor,
  acceptOrderByVendor,
  vendorUpdateOrderStatus,
  getVendorOrdersBasic,
  updateAssignvendor,
  getOrderReports,
  getOrdersExpiringSoon,
  getOrderResultsById,
  getOrdersByPatientIdTrack,
  getOrdersByPatientIdCompleted
} from "./order.controller.js";
import locationService from "../location/location.service.js";
import { authenticateUser } from "../../middlewares/auth.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/* Existing routes */
router.post(
  "/",
  upload.fields([
   
    { name: "documentImage", maxCount: 1 },
  ]),
  createOrder
);
router.get("/", getAllOrders);
router.post("/create-admin",authenticateUser, createAdminOrder);
router.get("/order-reports", getOrderReports);
router.get("/expiring", getOrdersExpiringSoon);



router.get("/:id", getOrderById);
router.get("/:id/tests",   getOrderResultsById);

router.put("/:id/vendor-status", updateOrderStatus);
router.put("/:id/assign-vendor", updateAssignvendor);

router.put("/:id/cancel", cancelOrder);
router.post("/:orderId/start-job", vendorStartJob);
router.get("/by-patient/:patientId", getOrdersByPatientId);
router.get("/by-patient-track/:patientId", getOrdersByPatientIdTrack);
router.get("/by-patient-completed/:patientId", getOrdersByPatientIdCompleted);



router.get("/by-primary/:patientId", getOrdersByPrimaryPatientId);
router.get("/vendor/:vendorId/orders", getOrdersByVendor);
router.get("/vendor/:vendorId/orders/histroy", getVendorOrdersBasic);

router.post("/vendor/reject", rejectOrderByVendor);
router.post("/vendor/accept", acceptOrderByVendor);
router.patch("/vendor/status/:orderId", vendorUpdateOrderStatus);


router.post("/complete-order", async (req, res) => {
  const { orderId } = req.body;

  try {
    const tracking = await locationService.completeOrderTracking(orderId);

    // notify room members
    const io = req.app.get("io");
    io.to(`order_${orderId}`).emit("orderDelivered", { orderId });

    // Stop vendor from sending location updates
    io.socketsLeave(`order_${orderId}`);

    res.json({
      success: true,
      message: "Order completed & tracking cleared",
      tracking,
    });
  } catch (e) {
    console.log("eroore",e)
    res.status(500).json({ error: e.message });
  }
});



router.patch("/:id/document", upload.single("documentImage"), updateDocumentImage);

export default router;
