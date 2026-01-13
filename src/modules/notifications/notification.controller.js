import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

import { notificationQueue } from "../../queues/notification.queue.js";

export const getAllNotifications = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      status = "",
      type = "",
      search = "",
    } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    const where = {};

    if (status && status !== "all") where.status = status;
    if (type && type !== "all") where.type = type;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { message: { contains: search, mode: "insensitive" } },
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
              logs: { where: { status: "sent" } },
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    const formatted = notifications.map((n) => {
      const sent = n._count.logs;
      return {
        ...n,
        recipients: sent,
        openRate:
          sent > 0 ? Math.round((n.openCount / sent) * 100) + "%" : "0%",
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
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
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
                contactNo: true,
              },
            },
          },
          orderBy: { sentAt: "desc" },
          take: 50,
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    res.json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error("Error fetching notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notification details",
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
      deepLink,
    } = req.body;

    // Get user ID from request (assuming you have auth middleware)
    const userId = req.user?.id;

    // Validation
    if (!title || !message || !type || !audience) {
      return res.status(400).json({
        success: false,
        error: "Title, message, type, and audience are required",
      });
    }

    if (type === "whatsapp" && message.length > 1000) {
      return res.status(400).json({
        success: false,
        error: "WhatsApp messages cannot exceed 1000 characters",
      });
    }

    if (type === "push" && message.length > 240) {
      return res.status(400).json({
        success: false,
        error: "Push notifications cannot exceed 240 characters",
      });
    }

    if (
      audience === "selected_patients" &&
      (!selectedPatients || selectedPatients.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        error: "Please select at least one patient",
      });
    }

    // Create notification
    const notification = await prisma.notification.create({
      data: {
        title,
        createdById: req.user.id,
        message,
        type,
        audience,
        selectedPatients:
          audience === "selected_patients" ? selectedPatients : null,
        status: schedule ? "scheduled" : "draft",
        scheduledAt: schedule && scheduledAt ? new Date(scheduledAt) : null,
        imageUrl: imageUrl || null,
        deepLink: deepLink || null,
        createdById: userId, // Add creator ID
      },
    });

    // If not scheduled, send immediately
    if (!scheduledAt) {
      await notificationQueue.add(
        "send-notification",
        {
          notificationId: notification.id,
        },
        {
          jobId: `notification-${notification.id}`,
        }
      );
    }

    res.status(201).json({
      success: true,
      message: schedule
        ? "Notification scheduled successfully"
        : "Notification sent successfully",
      notification,
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create notification",
      message: error.message,
    });
  }
};

export const updateNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if notification exists
    const existingNotification = await prisma.notification.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingNotification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    // Don't allow updates to sent notifications
    if (
      existingNotification.status === "sent" ||
      existingNotification.status === "partial"
    ) {
      return res.status(400).json({
        success: false,
        error: "Cannot update already sent notifications",
      });
    }

    const notification = await prisma.notification.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    res.json({
      success: true,
      message: "Notification updated successfully",
      notification,
    });
  } catch (error) {
    console.error("Error updating notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update notification",
    });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if notification exists
    const existingNotification = await prisma.notification.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingNotification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    await prisma.notification.delete({
      where: { id: parseInt(id) },
    });

    res.json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete notification",
    });
  }
};

export const sendNotificationNow = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id: parseInt(id) },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    await notificationQueue.add(
      "send-notification",
      {
        notificationId: notification.id,
      },
      {
        jobId: `notification-${notification.id}`,
      }
    );

    // Update notification status
    const updatedNotification = await prisma.notification.update({
      where: { id: parseInt(id) },
      data: {
        status: "sent",
        sentAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: "Notification sent successfully",
      notification: updatedNotification,
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send notification",
      message: error.message,
    });
  }
};

export const resendNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const { sendToFailedOnly = false } = req.body;

    const notification = await prisma.notification.findUnique({
      where: { id: parseInt(id) },
      include: {
        logs: {
          where: sendToFailedOnly ? { status: "failed" } : undefined,
          select: { patientId: true },
        },
      },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    if (notification.status !== "sent" && notification.status !== "partial") {
      return res.status(400).json({
        success: false,
        error: "Only sent or partially sent notifications can be resent",
      });
    }

    let patientIds = [];
    if (sendToFailedOnly && notification.logs.length > 0) {
      patientIds = notification.logs.map((log) => log.patientId);
    }

    // Create a new notification record for resend (to maintain history)
    const resendNotification = await prisma.notification.create({
      data: {
        title: `[RESEND] ${notification.title}`,
        message: notification.message,
        type: notification.type,
        audience: notification.audience,
        selectedPatients:
          patientIds.length > 0 ? patientIds : notification.selectedPatients,
        status: "draft",
        imageUrl: notification.imageUrl,
        deepLink: notification.deepLink,
        originalNotificationId: notification.id,
        isResend: true,
        createdById: req.user?.id, // Track who initiated the resend
      },
    });

    // Send the notification
    await notificationQueue.add(
      "send-notification",
      {
        notificationId: notification.id,
      },
      {
        jobId: `notification-${notification.id}`,
      }
    );

    res.json({
      success: true,
      message: sendToFailedOnly
        ? "Notification resent to failed recipients"
        : "Notification resent successfully",
      notification: resendNotification,
    });
  } catch (error) {
    console.error("Error resending notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to resend notification",
      message: error.message,
    });
  }
};

export const duplicateNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const originalNotification = await prisma.notification.findUnique({
      where: { id: parseInt(id) },
    });

    if (!originalNotification) {
      return res.status(404).json({
        success: false,
        error: "Original notification not found",
      });
    }

    // Create a duplicate with draft status
    const duplicateNotification = await prisma.notification.create({
      data: {
        title: `${originalNotification.title} (Copy)`,
        message: originalNotification.message,
        type: originalNotification.type,
        audience: originalNotification.audience,
        selectedPatients: originalNotification.selectedPatients,
        status: "draft",
        scheduledAt: null,
        imageUrl: originalNotification.imageUrl,
        deepLink: originalNotification.deepLink,
        createdById: req.user?.id,
      },
    });

    res.status(201).json({
      success: true,
      message: "Notification duplicated successfully",
      notification: duplicateNotification,
    });
  } catch (error) {
    console.error("Error duplicating notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to duplicate notification",
    });
  }
};

export const getNotificationStats = async (req, res) => {
  try {
    // Get counts by status
    const totalSent = await prisma.notification.count({
      where: { status: "sent" },
    });

    const totalScheduled = await prisma.notification.count({
      where: { status: "scheduled" },
    });

    const totalDrafts = await prisma.notification.count({
      where: { status: "draft" },
    });

    const totalFailed = await prisma.notification.count({
      where: { status: "failed" },
    });

    const totalPartial = await prisma.notification.count({
      where: { status: "partial" },
    });

    // Calculate total recipients and opens
    const sentNotifications = await prisma.notification.findMany({
      where: {
        OR: [{ status: "sent" }, { status: "partial" }],
      },
      select: {
        recipients: true,
        openCount: true,
        logs: {
          where: { status: "sent" },
          select: { id: true },
        },
      },
    });

    const totalRecipients = sentNotifications.reduce(
      (sum, n) => sum + n.recipients,
      0
    );
    const totalLogs = sentNotifications.reduce(
      (sum, n) => sum + n.logs.length,
      0
    );
    const totalOpens = sentNotifications.reduce(
      (sum, n) => sum + n.openCount,
      0
    );

    const averageOpenRate =
      totalRecipients > 0
        ? Math.round((totalOpens / totalRecipients) * 100)
        : 0;
    const successRate =
      totalLogs > 0
        ? Math.round(
            ((totalLogs -
              sentNotifications.reduce(
                (sum, n) => sum + (n.recipients - n.logs.length),
                0
              )) /
              totalLogs) *
              100
          )
        : 0;

    res.json({
      success: true,
      stats: {
        total:
          totalSent + totalScheduled + totalDrafts + totalFailed + totalPartial,
        totalSent,
        totalScheduled,
        totalDrafts,
        totalFailed,
        totalPartial,
        totalRecipients,
        totalOpens,
        averageOpenRate: averageOpenRate + "%",
        successRate: successRate + "%",
      },
    });
  } catch (error) {
    console.error("Error fetching notification stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notification statistics",
    });
  }
};
