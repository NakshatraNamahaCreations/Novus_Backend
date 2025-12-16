import locationService from "./location.service.js";

export default function locationSocket(io, socket) {
  console.log("Location socket active for:", socket.id);

  socket.on("joinOrderRoom", (orderId) => {
    console.log("joinOrderRoom",orderId)
    socket.join(`order_${orderId}`);
  });

  socket.on("startLocationSharing", async (data) => {
    const { orderId, vendorId, userLatitude, userLongitude } = data;

    try {
      await locationService.startOrderTracking(
        orderId,
        vendorId,
        userLatitude,
        userLongitude
      );

      socket.join(`order_${orderId}`);
      io.to(`order_${orderId}`).emit("trackingStarted", {
        orderId,
        vendorId,
      });
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("vendorLocationUpdate", async (data) => {
    const { vendorId, latitude, longitude, orderId } = data;

    try {
      const metrics = await locationService.updateVendorLocation(
        vendorId,
        latitude,
        longitude,
        orderId
      );

      if (orderId && metrics) {
        io.to(`order_${orderId}`).emit("locationUpdate", {
          orderId,
          vendorId,
          vendorLocation: { latitude, longitude },
          metrics,
        });
      }
    } catch (error) {
      socket.emit("error", { message: error.message });
    }
  });
}
