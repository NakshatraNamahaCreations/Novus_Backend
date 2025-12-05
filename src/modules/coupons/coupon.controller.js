import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ---------------------- CREATE COUPON ---------------------- */
export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      startDate,
      expiryDate,
      usageLimit,
      perUserLimit,
      autoApply,
      createdBy,
    } = req.body;

    if (!code || !discountValue)
      return res.status(400).json({ error: "Code and discount value are required" });

    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) return res.status(400).json({ error: "Coupon code already exists" });

    const coupon = await prisma.coupon.create({
      data: {
        code,
        description,
        discountType: discountType || "percentage",
        discountValue: Number(discountValue),
        minOrderAmount: minOrderAmount ? Number(minOrderAmount) : null,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        startDate: startDate ? new Date(startDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        usageLimit: usageLimit ? Number(usageLimit) : null,
        perUserLimit: perUserLimit ? Number(perUserLimit) : null,
        autoApply: autoApply === "true",
        createdBy,
      },
    });

    res.status(201).json({ message: "Coupon created successfully", coupon });
  } catch (error) {
    console.error("Error creating coupon:", error);
    res.status(500).json({ error: "Failed to create coupon" });
  }
};

/* ---------------------- GET ALL COUPONS ---------------------- */
export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(coupons);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
};

/* ---------------------- GET ACTIVE COUPONS ---------------------- */
export const getActiveCoupons = async (req, res) => {
  try {
    const {patientId} = req.query;
   
    const now = new Date();

    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        AND: [
          {
            OR: [{ startDate: null }, { startDate: { lte: now } }],
          },
          {
            OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        // ✅ load all usages for this patient
        couponUsages:Number(patientId) 
          ? {
              where: { userId: Number(patientId) },
              select: { id: true },
            }
          : false,
      },
    });

    // ✅ Mark whether this patient has used each coupon
    const response = coupons.map((c) => ({
      ...c,
      isUsed: c.couponUsages && c.couponUsages.length > 0,
    }));

    res.json(response);
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
};


/* ---------------------- GET SINGLE COUPON ---------------------- */
export const getCouponByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const { patientId } = req.query; // you can also send this via req.body if you prefer

    // 1️⃣ Find the coupon
    const coupon = await prisma.coupon.findUnique({
      where: { code },
    });

    if (!coupon) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    // 2️⃣ Check coupon validity
    const now = new Date();

    if (!coupon.isActive) {
      return res.status(400).json({ error: "Coupon is inactive" });
    }

    if (coupon.startDate && coupon.startDate > now) {
      return res.status(400).json({ error: "Coupon not yet valid" });
    }

    if (coupon.expiryDate && coupon.expiryDate < now) {
      return res.status(400).json({ error: "Coupon expired" });
    }

    // 3️⃣ Check if patient has already used it (based on CouponUsage)
    let isUsed = false;

    if (patientId) {
      const usage = await prisma.couponUsage.findFirst({
        where: {
          couponId: coupon.id,
          userId: parseInt(patientId),
        },
      });
      isUsed = !!usage;
    }

    // 4️⃣ Return coupon data with usage flag
    res.json({
      ...coupon,
      isUsed,
    });
  } catch (error) {
    console.error("Error fetching coupon:", error);
    res.status(500).json({ error: "Failed to fetch coupon" });
  }
};

/* ---------------------- APPLY COUPON ---------------------- */
export const applyCoupon = async (req, res) => {
  try {
    const { code, userId, orderAmount } = req.body;

    if (!code || !userId || !orderAmount)
      return res.status(400).json({ error: "Missing required fields" });

    const coupon = await prisma.coupon.findUnique({ where: { code } });
    if (!coupon) return res.status(404).json({ error: "Invalid coupon code" });

    // Check active status
    if (!coupon.isActive)
      return res.status(400).json({ error: "Coupon is not active" });

    // Check validity period
    const now = new Date();
    if (coupon.startDate && now < coupon.startDate)
      return res.status(400).json({ error: "Coupon not yet valid" });
    if (coupon.expiryDate && now > coupon.expiryDate)
      return res.status(400).json({ error: "Coupon expired" });

    // Check min order
    if (coupon.minOrderAmount && orderAmount < coupon.minOrderAmount)
      return res.status(400).json({ error: `Minimum order amount is ₹${coupon.minOrderAmount}` });

    // Check usage limits
    const totalUses = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
    if (coupon.usageLimit && totalUses >= coupon.usageLimit)
      return res.status(400).json({ error: "Coupon usage limit reached" });

    const userUses = await prisma.couponUsage.count({
      where: { couponId: coupon.id, userId: Number(userId) },
    });
    if (coupon.perUserLimit && userUses >= coupon.perUserLimit)
      return res.status(400).json({ error: "Coupon already used by this user" });

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === "flat") {
      discount = coupon.discountValue;
    } else {
      discount = (orderAmount * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount)
        discount = coupon.maxDiscount;
    }

    const finalAmount = orderAmount - discount;

    res.json({
      message: "Coupon applied successfully",
      discount,
      finalAmount,
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({ error: "Failed to apply coupon" });
  }
};

/* ---------------------- DEACTIVATE / ACTIVATE COUPON ---------------------- */
export const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await prisma.coupon.findUnique({ where: { id: Number(id) } });
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
    res.status(500).json({ error: "Failed to update coupon status" });
  }
};

/* ---------------------- TRACK COUPON USAGE ---------------------- */
export const recordCouponUsage = async (req, res) => {
  try {
    const { couponId, userId, orderId } = req.body;

    // ✅ Validate coupon and user existence
    const coupon = await prisma.coupon.findUnique({ where: { id: Number(couponId) } });
    if (!coupon) return res.status(404).json({ error: "Invalid couponId" });

    const patient = await prisma.patient.findUnique({ where: { id: Number(userId) } });
    if (!patient) return res.status(404).json({ error: "Invalid userId — patient not found" });

    const usage = await prisma.couponUsage.create({
      data: {
        couponId: Number(couponId),
        userId: Number(userId),
        orderId: orderId ? Number(orderId) : null,
      },
    });

    res.status(201).json({ message: "Coupon usage recorded", usage });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to record coupon usage" });
  }
};

