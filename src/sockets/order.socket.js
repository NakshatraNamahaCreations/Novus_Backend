import redis from "../config/redis.js";


export default function orderSocket(io, socket) {

  // debug ping
  socket.on("ping", (msg) => socket.emit("pong", msg));

  // new order event
  socket.on("newOrderCreated", async (order) => {
   
    try {
      if (!order || !order.address) return;

      const { latitude, longitude, pincode } = order.address;

      // 1) Send to pincode room
      if (pincode) {
        io.to(`pin_${pincode}`).emit("orderForPincode", order);
      }

      // 2) Redis GEO search
      if (typeof latitude === "number" && typeof longitude === "number") {

        const RADIUS_KM = order.radiusKm || 5;

        const res = await redis.sendCommand([
          "GEORADIUS",
          "vendors:geo",
          String(longitude),
          String(latitude),
          String(RADIUS_KM),
          "km",
          "WITHDIST",
          "WITHCOORD"
        ]);

      
        if (Array.isArray(res) && res.length) {
          for (const item of res) {
            const vendorId = item[0];
            const distanceKm = parseFloat(item[1]);

            io.to(`vendor_${vendorId}`).emit("orderNearby", {
              order,
              distanceKm
            });
          }
        }
      }

    } catch (err) {
      console.error("newOrderCreated handler error", err);
    }
  });
}
