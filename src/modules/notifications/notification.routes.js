
import express from 'express';
import {
  getAllNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  deleteNotification,
  sendNotificationNow,
  duplicateNotification,
  getNotificationStats,
  resendNotification
} from './notification.controller.js';

const router = express.Router();

// GET /api/notifications - Get all notifications with filters
router.get('/', getAllNotifications);

// GET /api/notifications/stats - Get notification statistics
router.get('/stats', getNotificationStats);

// GET /api/notifications/:id - Get single notification
router.get('/:id', getNotificationById);

// POST /api/notifications - Create new notification
router.post('/', createNotification);

// PUT /api/notifications/:id - Update notification
router.put('/:id', updateNotification);

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', deleteNotification);

// POST /api/notifications/:id/send - Send notification immediately
router.post('/:id/send', sendNotificationNow);

// POST /api/notifications/:id/duplicate - Duplicate notification
router.post('/:id/duplicate', duplicateNotification);
router.post('/:id/resend', resendNotification);

export default router;