import express from "express";
import { PrismaClient } from "@prisma/client";
import locationService from "./location.service.js";


const prisma = new PrismaClient();
const router = express.Router();


// GET /location/track/:orderId
router.get("/vendor-last-location/:orderId", async (req, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) {
      return res.status(400).json({ success: false, error: "Invalid orderId" });
    }

    // 1) active tracking first
    let tracking = await prisma.orderTracking.findFirst({
      where: {
        orderId,
        OR: [{ isActive: true }, { endTime: null }],
      },
      orderBy: { id: "desc" },
    });

    // 2) fallback: latest tracking row
    if (!tracking) {
      tracking = await prisma.orderTracking.findFirst({
        where: { orderId },
        orderBy: { id: "desc" },
      });
    }

    if (!tracking) {
      return res.status(404).json({ success: false, error: "Tracking not found" });
    }

    return res.json({ success: true, tracking });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: "Failed to fetch tracking" });
  }
});

router.post("/vendor/update", async (req, res) => {
  try {
    const { orderId, vendorId, latitude, longitude } = req.body;

    const oId = Number(orderId);
    const vId = Number(vendorId);
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!Number.isInteger(oId) || !Number.isInteger(vId) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: "Invalid orderId/vendorId/latitude/longitude" });
    }

    const io = req.app.get("io"); // make sure app.set("io", io) in server.js
    const metrics = await locationService.updateVendorLocation(vId, lat, lng, oId, io);

    return res.json({ success: true, metrics });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function generateLinearPath(start, end, steps = 30) {
  const points = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps; // start from 1 so first point is movement
    points.push({
      latitude: start.latitude + (end.latitude - start.latitude) * t,
      longitude: start.longitude + (end.longitude - start.longitude) * t,
    });
  }
  return points;
}

router.post("/vendor/simulate-30points", async (req, res) => {
  try {
    const { orderId, vendorId, start, end } = req.body;

    const oId = Number(orderId);
    const vId = Number(vendorId);

    if (!Number.isInteger(oId) || !Number.isInteger(vId)) {
      return res.status(400).json({ success: false, message: "Invalid orderId/vendorId" });
    }
    if (!start?.latitude || !start?.longitude || !end?.latitude || !end?.longitude) {
      return res.status(400).json({ success: false, message: "start/end latitude/longitude required" });
    }

    const startPoint = { latitude: Number(start.latitude), longitude: Number(start.longitude) };
    const endPoint = { latitude: Number(end.latitude), longitude: Number(end.longitude) };

    const io = req.app.get("io");

    // ✅ start tracking (set user coords as destination)
    await locationService.startOrderTracking(oId, vId, endPoint.latitude, endPoint.longitude);

    // ✅ prepare 30 points
    const points = generateLinearPath(startPoint, endPoint, 30);

    // ✅ run updates every 30 seconds in background
(async () => {
  let i = 0;

  for (const p of points) {
    i++;

    console.log(
      `[SIM] orderId=${oId} vendorId=${vId} point=${i}/${points.length} lat=${p.latitude} lng=${p.longitude} time=${new Date().toISOString()}`
    );

    await locationService.updateVendorLocation(vId, p.latitude, p.longitude, oId, io);

    await sleep(30000); // 30 sec
  }

  console.log(`[SIM] Completed simulation for orderId=${oId}`);
})();


    return res.json({
      success: true,
      message: "Simulation started: 30 points, 1 update per 30 seconds",
      orderId: oId,
      vendorId: vId,
      points: 30,
      intervalSeconds: 30,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: err.message });
  }
});


export default router;
