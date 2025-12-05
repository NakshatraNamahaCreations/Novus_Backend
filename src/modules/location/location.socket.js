const locationService = require('./location.service');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join order room for tracking
    socket.on('joinOrderRoom', (orderId) => {
      socket.join(`order_${orderId}`);
      console.log(`User ${socket.id} joined order room: ${orderId}`);
    });

    // Vendor starts sharing location
    socket.on('startLocationSharing', async (data) => {
      const { orderId, vendorId, userLatitude, userLongitude } = data;
      
      try {
        await locationService.startOrderTracking(
          orderId, 
          vendorId, 
          userLatitude, 
          userLongitude
        );

        socket.join(`order_${orderId}`);
        io.to(`order_${orderId}`).emit('trackingStarted', { orderId, vendorId });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Vendor location update
    socket.on('vendorLocationUpdate', async (data) => {
      const { vendorId, latitude, longitude, orderId } = data;
      
      try {
        const metrics = await locationService.updateVendorLocation(
          vendorId,
          latitude,
          longitude,
          orderId
        );

        console.log("metrics",metrics)
        if (orderId && metrics) {
          io.to(`order_${orderId}`).emit('locationUpdate', {
            orderId,
            vendorId,
            vendorLocation: { latitude, longitude },
            metrics
          });
        }
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
};