import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

import { sendPushNotification, sendWhatsAppMessage } from './notification.service.js';

export const getAllNotifications = async (req, res) => {
  try {
    let { page = 1, limit = 10, status = "", type = "", search = "" } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    const where = {};

    if (status && status !== "all") where.status = status;
    if (type && type !== "all") where.type = type;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { message: { contains: search, mode: "insensitive" } }
      ];
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              logs: { where: { status: "sent" } }
            }
          }
        }
      }),
      prisma.notification.count({ where })
    ]);

    const formatted = notifications.map(n => {
      const sent = n._count.logs;
      return {
        ...n,
        recipients: sent,
        openRate: sent > 0 ? Math.round((0 / sent) * 100) + "%" : "-",
      };
    });

    res.json({
      success: true,
      notifications: formatted,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        perPage: limit,
      }
    });

  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message
    });
  }
};


export const getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id: parseInt(id) },
      include: {
        logs: {
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                contactNo: true
              }
            }
          },
          orderBy: { sentAt: 'desc' },
          take: 50 // Limit logs for performance
        }
      }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found"
      });
    }

    res.json({
      success: true,
      notification
    });

  } catch (error) {
    console.error("Error fetching notification:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch notification details" 
    });
  }
};

export const createNotification = async (req, res) => {
  try {
    const {
      title,
      message,
      type,
      audience,
      selectedPatients = [],
      schedule = false,
      scheduledAt,
      imageUrl,
      deepLink
    } = req.body;

    // Validation
    if (!title || !message || !type || !audience) {
      return res.status(400).json({
        success: false,
        error: "Title, message, type, and audience are required"
      });
    }

    if (type === 'whatsapp' && message.length > 1000) {
      return res.status(400).json({
        success: false,
        error: "WhatsApp messages cannot exceed 1000 characters"
      });
    }

    if (type === 'push' && message.length > 240) {
      return res.status(400).json({
        success: false,
        error: "Push notifications cannot exceed 240 characters"
      });
    }

    if (audience === 'selected_patients' && (!selectedPatients || selectedPatients.length === 0)) {
      return res.status(400).json({
        success: false,
        error: "Please select at least one patient"
      });
    }

    // Create notification
    const notification = await prisma.notification.create({
      data: {
        title,
        message,
        type,
        audience,
        selectedPatients: audience === 'selected_patients' ? selectedPatients : null,
        status: schedule ? 'scheduled' : 'draft',
        scheduledAt: schedule && scheduledAt ? new Date(scheduledAt) : null,
        imageUrl: imageUrl || null,
        deepLink: deepLink || null
      }
    });

    // If not scheduled, send immediately
    if (!schedule) {
      await sendNotificationImmediately(notification);
    }

    res.status(201).json({
      success: true,
      message: schedule ? "Notification scheduled successfully" : "Notification sent successfully",
      notification
    });

  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to create notification",
      message: error.message 
    });
  }
};

export const updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if notification exists
    const existingNotification = await prisma.notification.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingNotification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found"
      });
    }

    // Don't allow updates to sent notifications
    if (existingNotification.status === 'sent') {
      return res.status(400).json({
        success: false,
        error: "Cannot update already sent notifications"
      });
    }

    const notification = await prisma.notification.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({
      success: true,
      message: "Notification updated successfully",
      notification
    });

  } catch (error) {
    console.error("Error updating notification:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to update notification" 
    });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if notification exists
    const existingNotification = await prisma.notification.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingNotification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found"
      });
    }

    await prisma.notification.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: "Notification deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to delete notification" 
    });
  }
};

export const sendNotificationNow = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id: parseInt(id) }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found"
      });
    }

    if (notification.status === 'sent') {
      return res.status(400).json({
        success: false,
        error: "Notification is already sent"
      });
    }

    // Send notification immediately
    await sendNotificationImmediately(notification);

    // Update notification status
    const updatedNotification = await prisma.notification.update({
      where: { id: parseInt(id) },
      data: {
        status: 'sent',
        sentAt: new Date()
      }
    });

    res.json({
      success: true,
      message: "Notification sent successfully",
      notification: updatedNotification
    });

  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to send notification" 
    });
  }
};

export const duplicateNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const originalNotification = await prisma.notification.findUnique({
      where: { id: parseInt(id) }
    });

    if (!originalNotification) {
      return res.status(404).json({
        success: false,
        error: "Original notification not found"
      });
    }

    // Create a duplicate with draft status
    const { id: originalId, createdAt, updatedAt, sentAt, ...duplicateData } = originalNotification;
    
    const duplicateNotification = await prisma.notification.create({
      data: {
        ...duplicateData,
        title: `${duplicateData.title} (Copy)`,
        status: 'draft',
        scheduledAt: null,
        sentAt: null,
        recipients: 0,
        openCount: 0,
        clickCount: 0,
        failureCount: 0
      }
    });

    res.status(201).json({
      success: true,
      message: "Notification duplicated successfully",
      notification: duplicateNotification
    });

  } catch (error) {
    console.error("Error duplicating notification:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to duplicate notification" 
    });
  }
};

export const getNotificationStats = async (req, res) => {
  try {
    const totalSent = await prisma.notification.count({
      where: { status: 'sent' }
    });

    const totalScheduled = await prisma.notification.count({
      where: { status: 'scheduled' }
    });

    const totalDrafts = await prisma.notification.count({
      where: { status: 'draft' }
    });

    // Calculate average open rate (you would need to track this properly)
    const sentNotifications = await prisma.notification.findMany({
      where: { status: 'sent' },
      select: { recipients: true, openCount: true }
    });

    const totalRecipients = sentNotifications.reduce((sum, n) => sum + n.recipients, 0);
    const totalOpens = sentNotifications.reduce((sum, n) => sum + n.openCount, 0);
    const averageOpenRate = totalRecipients > 0 ? Math.round((totalOpens / totalRecipients) * 100) : 0;

    res.json({
      success: true,
      stats: {
        totalSent,
        totalScheduled,
        totalDrafts,
        averageOpenRate: averageOpenRate + '%'
      }
    });

  } catch (error) {
    console.error("Error fetching notification stats:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch notification statistics" 
    });
  }
};

// Helper function to send notification immediately
const sendNotificationImmediately = async (notification) => {
  try {
    // Get target patients based on audience
    let patients = [];
    
    if (notification.audience === 'all') {
      patients = await prisma.patient.findMany({
        where: { status: 'active' },
        select: { id: true, contactNo: true, deviceToken: true }
      });
    } else if (notification.audience === 'new_patients') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      patients = await prisma.patient.findMany({
        where: { 
          status: 'active',
          createdAt: { gte: thirtyDaysAgo }
        },
        select: { id: true, contactNo: true, deviceToken: true }
      });
    } else if (notification.audience === 'selected_patients' && notification.selectedPatients) {
      patients = await prisma.patient.findMany({
        where: { 
          id: { in: notification.selectedPatients },
          status: 'active'
        },
        select: { id: true, contactNo: true, deviceToken: true }
      });
    }

    let successCount = 0;
    let failureCount = 0;

    // Send notifications based on type
    for (const patient of patients) {
      try {
        if (notification.type === 'push' && patient.deviceToken) {
          await sendPushNotification({
            token: patient.deviceToken,
            title: notification.title,
            body: notification.message,
            image: notification.imageUrl,
            data: { deepLink: notification.deepLink }
          });
        } else if (notification.type === 'whatsapp' && patient.contactNo) {
          await sendWhatsAppMessage({
            to: patient.contactNo,
            message: notification.message
          });
        }

        // Log successful delivery
        await prisma.notificationLog.create({
          data: {
            notificationId: notification.id,
            patientId: patient.id,
            type: notification.type,
            status: 'sent',
            deviceToken: notification.type === 'push' ? patient.deviceToken : null,
            phoneNumber: notification.type === 'whatsapp' ? patient.contactNo : null
          }
        });

        successCount++;

      } catch (error) {
        console.error(`Failed to send notification to patient ${patient.id}:`, error);
        
        // Log failure
        await prisma.notificationLog.create({
          data: {
            notificationId: notification.id,
            patientId: patient.id,
            type: notification.type,
            status: 'failed',
            deviceToken: notification.type === 'push' ? patient.deviceToken : null,
            phoneNumber: notification.type === 'whatsapp' ? patient.contactNo : null,
            errorMessage: error.message
          }
        });

        failureCount++;
      }
    }

    // Update notification with delivery stats
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        recipients: successCount,
        failureCount: failureCount
      }
    });

  } catch (error) {
    console.error("Error in sendNotificationImmediately:", error);
    throw error;
  }
};