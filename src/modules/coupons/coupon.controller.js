// controllers/couponController.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const getPatientType = async (patientId) => {
  const count = await prisma.order.count({
    where: {
      patientId: Number(patientId),
      status: { not: "cancelled" },
    },
  });
  return count === 0 ? "NEW_PATIENT" : "EXISTING_PATIENT";
};

// ✅ helper: validate scope + categoryIds input
const normalizeCategoryScope = (scope) => {
  const s = String(scope || "ALL").toUpperCase();
  if (!["ALL", "INCLUDE", "EXCLUDE"].includes(s)) return "ALL";
  return s;
};

// ✅ helper: derive categoryIds from order (best)
const getOrderCategoryIds = async (currentOrderId) => {
  if (!currentOrderId) return [];

  const orderIdNum = Number(currentOrderId);
  if (!Number.isFinite(orderIdNum)) return [];

  const order = await prisma.order.findUnique({
    where: { id: orderIdNum },
    include: {
      // checkup packages
      orderCheckups: {
        include: {
          checkup: { select: { categoryId: true } },
        },
      },
      // per-member packages/tests
      orderMembers: {
        include: {
          orderMemberPackages: {
            include: {
              package: { select: { categoryId: true } },
              test: { select: { categoryId: true } },
            },
          },
        },
      },
    },
  });

  if (!order) return [];

  const ids = new Set();

  // checkups -> HealthPackage.categoryId
  for (const oc of order.orderCheckups || []) {
    if (oc?.checkup?.categoryId) ids.add(oc.checkup.categoryId);
  }

  // member packages/tests
  for (const om of order.orderMembers || []) {
    for (const omp of om.orderMemberPackages || []) {
      if (omp?.package?.categoryId) ids.add(omp.package.categoryId);
      if (omp?.test?.categoryId) ids.add(omp.test.categoryId);
    }
  }

  return Array.from(ids);
};

// ✅ helper: scope check
const validateCouponCategoryScope = ({ coupon, cartCategoryIds }) => {
  const scope = coupon.categoryScope || "ALL";
  if (scope === "ALL") return { ok: true };

  const couponCatIds = new Set((coupon.categories || []).map((x) => x.categoryId));
  const cartSet = new Set((cartCategoryIds || []).map((x) => Number(x)).filter(Boolean));

  // If scope is INCLUDE/EXCLUDE but coupon has no categories configured => treat as not applicable
  if (couponCatIds.size === 0) {
    return { ok: false, error: "Coupon categories not configured" };
  }

  // If we can't detect cart categories => block (you can loosen this if you want)
  if (cartSet.size === 0) {
    return { ok: false, error: "Order categories not found for validation" };
  }

  if (scope === "INCLUDE") {
    const hasAny = Array.from(cartSet).some((id) => couponCatIds.has(id));
    if (!hasAny) return { ok: false, error: "Coupon not applicable for selected category" };
  }

  if (scope === "EXCLUDE") {
    const blocked = Array.from(cartSet).some((id) => couponCatIds.has(id));
    if (blocked) return { ok: false, error: "Coupon not applicable for selected category" };
  }

  return { ok: true };
};

/* ---------------------------------------------------------
   CREATE COUPON (✅ supports multiple categories)
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
      audience,

      // ✅ NEW
      categoryScope = "ALL", // ALL | INCLUDE | EXCLUDE
      categoryIds = [], // array of category IDs
    } = req.body;

    if (!code || !discountValue || Number(discountValue) <= 0) {
      return res.status(400).json({ error: "Code and positive discount value are required" });
    }

    if (!["percentage", "fixed"].includes(discountType)) {
      return res.status(400).json({ error: "Discount type must be 'percentage' or 'fixed'" });
    }

    const scope = normalizeCategoryScope(categoryScope);
    const catIds = Array.isArray(categoryIds)
      ? categoryIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : [];

    // If INCLUDE/EXCLUDE => must have categoryIds
    if (scope !== "ALL" && catIds.length === 0) {
      return res.status(400).json({ error: "categoryIds required when categoryScope is INCLUDE/EXCLUDE" });
    }

    if (isPatientCoupon) {
      if (!patientId) {
        return res.status(400).json({ error: "patientId is required for patient coupon" });
      }
    } else {
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

        validFrom: isPatientCoupon ? null : validFrom ? new Date(validFrom) : null,
        validUntil: isPatientCoupon ? null : validUntil ? new Date(validUntil) : null,

        usageLimit: usageLimit ? Number(usageLimit) : null,
        perUserLimit: perUserLimit ? Number(perUserLimit) : null,

        autoApply: !!autoApply,
        isActive: true,

        isPatientCoupon: !!isPatientCoupon,
        patientId: isPatientCoupon ? Number(patientId) : null,

        audience: audience || "ALL",
        categoryScope: scope,

        // ✅ create multiple coupon categories
        categories:
          scope === "ALL"
            ? undefined
            : {
                createMany: {
                  data: catIds.map((categoryId) => ({ categoryId })),
                  skipDuplicates: true,
                },
              },

        createdById: req.user.id,
      },
      include: {
        categories: { include: { category: { select: { id: true, name: true } } } },
      },
    });

    return res.status(201).json({ message: "Coupon created successfully", coupon });
  } catch (error) {
    console.error("Error creating coupon:", error);
    return res.status(500).json({ error: "Failed to create coupon" });
  }
};

/* ---------------------------------------------------------
   GET ALL COUPONS (✅ include categories)
--------------------------------------------------------- */
export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({
      include: {
        couponUsages: true,
        categories: { include: { category: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    const cleaned = coupons.map((c) => ({
      ...c,
      usedCount: c.couponUsages.length,
      couponUsages: undefined,
    }));

    res.json(cleaned);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
};

/* ---------------------------------------------------------
   GET COUPON BY ID (✅ include categories)
--------------------------------------------------------- */
export const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({
      where: { id: Number(id) },
      include: {
        couponUsages: {
          include: {
            patient: { select: { id: true, fullName: true, email: true } },
          },
        },
        categories: { include: { category: { select: { id: true, name: true } } } },
      },
    });

    if (!coupon) return res.status(404).json({ error: "Coupon not found" });

    res.json({
      ...coupon,
      usedCount: coupon.couponUsages.length,
    });
  } catch (error) {
    console.error("Error fetching coupon:", error);
    res.status(500).json({ error: "Failed to fetch coupon" });
  }
};

/* ---------------------------------------------------------
   UPDATE COUPON (✅ updates categories safely)
--------------------------------------------------------- */
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const old = await prisma.coupon.findUnique({
      where: { id: Number(id) },
      include: { categories: true },
    });
    if (!old) return res.status(404).json({ error: "Coupon not found" });

    if (data.code && data.code.toUpperCase() !== old.code) {
      const exists = await prisma.coupon.findUnique({
        where: { code: data.code.toUpperCase() },
      });
      if (exists) return res.status(400).json({ error: "Coupon code already exists" });
    }

    // Validate dates
    const nextIsPatientCoupon =
      typeof data.isPatientCoupon === "boolean" ? data.isPatientCoupon : old.isPatientCoupon;

    if (!nextIsPatientCoupon) {
      if (data.validFrom && data.validUntil) {
        if (new Date(data.validUntil) <= new Date(data.validFrom)) {
          return res.status(400).json({ error: "Valid until must be after valid from" });
        }
      }
    }

    // ✅ category update logic
    const scope = data.categoryScope ? normalizeCategoryScope(data.categoryScope) : old.categoryScope;
    const catIds = Array.isArray(data.categoryIds)
      ? data.categoryIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : null; // null => not changing categories

    if (data.categoryScope && scope !== "ALL" && (!catIds || catIds.length === 0)) {
      return res.status(400).json({ error: "categoryIds required when categoryScope is INCLUDE/EXCLUDE" });
    }

    // If scope changed to ALL => clear mappings
    const shouldClearCategories = data.categoryScope && scope === "ALL";

    // If categoryIds provided => replace mappings
    const shouldReplaceCategories = Array.isArray(catIds);

    const updated = await prisma.$transaction(async (tx) => {
      // delete mappings if needed
      if (shouldClearCategories || shouldReplaceCategories) {
        await tx.couponCategory.deleteMany({
          where: { couponId: Number(id) },
        });
      }

      // create new mappings if replacing and scope != ALL
      if (shouldReplaceCategories && scope !== "ALL") {
        await tx.couponCategory.createMany({
          data: catIds.map((categoryId) => ({
            couponId: Number(id),
            categoryId,
          })),
          skipDuplicates: true,
        });
      }

      // update coupon main fields
      const up = await tx.coupon.update({
        where: { id: Number(id) },
        data: {
          ...data,

          code: data.code ? data.code.toUpperCase() : old.code,
          discountValue: data.discountValue != null ? Number(data.discountValue) : old.discountValue,
          minOrderAmount: data.minOrderAmount != null ? Number(data.minOrderAmount) : old.minOrderAmount,
          maxDiscount: data.maxDiscount != null ? Number(data.maxDiscount) : old.maxDiscount,

          categoryScope: scope,

          validFrom: nextIsPatientCoupon
            ? null
            : data.validFrom
            ? new Date(data.validFrom)
            : old.validFrom,

          validUntil: nextIsPatientCoupon
            ? null
            : data.validUntil
            ? new Date(data.validUntil)
            : old.validUntil,

          patientId: nextIsPatientCoupon ? Number(data.patientId || old.patientId) : null,
        },
        include: {
          categories: { include: { category: { select: { id: true, name: true } } } },
        },
      });

      return up;
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

    // if you didn’t set onDelete Cascade properly, deleting mappings first is safe
    await prisma.couponCategory.deleteMany({ where: { couponId: Number(id) } });

    await prisma.coupon.delete({
      where: { id: Number(id) },
    });

    res.json({ message: "Coupon deleted successfully" });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    res.status(500).json({ error: "Failed to delete coupon" });
  }
};

/* ---------------------------------------------------------
   GET ACTIVE COUPONS FOR PATIENT (✅ include categories)
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
          { isPatientCoupon: true, patientId: Number(patientId) },
          {
            isPatientCoupon: false,
            AND: [
              { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
              { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
              {
                OR: [{ audience: "ALL" }, { audience: patientType }],
              },
            ],
          },
        ],
      },
      include: {
        couponUsages: { where: { patientId: Number(patientId) } },
        categories: { include: { category: { select: { id: true, name: true } } } },
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
   APPLY COUPON (✅ validates categoryScope)
   - Prefer passing currentOrderId (so backend derives categories)
   - Fallback: pass categoryIds from frontend
--------------------------------------------------------- */
export const applyCoupon = async (req, res) => {
  try {
    const { code, patientId, orderAmount, currentOrderId, categoryIds } = req.body;

    if (!code || !patientId || !orderAmount) {
      return res.status(400).json({ error: "code, patientId, orderAmount are required" });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        categories: { select: { categoryId: true } },
      },
    });
    if (!coupon) return res.status(404).json({ error: "Invalid coupon" });

    // patient coupon validation
    if (coupon.isPatientCoupon && Number(coupon.patientId) !== Number(patientId)) {
      return res.status(400).json({ error: "This coupon is not valid for this patient" });
    }

    // audience + date validation
    if (!coupon.isPatientCoupon) {
      const patientType = await getPatientType(patientId);
      if (coupon.audience !== "ALL" && coupon.audience !== patientType) {
        return res.status(400).json({
          error: `Coupon only for ${coupon.audience.replace("_", " ").toLowerCase()}`,
        });
      }

      const now = new Date();
      if (coupon.validFrom && now < coupon.validFrom) return res.status(400).json({ error: "Coupon not yet valid" });
      if (coupon.validUntil && now > coupon.validUntil) return res.status(400).json({ error: "Coupon expired" });
    }

    // min order
    if (coupon.minOrderAmount && Number(orderAmount) < coupon.minOrderAmount) {
      return res.status(400).json({ error: `Minimum order amount is ₹${coupon.minOrderAmount}` });
    }

    // ✅ category scope validation
    let cartCategoryIds = [];

    // prefer derive from order
    if (currentOrderId) {
      cartCategoryIds = await getOrderCategoryIds(currentOrderId);
    }

    // fallback from FE if order not passed
    if ((!cartCategoryIds || cartCategoryIds.length === 0) && Array.isArray(categoryIds)) {
      cartCategoryIds = categoryIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);
    }

    const catCheck = validateCouponCategoryScope({ coupon, cartCategoryIds });
    if (!catCheck.ok) {
      return res.status(400).json({ error: catCheck.error });
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
        ? Number(coupon.discountValue)
        : Math.min((amt * Number(coupon.discountValue)) / 100, coupon.maxDiscount || Infinity);

    discount = Math.min(discount, amt);
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
      where: { id: Number(id) },
    });

    if (!coupon) return res.status(404).json({ error: "Coupon not found" });

    const updated = await prisma.coupon.update({
      where: { id: Number(id) },
      data: { isActive: !coupon.isActive },
    });

    res.json({
      message: `Coupon ${updated.isActive ? "activated" : "deactivated"} successfully`,
      coupon: updated,
    });
  } catch (error) {
    console.error("Error toggling coupon:", error);
    res.status(500).json({ error: "Failed to toggle status" });
  }
};