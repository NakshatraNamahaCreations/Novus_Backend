import express from 'express';

import cors from 'cors';
import cookieParser from "cookie-parser";
import helmet from 'helmet';

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { razorpayWebhook } from "./modules/payments/razorpay.controller.js";
import categoryRoutes from './modules/categories/category.routes.js';  
import departmentRoutes from './modules/department/department.route.js';  

import subcategoryRoutes from './modules/subcategories/subcategory.routes.js';  
import patientRoutes from './modules/patients/patient.routes.js';  
import packagesRoutes from './modules/packages/package.routes.js';  
import spotlightRoutes from './modules/spotlight/spotlight.routes.js'; 
import bannersRoutes from './modules/banners/banner.routes.js';  
import vendorsRoutes from './modules/vendors/vendor.route.js'; 
import vendorProfileRoutes from './modules/vendors/vendorProfile.routes.js';  
import vvendorAttendanceRoutes from './modules/vendors/vendorAttendance.routes.js';  

import usersRoutes from './modules/users/user.routes.js';  
import centersRoutes from './modules/centers/center.routes.js'; 
import addressRoutes from './modules/address/address.routes.js';  
import orderRoutes from './modules/orders/order.routes.js';  
import couponsRoutes from './modules/coupons/coupon.routes.js';  
import checkupRoutes from "./modules/checkup/checkup.routes.js";
import prescriptionRoutes from "./modules/prescription/prescription.routes.js";
import kpiRoutes from "./modules/dashboard/dashboard.routes.js";
import paymentRoutes from "./modules/payments/payment.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import cartRoutes from "./modules/cart/cart.routes.js";
import doctorRoutes from "./modules/doctor/doctor.routes.js";
import slotRoutes from "./modules/slot/slot.routes.js";
// Socket handler
import reportsRoutes from './modules/report/reports.routes.js'
import parameterRoutes from "./modules/parameters/parameters.routes.js";
import resultRoutes from "./modules/results/results.routes.js";
import rangeRoutes from "./modules/ranges/range.routes.js";
import optionRoutes from "./modules/resultOptions/option.routes.js";
import configRoutes from "./modules/config/config.routes.js";
import cityRoutes from "./modules/city/city.routes.js";
import referenceCenterRoutes from "./modules/referenceCenter/reference.routes.js";
import diagnosticCenterRoutes from "./modules/diagnosticCenter/diagnosticCenter.routes.js";
import esignatureRoutes from "./modules/esignature/esignature.route.js";
import reportlayoutsRoutes from "./modules/reportLayout/reportLayout.routes.js"
import razorpayRoutes from "./modules/payments/razorpay.routes.js"

import pincodeRoutes from "./modules/pincode/pincode.routes.js";
import locationRoutes from "./modules/location/location.route.js";
import sourcesRoutes from "./modules/sources/sources.routes.js";
import collectionPriceRoutes from "./modules/collectionPrice/collectionPrice.routes.js";
import enquiryRoutes from "./modules/enquiry/enquiry.route.js";
import reportItemsRouter from "./modules/reportItems/testReportItems.routes.js"
import "./modules/notifications/notification.scheduler.js";
import redis from './config/redis.js';
import { errorHandler } from './middlewares/errorHandler.js';


const app = express();

// ✅ ADD THIS — trust Nginx reverse proxy
app.set('trust proxy', 1);

// ✅ FIRST — timeout protection for ALL routes including webhook
app.use((req, res, next) => {
  req.setTimeout(15000, () => {
    res.status(503).json({
      success: false,
      code: 'REQUEST_TIMEOUT',
      message: 'Server is busy, please try again.'
    });
  });
  next();
});

// ✅ SECOND — webhook needs raw body before json()
app.post("/api/pg/razorpay/webhook",
  express.raw({ type: "application/json" }),
  razorpayWebhook
);
/* -------------------------
   MIDDLEWARES
---------------------------- */
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(helmet());

app.use(
  cors({
    origin: [
      "http://localhost:4028",
      
      "https://novushealth.in",
      "https://api.novushealth.in",
      "https://newapi.novushealth.in",
      "https://admin.novushealth.in",
    ],
    credentials: true,
     methods: ["GET", "POST", "PUT", "DELETE","PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);





/* -------------------------
   ROUTES
---------------------------- */
app.use('/api/categories', categoryRoutes);
app.use('/api/departments', departmentRoutes);
app.use("/api/report-items", reportItemsRouter);

app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/tests', packagesRoutes);
app.use('/api/spotlights', spotlightRoutes);
app.use('/api/banners', bannersRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/vendor-profile', vendorProfileRoutes);

app.use('/api/vendor-attendance', vvendorAttendanceRoutes);
app.use('/api/reports', reportsRoutes);



app.use('/api/users', usersRoutes);
app.use('/api/centers', centersRoutes);
app.use('/api/address', addressRoutes);

app.use("/api/orders", orderRoutes);
app.use("/api/coupons", couponsRoutes);
app.use('/api/checkups', checkupRoutes);
app.use('/api/prescription', prescriptionRoutes);
app.use("/api/dashboard", kpiRoutes);
app.use("/api/payments", paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/carts', cartRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/slots", slotRoutes);

app.use('/api/cities', cityRoutes);
app.use("/api/reference-centers", referenceCenterRoutes);
app.use("/api/diagnostic-centers", diagnosticCenterRoutes);
app.use("/api/esignatures", esignatureRoutes);
app.use("/api/report-layouts", reportlayoutsRoutes);
app.use("/api/pg", razorpayRoutes);
app.use("/api/pincodes", pincodeRoutes);
app.use("/api/location",locationRoutes)
app.use("/api/source",sourcesRoutes)
app.use("/api/enquiry",enquiryRoutes)

app.use("/api/collection-prices", collectionPriceRoutes);






app.use("/api/parameters", parameterRoutes);
app.use("/api/ranges", rangeRoutes);
app.use("/api/options", optionRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/vendor-earning-config", configRoutes);

app.use(errorHandler);
// async function clearAllOrders() {
//   try {
//     const orderKeys = await redis.keys("order:*");
//     const rejectKeys = await redis.keys("rejected:*");

//     const all = [...orderKeys, ...rejectKeys];

//     if (all.length) {
//       await redis.del(all);
//       console.log(`🧹 Deleted ${all.length} Redis order keys`);
//     } else {
//       console.log("✔ No order keys found to delete");
//     }

//   } catch (err) {
//     console.error("clearAllOrders error:", err);
//   }
// }
// clearAllOrders()

export default app;
