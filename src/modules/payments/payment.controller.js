import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 🧾 Create a new payment
 */
export const createPayment = async (req, res) => {
  try {
    const {
      orderId,
      patientId,
      vendorId,
      centerId,
      paymentId,
      paymentMethod,
      paymentStatus,
      amount,
      transactionNote,
      referenceId,
    } = req.body;

    if (!paymentId || !paymentMethod || !amount) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const payment = await prisma.payment.create({
      data: {
        orderId: orderId ? Number(orderId) : null,
        patientId: patientId ? Number(patientId) : null,
        vendorId: vendorId ? Number(vendorId) : null,
        centerId: centerId ? Number(centerId) : null,
        paymentId,
        paymentMethod,
        paymentStatus: paymentStatus || "PENDING",
        amount: Number(amount),
        transactionNote,
        referenceId,
      },
    });

    res.status(201).json({
      success: true,
      message: "Payment created successfully",
      data: payment,
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({ success: false, message: "Failed to create payment" });
  }
};

/**
 * 📜 Get all payments (with pagination and filters)
 */
export const getAllPayments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      status,
      startDate,
      endDate,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Dynamic filter
    const where = {};

    if (status) where.paymentStatus = status.toUpperCase();
    if (search) {
      where.OR = [
        { paymentId: { contains: search, mode: "insensitive" } },
        { paymentMethod: { contains: search, mode: "insensitive" } },
        { transactionNote: { contains: search, mode: "insensitive" } },
      ];
    }
    if (startDate && endDate) {
      where.paymentDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { paymentDate: "desc" },
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      success: true,
      data: payments,
      meta: {
        total,
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ success: false, message: "Failed to fetch payments" });
  }
};

/**
 * 🔍 Get payment by ID
 */
export const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: Number(id) },
    });

    if (!payment)
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });

    res.json({ success: true, data: payment });
  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ success: false, message: "Failed to fetch payment" });
  }
};

/**
 * ✏️ Update payment status or details
 */
export const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const payment = await prisma.payment.update({
      where: { id: Number(id) },
      data,
    });

    res.json({
      success: true,
      message: "Payment updated successfully",
      data: payment,
    });
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({ success: false, message: "Failed to update payment" });
  }
};

/**
 * ❌ Delete payment
 */
export const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.payment.delete({
      where: { id: Number(id) },
    });

    res.json({ success: true, message: "Payment deleted successfully" });
  } catch (error) {
    console.error("Error deleting payment:", error);
    res.status(500).json({ success: false, message: "Failed to delete payment" });
  }
};
