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
async updateVendorLocation(vendorId, latitude, longitude, orderId) {
  try {
    const tracking = await prisma.orderTracking.findUnique({
      where: { orderId },
      select: {
        orderId: true,
        isActive: true,
        lastEtaUpdate: true,
        lastMetrics: true, // ✅
      },
    });

    if (!tracking || !tracking.isActive) return null;

    await prisma.vendorLocation.create({
      data: { vendorId, orderId, latitude, longitude },
    });

    await prisma.orderTracking.update({
      where: { orderId },
      data: { vendorLatitude: latitude, vendorLongitude: longitude },
    });

    const now = Date.now();
    const last = tracking.lastEtaUpdate ? new Date(tracking.lastEtaUpdate).getTime() : 0;

    // ✅ THROTTLED: return last saved metrics (not null)
    if (now - last <= 30000) {
      return tracking.lastMetrics || {
        throttled: true,
        distanceRemaining: null,
        eta: null,
        calculatedAt: null,
      };
    }

    // ✅ CALCULATE fresh
    const fresh = await this.calculateMetrics(orderId);

    // keep old if google fails
    const metricsToSave = fresh
      ? { ...fresh, calculatedAt: new Date().toISOString() }
      : (tracking.lastMetrics || null);

    await prisma.orderTracking.update({
      where: { orderId },
      data: {
        lastEtaUpdate: new Date(),
        lastMetrics: metricsToSave, // ✅ store for next throttled calls
      },
    });

    return metricsToSave;
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
