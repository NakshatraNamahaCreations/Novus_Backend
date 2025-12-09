import express from 'express';
import { body } from 'express-validator';
import {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePaymentStatus,
  processRefund,
  getPaymentStatistics,
  deletePayment
} from './payment.controller.js';
import {
  addOrderPayment,
  getOrderPaymentSummary
} from '../orders/order.controller.js';
import { getPaymentsByOrderId } from './payment.controller.js';
import { getPaymentsByPatientId } from './payment.controller.js';


const router = express.Router();

// Payment validation rules
const paymentValidation = [
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('paymentMethod').isIn(['CASH', 'CARD', 'UPI', 'NETBANKING', 'WALLET', 'CHEQUE', 'BANK_TRANSFER']).withMessage('Invalid payment method'),
  body('paymentMode').optional().isIn(['ONLINE', 'OFFLINE']).withMessage('Invalid payment mode'),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('referenceId').optional().isString(),
  body('transactionNote').optional().isString().trim()
];

const refundValidation = [
  body('refundAmount').isFloat({ min: 1 }).withMessage('Refund amount must be greater than 0'),
  body('refundReason').optional().isString().trim(),
  body('refundReference').optional().isString().trim()
];

// Order payment validation
const orderPaymentValidation = [
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('paymentMethod').isIn(['CASH', 'CARD', 'UPI', 'NETBANKING', 'WALLET', 'CHEQUE', 'BANK_TRANSFER']).withMessage('Invalid payment method'),
  body('paymentMode').optional().isIn(['ONLINE', 'OFFLINE']).withMessage('Invalid payment mode')
];

// Public routes (for payment webhooks - no auth required)
// router.post('/webhooks/:gateway', paymentWebhookHandler);

// Protected routes
// ================= PAYMENT ROUTES =================
router.route('/')
  .post( paymentValidation, createPayment) // Create new payment
  .get(  getAllPayments); // Get all payments (admin only)

router.route('/statistics')
  .get(  getPaymentStatistics); // Get payment statistics (admin only)

router.route('/:id')
  .get( getPaymentById) // Get payment by ID
  .delete(  deletePayment); // Delete payment (admin only)

router.route('/:id/status')
  .put(  updatePaymentStatus); // Update payment status (admin only)

router.route('/:id/refund')
  .post(  refundValidation, processRefund); // Process refund (admin only)

// ================= ORDER PAYMENT ROUTES =================
router.route('/orders/:orderId/payments')
  .post( addOrderPayment) // Add payment to order
  .get( getPaymentsByOrderId); // Get payments for order

router.route('/orders/:orderId/payments/summary')
  .get( getOrderPaymentSummary); // Get order payment summary

// ================= PATIENT PAYMENT ROUTES =================
router.route('/patients/:patientId/payments')
  .get( getPaymentsByPatientId); // Get payments by patient ID

// ================= VENDOR PAYMENT ROUTES =================
router.route('/vendors/:vendorId/payments')
  .get( async (req, res) => {
    // Similar to patient payments but for vendors
    try {
      const { vendorId } = req.params;
      
      // Verify vendor authorization
      if (req.user.vendorId !== parseInt(vendorId) && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access vendor payments'
        });
      }

      const { page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where: { vendorId: parseInt(vendorId) },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                finalAmount: true
              }
            },
            patient: {
              select: {
                id: true,
                fullName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        }),
        prisma.payment.count({
          where: { vendorId: parseInt(vendorId) }
        })
      ]);

      // Calculate summary
      const summary = await prisma.payment.aggregate({
        where: { vendorId: parseInt(vendorId) },
        _sum: {
          amount: true,
          refundAmount: true
        }
      });

      res.json({
        success: true,
        payments,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        },
        summary: {
          totalEarnings: summary._sum.amount || 0,
          totalRefunds: summary._sum.refundAmount || 0,
          netEarnings: (summary._sum.amount || 0) - (summary._sum.refundAmount || 0)
        }
      });
    } catch (error) {
      console.error('Get vendor payments error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching vendor payments',
        error: error.message
      });
    }
  });

// ================= CENTER PAYMENT ROUTES =================
router.route('/centers/:centerId/payments')
  .get( async (req, res) => {
    // Payments for a specific center (admin only)
    try {
      const { centerId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where: { centerId: parseInt(centerId) },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                finalAmount: true
              }
            },
            patient: {
              select: {
                id: true,
                fullName: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        }),
        prisma.payment.count({
          where: { centerId: parseInt(centerId) }
        })
      ]);

      res.json({
        success: true,
        payments,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Get center payments error:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching center payments',
        error: error.message
      });
    }
  });

export default router;