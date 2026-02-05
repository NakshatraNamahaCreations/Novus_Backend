// controllers/couponController.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const getPatientType = async (patientId) => {
  const count = await prisma.order.count({
    where: {
      patientId: Number(patientId),
      status: { not: "cancelled" }, // adjust if needed
    },
  });
  return count === 0 ? "NEW_PATIENT" : "EXISTING_PATIENT";
};


/* ---------------------------------------------------------
   CREATE COUPON
--------------------------------------------------------- */
export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType = "percentage",
      discountValue,
      minOrderAmount,
      maxDiscount,
      validFrom,
      validUntil,
      usageLimit,
      perUserLimit,
      autoApply,
      isPatientCoupon,
      patientId,
      audience, // ✅ NEW: "ALL" | "NEW_PATIENT" | "EXISTING_PATIENT"
    } = req.body;

    if (!code || !discountValue || Number(discountValue) <= 0) {
      return res.status(400).json({
        error: "Code and positive discount value are required",
      });
    }

    if (!["percentage", "fixed"].includes(discountType)) {
      return res.status(400).json({
        error: "Discount type must be 'percentage' or 'fixed'",
      });
    }

    if (isPatientCoupon) {
      if (!patientId) {
        return res.status(400).json({ error: "patientId is required for patient coupon" });
      }
    } else {
      // validate dates only for non-patient coupons
      if (validFrom && validUntil && new Date(validUntil) <= new Date(validFrom)) {
        return res.status(400).json({ error: "Valid until must be after valid from" });
      }
    }

    const existing = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (existing) return res.status(400).json({ error: "Coupon code already exists" });

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        description,
        discountType,
        discountValue: Number(discountValue),
        minOrderAmount: minOrderAmount ? Number(minOrderAmount) : null,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,

        validFrom: isPatientCoupon ? null : (validFrom ? new Date(validFrom) : null),
        validUntil: isPatientCoupon ? null : (validUntil ? new Date(validUntil) : null),

        usageLimit: usageLimit ? Number(usageLimit) : null,
        perUserLimit: perUserLimit ? Number(perUserLimit) : null,

        autoApply: !!autoApply,
        isActive: true,

        isPatientCoupon: !!isPatientCoupon,
        patientId: isPatientCoupon ? Number(patientId) : null,

        // ✅ requires schema field audience (enum)
        audience: audience || "ALL",

        createdById: req.user.id, // ✅ keep only this
      },
    });

    return res.status(201).json({ message: "Coupon created successfully", coupon });
  } catch (error) {
    console.error("Error creating coupon:", error);
    return res.status(500).json({ error: "Failed to create coupon" });
  }
};


/* ---------------------------------------------------------
   GET ALL COUPONS
--------------------------------------------------------- */
export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({
      include: {
        couponUsages: true,
      },
      orderBy: { createdAt: "desc" }
    });

    const cleaned = coupons.map(c => ({
      ...c,
      usedCount: c.couponUsages.length,
      couponUsages: undefined
    }));

    res.json(cleaned);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
};

/* ---------------------------------------------------------
   GET COUPON BY ID
--------------------------------------------------------- */
export const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({
      where: { id: Number(id) },
      include: {
        couponUsages: {
          include: {
            patient: {
              select: { id: true, fullName: true, email: true }
            }
          }
        }
      }
    });

    if (!coupon) return res.status(404).json({ error: "Coupon not found" });

    res.json({
      ...coupon,
      usedCount: coupon.couponUsages.length
    });

  } catch (error) {
    console.error("Error fetching coupon:", error);
    res.status(500).json({ error: "Failed to fetch coupon" });
  }
};

/* ---------------------------------------------------------
   UPDATE COUPON
--------------------------------------------------------- */
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const old = await prisma.coupon.findUnique({ where: { id: Number(id) } });
    if (!old) return res.status(404).json({ error: "Coupon not found" });

    if (data.code && data.code !== old.code) {
      const exists = await prisma.coupon.findUnique({
        where: { code: data.code.toUpperCase() }
      });
      if (exists) return res.status(400).json({ error: "Coupon code already exists" });
    }

    // Validate dates
    if (!data.isPatientCoupon) {
      if (data.validFrom && data.validUntil) {
        if (new Date(data.validUntil) <= new Date(data.validFrom)) {
          return res.status(400).json({ 
            error: "Valid until must be after valid from" 
          });
        }
      }
    }

    const updated = await prisma.coupon.update({
      where: { id: Number(id) },
      data: {
        ...data,
        code: data.code ? data.code.toUpperCase() : old.code,
        validFrom: data.isPatientCoupon ? null : (data.validFrom ? new Date(data.validFrom) : old.validFrom),
        validUntil: data.isPatientCoupon ? null : (data.validUntil ? new Date(data.validUntil) : old.validUntil),
        patientId: data.isPatientCoupon ? Number(data.patientId) : null
      }
    });

    res.json({ message: "Coupon updated", coupon: updated });
  } catch (error) {
    console.error("Error updating coupon:", error);
    res.status(500).json({ error: "Failed to update coupon" });
  }
};

/* ---------------------------------------------------------
   DELETE COUPON
--------------------------------------------------------- */
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.coupon.delete({
      where: { id: Number(id) }
    });

    res.json({ message: "Coupon deleted successfully" });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    res.status(500).json({ error: "Failed to delete coupon" });
  }
};

/* ---------------------------------------------------------
   GET ACTIVE COUPONS FOR PATIENT
--------------------------------------------------------- */
export const getActiveCouponsForPatient = async (req, res) => {
  try {
    const { patientId } = req.query;
    if (!patientId) return res.status(400).json({ error: "patientId is required" });

    const now = new Date();
    const patientType = await getPatientType(patientId);

    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        OR: [
          // ✅ patient-specific coupon only for this patient
          { isPatientCoupon: true, patientId: Number(patientId) },

          // ✅ general coupons with date + audience filtering
          {
            isPatientCoupon: false,
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
              { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
              {
                OR: [
                  { audience: "ALL" },
                  { audience: patientType }, // "NEW_PATIENT" or "EXISTING_PATIENT"
                ],
              },
            ],
          },
        ],
      },
      include: {
        couponUsages: { where: { patientId: Number(patientId) } },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = coupons.map((c) => ({
      ...c,
      usedCount: c.couponUsages.length,
      isUsed: c.couponUsages.length > 0,
      couponUsages: undefined,
    }));

    return res.json(result);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    return res.status(500).json({ error: "Failed to fetch coupons" });
  }
};


/* ---------------------------------------------------------
   APPLY COUPON
--------------------------------------------------------- */
export const applyCoupon = async (req, res) => {
  try {
    const { code, patientId, orderAmount, currentOrderId } = req.body;

    if (!code || !patientId || !orderAmount) {
      return res.status(400).json({ error: "code, patientId, orderAmount are required" });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!coupon) return res.status(404).json({ error: "Invalid coupon" });

    // ✅ patient coupon validation
    if (coupon.isPatientCoupon && Number(coupon.patientId) !== Number(patientId)) {
      return res.status(400).json({ error: "This coupon is not valid for this patient" });
    }

    // ✅ audience validation (requires schema field)
    if (!coupon.isPatientCoupon) {
      const patientType = await getPatientType(patientId);
      if (coupon.audience !== "ALL" && coupon.audience !== patientType) {
        return res.status(400).json({ error: `Coupon only for ${coupon.audience.replace("_", " ").toLowerCase()}` });
      }

      // date validation
      const now = new Date();
      if (coupon.validFrom && now < coupon.validFrom) return res.status(400).json({ error: "Coupon not yet valid" });
      if (coupon.validUntil && now > coupon.validUntil) return res.status(400).json({ error: "Coupon expired" });
    }

    // min order
    if (coupon.minOrderAmount && Number(orderAmount) < coupon.minOrderAmount) {
      return res.status(400).json({ error: `Minimum order amount is ₹${coupon.minOrderAmount}` });
    }

    // total usage limit
    if (coupon.usageLimit) {
      const totalUses = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
      if (totalUses >= coupon.usageLimit) return res.status(400).json({ error: "Usage limit reached" });
    }

    // per user limit
    if (coupon.perUserLimit) {
      const userUses = await prisma.couponUsage.count({
        where: { couponId: coupon.id, patientId: Number(patientId) },
      });
      if (userUses >= coupon.perUserLimit) return res.status(400).json({ error: "You have already used this coupon" });
    }

    // discount calc
    const amt = Number(orderAmount);
    let discount =
      coupon.discountType === "fixed"
        ? coupon.discountValue
        : Math.min((amt * coupon.discountValue) / 100, coupon.maxDiscount || Infinity);

    discount = Math.min(discount, amt); // avoid negative final
    const finalAmount = amt - discount;

    return res.json({
      message: "Coupon validated",
      couponId: coupon.id,
      discount,
      finalAmount,
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    return res.status(500).json({ error: "Failed to apply coupon" });
  }
};


/* ---------------------------------------------------------
   TOGGLE COUPON STATUS
--------------------------------------------------------- */
export const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({
      where: { id: Number(id) }
    });

    if (!coupon) return res.status(404).json({ error: "Coupon not found" });

    const updated = await prisma.coupon.update({
      where: { id: Number(id) },
      data: { isActive: !coupon.isActive }
    });

    res.json({
      message: `Coupon ${updated.isActive ? "activated" : "deactivated"} successfully`,
      coupon: updated
    });

  } catch (error) {
    console.error("Error toggling coupon:", error);
    res.status(500).json({ error: "Failed to toggle status" });
  }
};
