import redis from "../config/redis.js";

export default function orderSocket(io, socket) {

  socket.on("ping", (msg) => socket.emit("pong", msg));

  socket.on("vendorOnline", async ({ vendorId, pincode }) => {
    try {
      if (!vendorId || !pincode) return;

      const vendorIdStr = String(vendorId);
      const pincodeStr = String(pincode).trim();

      console.log("✔ VENDOR JOINED:", vendorIdStr, pincodeStr);

      socket.join(`vendor_${vendorIdStr}`);
      socket.join(`pin_${pincodeStr}`);

      const pendingOrderIds = await redis.sMembers(
        `orders:pending:pincode:${pincodeStr}`
      );

      console.log(pendingOrderIds, "pendingOrderIds");

      for (const orderId of pendingOrderIds) {

        const rejected = await redis.sIsMember(
          `rejected:${orderId}`,
          vendorIdStr
        );
        if (rejected) continue;

        const orderData = await redis.hGetAll(`order:${orderId}`);
        console.log("orderData",orderData)
        if (!Object.keys(orderData).length) continue;

        socket.emit("orderForPincode", {
          orderId: Number(orderData.orderId),
          slotId: orderData.slotId,
          date: orderData.date,
          status: orderData.status,
          testType: orderData.testType,
          pincode: orderData.pincode,
          latitude: Number(orderData.latitude),
          longitude: Number(orderData.longitude),
          isReplay: true
        });
      }

    } catch (err) {
      console.error("vendorOnline error", err);
    }
  });
}
