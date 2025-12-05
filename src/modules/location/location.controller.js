const locationService = require('./location.service');

class LocationController {
  // Start order tracking
  async startOrderTracking(req, res) {
    try {
      const { vendorId } = req.user;
      const { orderId, userLatitude, userLongitude } = req.body;

      if (!orderId || !userLatitude || !userLongitude) {
        return res.status(400).json({
          success: false,
          message: 'Order ID and user coordinates are required'
        });
      }

      const tracking = await locationService.startOrderTracking(
        orderId,
        vendorId,
        parseFloat(userLatitude),
        parseFloat(userLongitude)
      );

      // Emit socket event
      req.app.get('io').to(`order_${orderId}`).emit('trackingStarted', {
        orderId,
        vendorId,
        startTime: tracking.startTime
      });

      res.json({
        success: true,
        message: 'Order tracking started',
        data: tracking
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update vendor location
  async updateVendorLocation(req, res) {
    try {
      const { vendorId } = req.user;
      const { latitude, longitude, orderId } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude and longitude are required'
        });
      }

      const metrics = await locationService.updateVendorLocation(
        vendorId,
        parseFloat(latitude),
        parseFloat(longitude),
        orderId
      );

      const io = req.app.get('io');

      // Emit general vendor location update
      io.emit('vendorLocationUpdate', {
        vendorId,
        location: { latitude, longitude },
        timestamp: new Date()
      });

      // Emit order-specific updates
      if (orderId && metrics) {
        io.to(`order_${orderId}`).emit('locationUpdate', {
          orderId,
          vendorId,
          vendorLocation: { latitude, longitude },
          metrics,
          timestamp: new Date()
        });
      }

      res.json({
        success: true,
        message: 'Location updated successfully',
        data: metrics
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get order tracking
  async getOrderTracking(req, res) {
    try {
      const { orderId } = req.params;
      const tracking = await locationService.getOrderTracking(orderId);

      if (!tracking) {
        return res.status(404).json({
          success: false,
          message: 'Order tracking not found'
        });
      }

      res.json({
        success: true,
        data: tracking
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Complete order
  async completeOrder(req, res) {
    try {
      const { orderId } = req.body;
      await locationService.completeOrderTracking(orderId);

      req.app.get('io').to(`order_${orderId}`).emit('orderDelivered', { orderId });

      res.json({
        success: true,
        message: 'Order completed successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get vendor active deliveries
  async getVendorActiveDeliveries(req, res) {
    try {
      const { vendorId } = req.user;
      const deliveries = await locationService.getVendorActiveDeliveries(vendorId);

      res.json({
        success: true,
        data: deliveries
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new LocationController();