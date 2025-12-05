import { PrismaClient } from "@prisma/client";
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// optional helper to verify token and set role
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export const registerVendorSocketHandlers = (io, socket) => {
  // If client passed token in query
  const token = socket.handshake.query?.token ?? socket.handshake.auth?.token;
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    // allow anonymous but restrict some events. If you require auth, disconnect
    console.log('Socket connected without valid token, limited access', socket.id);
  } else {
    socket.data.userId = payload.userId;
    socket.data.role = payload.role;
    console.log('Socket authed', payload);
    if (payload.role === 'vendor') {
      socket.join(`vendor_${payload.userId}`);
      // You may also join order rooms here
    }
  }

  // Vendor sends location update
  // Expect: { vendorId, latitude, longitude, accuracy?, speed?, heading?, orderId? }
  socket.on('vendor:location:update', async (loc) => {
    try {
      // simple validation
      const { vendorId, latitude, longitude, accuracy, speed, heading, orderId } = loc ?? {};
      if (!vendorId || typeof latitude !== 'number' || typeof longitude !== 'number') return;

      // Broadcast to watchers in the vendor room
      io.to(`vendor_${vendorId}`).emit('vendor:live:location', {
        vendorId, latitude, longitude, accuracy, speed, heading, orderId, recordedAt: new Date().toISOString()
      });

      // Upsert current location (single row)
      await prisma.vendorCurrentLocation.upsert({
        where: { vendorId },
        update: { latitude, longitude, accuracy, speed, heading, updatedAt: new Date() },
        create: { vendorId, latitude, longitude, accuracy, speed, heading }
      });

      // Optionally append to short term history if you need route for current order
      // For performance keep history writes conditional (e.g. only when order active)
      if (orderId) {
        await prisma.vendorLocationHistory.create({
          data: { vendorId, latitude, longitude, accuracy, speed, heading }
        });
      }

    } catch (err) {
      console.error('vendor:location:update error', err);
    }
  });

  // customer wants to follow a vendor
  socket.on('join:vendor', ({ vendorId }) => {
    if (!vendorId) return;
    socket.join(`vendor_${vendorId}`);
    console.log(`Socket ${socket.id} joined vendor_${vendorId}`);
  });

  // optional disconnect handler
  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
};
