import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from "cookie-parser";
import helmet from 'helmet';

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';




// Routes
import categoryRoutes from './modules/categories/category.routes.js';  
import subcategoryRoutes from './modules/subcategories/subcategory.routes.js';  
import patientRoutes from './modules/patients/patient.routes.js';  
import packagesRoutes from './modules/packages/package.routes.js';  
import spotlightRoutes from './modules/spotlight/spotlight.routes.js'; 
import bannersRoutes from './modules/banners/banner.routes.js';  
import vendorsRoutes from './modules/vendors/vendor.route.js'; 
import vendorProfileRoutes from './modules/vendors/vendorProfile.routes.js';  
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
import locationSocketHandler from './modules/location/location.socket.js';
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
import pgRoutes from "./modules/payments/pg.routes.js"
import pincodeRoutes from "./modules/pincode/pincode.routes.js";
import "./modules/notifications/notification.scheduler.js";

import redis from './config/redis.js';



dotenv.config();
const PORT = process.env.PORT || 3000;

const app = express();


/* -------------------------
   MIDDLEWARES
---------------------------- */
app.use(cookieParser());
app.use(express.json());
app.use(helmet());

app.use(
  cors({
    origin: [
      "http://localhost:4028",
      "https://novushealth.in",
      "https://api.novushealth.in",
      "https://admin.novushealth.in",
    ],
    credentials: true,
     methods: ["GET", "POST", "PUT", "DELETE","PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);


app.use(express.urlencoded({ extended: true }));


/* -------------------------
   ROUTES
---------------------------- */
app.use('/api/categories', categoryRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/tests', packagesRoutes);
app.use('/api/spotlight', spotlightRoutes);
app.use('/api/banners', bannersRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/vendor-profile', vendorProfileRoutes);
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
app.use("/api/pg", pgRoutes);
app.use("/api/pincodes", pincodeRoutes);





app.use("/api/parameters", parameterRoutes);
app.use("/api/ranges", rangeRoutes);
app.use("/api/options", optionRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/config/vendor-earnings", configRoutes);


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
