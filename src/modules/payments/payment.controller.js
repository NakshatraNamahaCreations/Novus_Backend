import { PrismaClient } from "@prisma/client";
import { invoiceQueue } from "../../queues/invoice.queue.js";

const prisma = new PrismaClient();

/**
 * @desc    Create a new payment
 * @route   POST /api/payments
 * @access  Private (Admin/Patient)
 */
export const createPayment = async (req, res) => {
  try {
    const {
      orderId,
      patientId,
      vendorId,
      centerId,
      paymentMethod,
      paymentMode,
      amount,
      currency = "INR",
      transactionNote,
      referenceId,
      gatewayResponse,
      capturedAmount,
      ipAddress,
    } = req.body;

    // Check if order exists
    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { payments: true },
      });

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Calculate total paid amount
      const existingPaymentsTotal = order.payments.reduce((total, payment) => {
        return total + (payment.amount || 0);
      }, 0);

      // Check if payment exceeds order amount
      if (existingPaymentsTotal + amount > order.finalAmount) {
        return res.status(400).json({
          message: `Payment amount exceeds order balance. Maximum allowed: ${
            order.finalAmount - existingPaymentsTotal
          }`,
        });
      }
    }

    // Generate unique payment ID
    const paymentId = `PAY-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Create payment
    const payment = await prisma.payment.create({
      data: {
        orderId,
        patientId: patientId || req.user?.patientId,
        userId: req.user?.id,
        vendorId,
        centerId,
        paymentId,
        paymentMethod,
        paymentMode,
        paymentStatus: "COMPLETED", // Default for manual payments
        amount,
        currency,
        paymentDate: new Date(),
        transactionNote,
        referenceId,
        gatewayResponse,
        capturedAmount: capturedAmount || amount,
        ipAddress: ipAddress || req.ip,
        createdById: req.user?.id,
        createdBy: req.user?.id ? { connect: { id: req.user.id } } : undefined,
      },
      include: {
        order: {
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                contactNo: true,
              },
            },
          },
        },
        patient: {
          select: {
            id: true,
            fullName: true,
            contactNo: true,
          },
        },
        vendor: {
          select: {
            id: true,
            name: true,
            number: true,
          },
        },
        center: {
          select: {
            id: true,
            name: true,
            email: true,
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
    });

    // Update order payment status if order exists
    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { payments: true },
      });

      if (order) {
        const totalPaid =
          order.payments.reduce((total, p) => total + p.amount, 0) + amount;
        const paymentStatus =
          totalPaid >= order.finalAmount
            ? "paid"
            : totalPaid > 0
              ? "partially_paid"
              : "pending";

        await prisma.order.update({
          where: { id: orderId },
          data: { paymentStatus },
        });
      }
    }

    // Update vendor earnings if vendor payment
    if (vendorId && amount > 0) {
      await prisma.vendor.update({
        where: { id: vendorId },
        data: {
          earnings: { increment: amount },
        },
      });

      // Create earnings history
      await prisma.earningsHistory.create({
        data: {
          vendorId,
          title: "Payment Received",
          desc: `Payment of ${amount} ${currency} received`,
          amount,
          type: "add",
          balanceAfter: await prisma.vendor
            .findUnique({
              where: { id: vendorId },
              select: { earnings: true },
            })
            .then((vendor) => vendor.earnings),
          createdById: req.user?.id,
        },
      });
    }
    await invoiceQueue.add("generate-invoice", { paymentId });
    res.status(201).json({
      success: true,
      message: "Payment created successfully",
      payment,
    });
  } catch (error) {
    console.error("Create payment error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating payment",
      error: error.message,
    });
  }
};

/**
 * @desc    Get all payments with filters
 * @route   GET /api/payments
 * @access  Private (Admin)
 */

export const getAllPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      orderId,
      patientId,
      vendorId,
      centerId,
      paymentStatus,
      paymentMethod,
      paymentMode,
      startDate,
      endDate,
      search,
    } = req.query;

    const user = req.user;
  
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    // ✅ ROLE BASED FILTER
    // if (user?.role === "admin") {
    //   where.createdById = user.id;
    // }

    if (user?.role === "admin") {
  const centerIds = Array.isArray(user?.centerIds) ? user.centerIds : [];

  if (centerIds.length > 0) {
    where.centerId = { in: centerIds }; // ✅ filter orders by center
  } 
  else{
     return res.status(200).json({
      success: false,
      message: "No payments for this users",
    });
  }
}

    // Apply filters
    if (orderId) where.orderId = parseInt(orderId);
    if (patientId) where.patientId = parseInt(patientId);
    if (vendorId) where.vendorId = parseInt(vendorId);
    if (centerId) where.centerId = parseInt(centerId);
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (paymentMode) where.paymentMode = paymentMode;

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Search filter
    if (search) {
      where.OR = [
        { paymentId: { contains: search, mode: "insensitive" } },
        { referenceId: { contains: search, mode: "insensitive" } },
        {
          order: {
            orderNumber: { contains: search, mode: "insensitive" },
          },
        },
        {
          patient: {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { contactNo: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        {
          vendor: {
            name: { contains: search, mode: "insensitive" },
          },
        },
      ];
    }

    // Get payments with pagination
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              finalAmount: true,
            },
          },
          patient: {
            select: {
              id: true,
              fullName: true,
              contactNo: true,
            },
          },
          vendor: {
            select: {
              id: true,
              name: true,
              number: true,
            },
          },
          center: {
            select: {
              id: true,
              name: true,
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
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: parseInt(limit),
      }),
      prisma.payment.count({ where }),
    ]);

    // Calculate summary
    const summary = await prisma.payment.aggregate({
      where,
      _sum: {
        amount: true,
        refundAmount: true,
      },
      _count: true,
    });

    res.json({
      success: true,
      payments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      summary: {
        totalAmount: summary._sum.amount || 0,
        totalRefunds: summary._sum.refundAmount || 0,
        netAmount:
          (summary._sum.amount || 0) - (summary._sum.refundAmount || 0),
        totalPayments: summary._count,
      },
    });
  } catch (error) {
    console.error("Get all payments error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
    });
  }
};

/**
 * @desc    Get payment by ID
 * @route   GET /api/payments/:id
 * @access  Private (Admin/Patient/Vendor)
 */
export const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: parseInt(id) },
      include: {
        order: {
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                contactNo: true,
                email: true,
              },
            },
            vendor: {
              select: {
                id: true,
                name: true,
                number: true,
              },
            },
            center: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        patient: {
          select: {
            id: true,
            fullName: true,
            contactNo: true,
            email: true,
          },
        },
        vendor: {
          select: {
            id: true,
            name: true,
            number: true,
            email: true,
          },
        },
        center: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Check authorization
    if (req.user.role !== "admin") {
      if (req.user.patientId && payment.patientId !== req.user.patientId) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access this payment",
        });
      }
      if (req.user.vendorId && payment.vendorId !== req.user.vendorId) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access this payment",
        });
      }
    }

    res.json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("Get payment by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payment",
      error: error.message,
    });
  }
};

/**
 * @desc    Get payments by order ID
 * @route   GET /api/orders/:orderId/payments
 * @access  Private (Admin/Patient/Vendor)
 */
export const getPaymentsByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      select: { patientId: true, vendorId: true },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const payments = await prisma.payment.findMany({
      where: { orderId: parseInt(orderId) },

      orderBy: {
        createdAt: "desc",
      },
    });

    // Calculate totals
    const totalPaid = payments.reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );
    const totalRefunded = payments.reduce(
      (sum, payment) => sum + (payment.refundAmount || 0),
      0,
    );

    res.json({
      success: true,
      payments,
      summary: {
        totalPaid,
        totalRefunded,
        netAmount: totalPaid - totalRefunded,
        count: payments.length,
      },
    });
  } catch (error) {
    console.error("Get payments by order ID error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching order payments",
      error: error.message,
    });
  }
};

/**
 * @desc    Get payments by patient ID
 * @route   GET /api/patients/:patientId/payments
 * @access  Private (Admin/Patient)
 */
export const getPaymentsByPatientId = async (req, res) => {
  try {
    const { patientId } = req.params;

    // Check authorization
    if (
      req.user.role !== "admin" &&
      req.user.patientId !== parseInt(patientId)
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access patient payments",
      });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: { patientId: parseInt(patientId) },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              finalAmount: true,
              status: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: parseInt(limit),
      }),
      prisma.payment.count({
        where: { patientId: parseInt(patientId) },
      }),
    ]);

    // Calculate summary
    const summary = await prisma.payment.aggregate({
      where: { patientId: parseInt(patientId) },
      _sum: {
        amount: true,
        refundAmount: true,
      },
    });

    res.json({
      success: true,
      payments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      summary: {
        totalPaid: summary._sum.amount || 0,
        totalRefunded: summary._sum.refundAmount || 0,
        netAmount:
          (summary._sum.amount || 0) - (summary._sum.refundAmount || 0),
      },
    });
  } catch (error) {
    console.error("Get payments by patient ID error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching patient payments",
      error: error.message,
    });
  }
};

/**
 * @desc    Update payment status
 * @route   PUT /api/payments/:id/status
 * @access  Private (Admin)
 */
export const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, notes } = req.body;

    const validStatuses = [
      "PENDING",
      "AUTHORIZED",
      "CAPTURED",
      "FAILED",
      "REFUNDED",
      "PARTIALLY_REFUNDED",
      "CANCELLED",
    ];

    if (!validStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
      });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: parseInt(id) },
      include: { order: true },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Update payment
    const updatedPayment = await prisma.payment.update({
      where: { id: parseInt(id) },
      data: {
        paymentStatus,
        transactionNote: notes
          ? `${
              payment.transactionNote || ""
            }\n${new Date().toISOString()}: ${notes}`.trim()
          : payment.transactionNote,
        updatedById: req.user.id,
        updatedBy: { connect: { id: req.user.id } },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Update order payment status if payment is for an order
    if (payment.orderId) {
      const orderPayments = await prisma.payment.findMany({
        where: { orderId: payment.orderId },
      });

      const totalPaid = orderPayments
        .filter((p) => p.paymentStatus === "CAPTURED")
        .reduce((sum, p) => sum + p.amount, 0);

      const order = await prisma.order.findUnique({
        where: { id: payment.orderId },
      });

      if (order) {
        const newPaymentStatus =
          totalPaid >= order.finalAmount
            ? "paid"
            : totalPaid > 0
              ? "partially_paid"
              : "pending";

        await prisma.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: newPaymentStatus },
        });
      }
    }

    res.json({
      success: true,
      message: "Payment status updated successfully",
      payment: updatedPayment,
    });
  } catch (error) {
    console.error("Update payment status error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating payment status",
      error: error.message,
    });
  }
};

/**
 * @desc    Process refund for a payment
 * @route   POST /api/payments/:id/refund
 * @access  Private (Admin)
 */
export const processRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { refundAmount, refundReason, refundReference } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { id: parseInt(id) },
      include: { order: true, vendor: true },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Check if payment is captured
    if (payment.paymentStatus !== "CAPTURED") {
      return res.status(400).json({
        success: false,
        message: "Only captured payments can be refunded",
      });
    }

    // Validate refund amount
    const maxRefundable = payment.amount - (payment.refundAmount || 0);
    if (refundAmount > maxRefundable) {
      return res.status(400).json({
        success: false,
        message: `Refund amount exceeds maximum refundable amount of ${maxRefundable}`,
      });
    }

    // Update payment for refund
    const updatedPayment = await prisma.payment.update({
      where: { id: parseInt(id) },
      data: {
        refundAmount: (payment.refundAmount || 0) + refundAmount,
        refundDate: new Date(),
        refundReason,
        refundReference,
        paymentStatus:
          refundAmount === payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED",
        updatedById: req.user.id,
        updatedBy: { connect: { id: req.user.id } },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
        patient: {
          select: {
            id: true,
            fullName: true,
            contactNo: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Update vendor earnings if vendor payment
    if (payment.vendorId && refundAmount > 0) {
      await prisma.vendor.update({
        where: { id: payment.vendorId },
        data: {
          earnings: { decrement: refundAmount },
        },
      });

      // Create earnings history for refund
      await prisma.earningsHistory.create({
        data: {
          vendorId: payment.vendorId,
          title: "Refund Processed",
          desc: `Refund of ${refundAmount} processed for payment ${payment.paymentId}`,
          amount: refundAmount,
          type: "deduct",
          balanceAfter: await prisma.vendor
            .findUnique({
              where: { id: payment.vendorId },
              select: { earnings: true },
            })
            .then((vendor) => vendor.earnings),
          createdById: req.user.id,
        },
      });
    }

    res.json({
      success: true,
      message: "Refund processed successfully",
      payment: updatedPayment,
    });
  } catch (error) {
    console.error("Process refund error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing refund",
      error: error.message,
    });
  }
};

/**
 * @desc    Get payment statistics
 * @route   GET /api/payments/statistics
 * @access  Private (Admin)
 */
export const getPaymentStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = {};

    // Date range filter
    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) where.paymentDate.gte = new Date(startDate);
      if (endDate) where.paymentDate.lte = new Date(endDate);
    }

    // Get statistics
    const [
      totalPayments,
      totalAmount,
      totalRefunds,
      statusCounts,
      methodCounts,
      dailyStats,
    ] = await Promise.all([
      // Total payments
      prisma.payment.count({ where }),

      // Total amount
      prisma.payment.aggregate({
        where,
        _sum: { amount: true },
      }),

      // Total refunds
      prisma.payment.aggregate({
        where: { ...where, refundAmount: { gt: 0 } },
        _sum: { refundAmount: true },
      }),

      // Status counts
      prisma.payment.groupBy({
        by: ["paymentStatus"],
        where,
        _count: true,
        _sum: { amount: true },
      }),

      // Payment method counts
      prisma.payment.groupBy({
        by: ["paymentMethod"],
        where,
        _count: true,
        _sum: { amount: true },
      }),

      // Daily statistics for last 30 days
      prisma.$queryRaw`
        SELECT 
          DATE("paymentDate") as date,
          COUNT(*) as count,
          SUM(amount) as total_amount,
          SUM(COALESCE(refundAmount, 0)) as total_refunds
        FROM "Payment"
        WHERE "paymentDate" >= CURRENT_DATE - INTERVAL '30 days'
          ${
            startDate
              ? prisma.sql`AND "paymentDate" >= ${new Date(startDate)}`
              : prisma.sql``
          }
          ${
            endDate
              ? prisma.sql`AND "paymentDate" <= ${new Date(endDate)}`
              : prisma.sql``
          }
        GROUP BY DATE("paymentDate")
        ORDER BY date DESC
        LIMIT 30
      `,
    ]);

    // Calculate vendor payments
    const vendorPayments = await prisma.payment.groupBy({
      by: ["vendorId"],
      where: { ...where, vendorId: { not: null } },
      _count: true,
      _sum: { amount: true },
    });

    // Get vendor details
    const vendorDetails = await Promise.all(
      vendorPayments.map(async (vp) => {
        const vendor = await prisma.vendor.findUnique({
          where: { id: vp.vendorId },
          select: { name: true },
        });
        return {
          vendorId: vp.vendorId,
          vendorName: vendor?.name || "Unknown",
          count: vp._count,
          totalAmount: vp._sum.amount,
        };
      }),
    );

    res.json({
      success: true,
      statistics: {
        totalPayments,
        totalAmount: totalAmount._sum.amount || 0,
        totalRefunds: totalRefunds._sum.refundAmount || 0,
        netAmount:
          (totalAmount._sum.amount || 0) -
          (totalRefunds._sum.refundAmount || 0),
        byStatus: statusCounts.map((s) => ({
          status: s.paymentStatus,
          count: s._count,
          amount: s._sum.amount,
        })),
        byMethod: methodCounts.map((m) => ({
          method: m.paymentMethod,
          count: m._count,
          amount: m._sum.amount,
        })),
        byVendor: vendorDetails,
        dailyStats,
      },
    });
  } catch (error) {
    console.error("Get payment statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payment statistics",
      error: error.message,
    });
  }
};

/**
 * @desc    Delete payment (soft delete)
 * @route   DELETE /api/payments/:id
 * @access  Private (Admin)
 */
export const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: parseInt(id) },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Check if payment has been refunded
    if (payment.refundAmount && payment.refundAmount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete payment with refunds",
      });
    }

    // Soft delete by updating status
    await prisma.payment.update({
      where: { id: parseInt(id) },
      data: {
        paymentStatus: "CANCELLED",
        transactionNote: `${
          payment.transactionNote || ""
        }\n${new Date().toISOString()}: Payment deleted by admin`.trim(),
        updatedById: req.user.id,
        updatedBy: { connect: { id: req.user.id } },
      },
    });

    res.json({
      success: true,
      message: "Payment deleted successfully",
    });
  } catch (error) {
    console.error("Delete payment error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting payment",
      error: error.message,
    });
  }
};
