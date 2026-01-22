const { PrismaClient } = require("@prisma/client");
const axios = require("axios");

const prisma = new PrismaClient();

class LocationService {
  // -----------------------------
  // GOOGLE MAPS DISTANCE + ETA
  // -----------------------------
  async getRoadMetrics(from, to) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.latitude},${from.longitude}&destination=${to.latitude},${to.longitude}&key=${key}`;

    const res = await axios.get(url);
    const route = res.data.routes?.[0];


    if (!route) return null;

    return {
      distance: route.legs[0].distance.value, // meters
      duration: route.legs[0].duration.value, // seconds
    };
  }

  // -----------------------------
  // START ORDER TRACKING
  // -----------------------------
  async startOrderTracking(orderId, vendorId, userLatitude, userLongitude) {
    try {
      const tracking = await prisma.orderTracking.upsert({
        where: { orderId },
        update: {
          vendorId,
          userLatitude,
          userLongitude,
          isActive: true,
          startTime: new Date(),
          endTime: null,
          vendorLatitude: null,
          vendorLongitude: null,
          vendorPath: [],
        },
        create: {
          orderId,
          vendorId,
          userLatitude,
          userLongitude,
          isActive: true,
          startTime: new Date(),
          vendorPath: [],
        },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: { status: "ON_THE_WAY" },
      });

      return tracking;
    } catch (err) {
      throw new Error("Failed to start tracking: " + err.message);
    }
  }

  // -----------------------------
  // UPDATE VENDOR LOCATION
  // -----------------------------
  async updateVendorLocation(vendorId, latitude, longitude, orderId, io) {
    try {
      const tracking = await prisma.orderTracking.findUnique({
        where: { orderId },
      });

      console.log("tracking",tracking)

      if (!tracking || !tracking.isActive) return null;

      // ✅ 1. Save history (append-only)
      await prisma.vendorLocation.create({
        data: {
          vendorId,
          orderId,
          latitude,
          longitude,
        },
      });

      // ✅ 2. Update ONLY latest location
      await prisma.orderTracking.update({
        where: { orderId },
        data: {
          vendorLatitude: latitude,
          vendorLongitude: longitude,
        },
      });

      // ⏱ Throttle ETA (30 sec)
      let metrics = null;
      const now = Date.now();

      console.log("step1",new Date(tracking.lastEtaUpdate))
      console.log("now",now)


      if (now - new Date(tracking.lastEtaUpdate).getTime() > 30000) {
              console.log("step2")
        metrics = await this.calculateMetrics(orderId);
       
        await prisma.orderTracking.update({
          where: { orderId },
          data: { lastEtaUpdate: new Date() },
        });
      }

       metrics = await this.calculateMetrics(orderId);
       
        await prisma.orderTracking.update({
          where: { orderId },
          data: { lastEtaUpdate: new Date() },
        });

      // 📡 Socket update to customer
      io?.to(`order_${orderId}`).emit("vendorLocationUpdate", {
        orderId,
        vendorLocation: { latitude, longitude },
        metrics,
      });

      return metrics;
    } catch (err) {
      throw new Error("Location update failed: " + err.message);
    }
  }

  // -----------------------------
  // CALCULATE PROGRESS + ETA
  // -----------------------------
  async calculateMetrics(orderId) {
    const tracking = await prisma.orderTracking.findUnique({
      where: { orderId },
    });

    if (!tracking?.vendorLatitude) return null;

    const from = {
      latitude: tracking.vendorLatitude,
      longitude: tracking.vendorLongitude,
    };

    const to = {
      latitude: tracking.userLatitude,
      longitude: tracking.userLongitude,
    };




    const metrics = await this.getRoadMetrics(from, to);
    if (!metrics) return null;

    return {
      distanceRemaining: metrics.distance,
      eta: Math.ceil(metrics.duration / 60),
    };
  }

  // -----------------------------
  // COMPLETE JOB
  // -----------------------------
  async completeOrderTracking(orderId, io) {
    await prisma.orderTracking.update({
      where: { orderId },
      data: {
        isActive: false,
        endTime: new Date(),
      },
    });
    await prisma.vendorLocation.deleteMany({
      where: { orderId },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { status: "completed" },
    });

    io?.to(`order_${orderId}`).emit("trackingCompleted", { orderId });
  }
  async emitOrderStatus(io, orderId) {
    if (!io || !orderId) return;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });

    if (!order) return;

    io.to(`order_${orderId}`).emit("orderStatusUpdate", {
      orderId,
      status: order.status,
      timestamp: new Date(),
    });
  }
}

module.exports = new LocationService();
