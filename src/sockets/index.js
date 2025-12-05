import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import redis from "../config/redis.js";

import vendorSocket from "./vendor.socket.js";
import orderSocket from "./order.socket.js";

export default async function setupSockets(httpServer, app) {
  // Create pub/sub clients (redis adapter)
  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();

  await Promise.all([
    pubClient.connect(),
    subClient.connect()
  ]);

  const io = new Server(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e6
  });

  io.adapter(createAdapter(pubClient, subClient));

  // make io globally available
  app.set("io", io);

  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    vendorSocket(io, socket);
    orderSocket(io, socket);

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });

  return io;
}
