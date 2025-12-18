
import express from 'express';
import {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  getActiveCouponsForPatient,
  applyCoupon,
  toggleCouponStatus,
} from './coupon.controller.js';
import { authenticateUser } from '../../middlewares/auth.js';

const router = express.Router();

// Coupon management routes
router.post('/',authenticateUser, createCoupon);
router.get('/', getAllCoupons);
router.get('/active', getActiveCouponsForPatient);
router.get('/:id', getCouponById);
router.put('/:id', updateCoupon);
router.delete('/:id', deleteCoupon);
router.patch('/:id/toggle', toggleCouponStatus);

// Coupon application routes
router.post('/apply', applyCoupon);

export default router;