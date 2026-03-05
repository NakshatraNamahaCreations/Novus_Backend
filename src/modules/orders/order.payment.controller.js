// ─── order.payment.controller.js ─────────────────────────────────────────────
// Handles: addOrderPayment, getOrderPaymentSummary
// ─────────────────────────────────────────────────────────────────────────────


import { invoiceQueue } from "../../queues/invoice.queue.js";
import prisma from '../../lib/prisma.js';

// ─────────────────────────────────────────────────────────────────────────────
// ADD PAYMENT TO ORDER
// ─────────────────────────────────────────────────────────────────────────────

export const addOrderPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      paymentMethod, paymentMode, amount, currency = "INR",
      transactionNote, referenceId, gatewayResponse,
      capturedAmount, diagnosticCenterId, ipAddress,
    } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      include: {
        payments: true,
        patient: { select: { id: true, fullName: true, contactNo: true } },
        vendor: { select: { id: true, name: true } },
      },
    });

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const existingTotal = order.payments.reduce((t, p) => t + (p.amount || 0), 0);
    const balance       = order.finalAmount - existingTotal;

    if (amount > balance)
      return res.status(400).json({ success: false, message: `Payment exceeds balance. Max: ${balance}` });

    if (amount <= 0)
      return res.status(400).json({ success: false, message: "Payment amount must be > 0" });

    const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const payment = await prisma.payment.create({
      data: {
        orderId: parseInt(orderId),
        patientId: order.patientId,
        userId: req.user?.id,
        vendorId: order.vendorId,
        centerId: order.centerId,
        paymentId,
        diagnosticCenterId,
        paymentMethod: paymentMode?.toUpperCase(),
        paymentStatus: "COMPLETED",
        amount, currency,
        paymentDate: new Date(),
        transactionNote, referenceId, gatewayResponse,
        capturedAmount: capturedAmount || amount,
        ipAddress: ipAddress || req.ip,
        createdById: req.user?.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    const newTotalPaid = existingTotal + amount;
    const newPaymentStatus =
      newTotalPaid >= order.finalAmount ? "paid"
      : newTotalPaid > 0               ? "partially_paid"
                                       : "pending";

    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(orderId) },
      data: { paymentStatus: newPaymentStatus },
      include: { payments: { orderBy: { createdAt: "desc" }, take: 5 } },
    });

    await invoiceQueue.add("generate-invoice", { paymentId });

    // Update vendor earnings
    if (order.vendorId && amount > 0) {
      await prisma.vendor.update({
        where: { id: order.vendorId },
        data: { earnings: { increment: amount } },
      });

      const updatedVendor = await prisma.vendor.findUnique({
        where: { id: order.vendorId }, select: { earnings: true },
      });

      await prisma.earningsHistory.create({
        data: {
          vendorId: order.vendorId,
          title: "Order Payment Received",
          desc: `Payment of ${amount} ${currency} for order ${order.orderNumber}`,
          amount, type: "add",
          balanceAfter: updatedVendor.earnings,
          createdById: req.user?.id,
        },
      });
    }


    return res.status(201).json({
      success: true,
      message: "Payment added to order successfully",
      payment,
      order: updatedOrder,
      summary: {
        orderTotal: order.finalAmount,
        previousPaid: existingTotal,
        newPayment: amount,
        totalPaid: newTotalPaid,
        balance: order.finalAmount - newTotalPaid,
        paymentStatus: newPaymentStatus,
      },
    });
  } catch (error) {
    console.error("Add order payment error:", error);
    return res.status(500).json({ success: false, message: "Error adding payment", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ORDER PAYMENT SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export const getOrderPaymentSummary = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      select: {
        id: true, orderNumber: true, totalAmount: true, discount: true,
        finalAmount: true, paymentStatus: true, patientId: true, vendorId: true,
      },
    });

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    // Authorization check
    if (req.user.role !== "admin") {
      if (req.user.patientId && order.patientId !== req.user.patientId)
        return res.status(403).json({ success: false, message: "Not authorized to access order payments" });
      if (req.user.vendorId && order.vendorId !== req.user.vendorId)
        return res.status(403).json({ success: false, message: "Not authorized to access order payments" });
    }

    const payments = await prisma.payment.findMany({
      where: { orderId: parseInt(orderId) },
      orderBy: { createdAt: "desc" },
    });

    const totalPaid     = payments.reduce((s, p) => s + p.amount, 0);
    const totalRefunded = payments.reduce((s, p) => s + (p.refundAmount || 0), 0);
    const netPaid       = totalPaid - totalRefunded;
    const balance       = order.finalAmount - netPaid;

    const byMethod = Object.values(
      payments.reduce((acc, p) => {
        const m = p.paymentMethod;
        if (!acc[m]) acc[m] = { method: m, count: 0, amount: 0 };
        acc[m].count  += 1;
        acc[m].amount += p.amount;
        return acc;
      }, {})
    );

    const recentPayments = payments.slice(0, 5).map((p) => ({
      id: p.id, paymentId: p.paymentId, amount: p.amount,
      method: p.paymentMethod, status: p.paymentStatus,
      date: p.paymentDate, refundAmount: p.refundAmount,
    }));

    return res.json({
      success: true,
      summary: {
        order: {
          id: order.id, orderNumber: order.orderNumber,
          totalAmount: order.totalAmount, discount: order.discount,
          finalAmount: order.finalAmount, paymentStatus: order.paymentStatus,
        },
        payments: {
          totalPaid, totalRefunded, netPaid, balance,
          isPaid: netPaid >= order.finalAmount,
          isPartiallyPaid: netPaid > 0 && netPaid < order.finalAmount,
        },
        byMethod,
        recentPayments,
        paymentCount: payments.length,
      },
    });
  } catch (error) {
    console.error("Get order payment summary error:", error);
    return res.status(500).json({ success: false, message: "Error fetching payment summary", error: error.message });
  }
};