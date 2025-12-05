const { PrismaClient } = require('@prisma/client');
const geolib = require('geolib');
const axios = require('axios');

const prisma = new PrismaClient();

class LocationService {
  constructor() {
    this.activeConnections = new Map();
  }

  // Helper: Get road distance and ETA using Google Maps Directions API
  async getRoadMetrics(vendorLocation, userLocation) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY; // store securely
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${vendorLocation.latitude},${vendorLocation.longitude}&destination=${userLocation.latitude},${userLocation.longitude}&key=${apiKey}`;

    const response = await axios.get(url);
    const route = response.data.routes[0];
    if (!route) return null;

    const distance = route.legs[0].distance.value; // meters
    const duration = route.legs[0].duration.value; // seconds

    return { distance, duration };
  }

  // Start tracking for an order
  async startOrderTracking(orderId, vendorId, userLatitude, userLongitude) {
    try {
      const orderIdNumber = Number(orderId);

      const tracking = await prisma.orderTracking.upsert({
        where: { orderId: orderIdNumber },
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
          orderId: orderIdNumber,
          vendorId,
          userLatitude,
          userLongitude,
          isActive: true,
        }
      });

      await prisma.order.update({
        where: { id: orderIdNumber },
        data: { status: 'ON_THE_WAY' }
      });

      await prisma.vendor.update({
        where: { id: vendorId },
        data: { isOnline: true }
      });

      return tracking;
    } catch (error) {
      throw new Error(`Failed to start order tracking: ${error.message}`);
    }
  }

  // Update vendor location
  async updateVendorLocation(vendorId, latitude, longitude, orderId = null) {
    try {
      // Store vendor location history
      await prisma.vendorLocation.create({
        data: { vendorId, latitude, longitude }
      });

      // Update order tracking if applicable
      if (orderId) {
        const tracking = await prisma.orderTracking.findUnique({ where: { orderId } });

        if (tracking && tracking.isActive) {
          const vendorPath = tracking.vendorPath || [];
          vendorPath.push({ latitude, longitude, timestamp: new Date() });

          await prisma.orderTracking.update({
            where: { orderId },
            data: {
              vendorLatitude: latitude,
              vendorLongitude: longitude,
              vendorPath
            }
          });

          // Calculate and return progress metrics
          return await this.calculateProgressMetrics(orderId);
        }
      }

      return null;
    } catch (error) {
      throw new Error(`Failed to update vendor location: ${error.message}`);
    }
  }

  // Calculate progress metrics
  async calculateProgressMetrics(orderId) {
    const tracking = await prisma.orderTracking.findUnique({
      where: { orderId },
      include: { order: true }
    });

    if (!tracking || !tracking.vendorLatitude) return null;

    const vendorLocation = { latitude: tracking.vendorLatitude, longitude: tracking.vendorLongitude };
    const userLocation = { latitude: tracking.userLatitude, longitude: tracking.userLongitude };

    const roadMetrics = await this.getRoadMetrics(vendorLocation, userLocation);
    if (!roadMetrics) return null;

    let { distance, duration } = roadMetrics;

    let initialDistance = distance;
    if (tracking.vendorPath && tracking.vendorPath.length > 0) {
      const firstLocation = tracking.vendorPath[0];
      const initialRoute = await this.getRoadMetrics(firstLocation, userLocation);
      if (initialRoute) initialDistance = initialRoute.distance;
    }

    const progress = Math.max(0, ((initialDistance - distance) / initialDistance) * 100);

    return {
      distanceRemaining: distance,
      progress: Math.min(100, progress),
      eta: Math.ceil(duration / 60), // minutes
      vendorLocation,
      userLocation
    };
  }

  // Complete order tracking and remove data
  async completeOrderTracking(orderId) {
    try {
      const tracking = await prisma.orderTracking.findUnique({ where: { orderId } });
      if (!tracking) throw new Error("Order tracking not found");

      const vendorId = tracking.vendorId;

      await prisma.orderTracking.delete({ where: { orderId } });
      await prisma.vendorLocation.deleteMany({ where: { vendorId } });

      await prisma.order.update({ where: { id: orderId }, data: { status: "DELIVERED" } });

      return true;
    } catch (error) {
      throw new Error(`Failed to complete order tracking: ${error.message}`);
    }
  }

  async getOrderTracking(orderId) {
    try {
      const tracking = await prisma.orderTracking.findUnique({
        where: { orderId },
        include: {
          order: {
            include: {
              vendor: { include: { vendorProfile: true } },
              address: true,
              user: true
            }
          }
        }
      });

      if (!tracking) return null;

      const metrics = await this.calculateProgressMetrics(orderId);
      return { ...tracking, metrics };
    } catch (error) {
      throw new Error(`Failed to get order tracking: ${error.message}`);
    }
  }

  async getVendorActiveDeliveries(vendorId) {
    try {
      const activeOrders = await prisma.order.findMany({
        where: { vendorId, status: 'ON_THE_WAY' },
        include: { orderTracking: true, address: true, user: true }
      });

      return activeOrders;
    } catch (error) {
      throw new Error(`Failed to get active deliveries: ${error.message}`);
    }
  }
}

module.exports = new LocationService();
