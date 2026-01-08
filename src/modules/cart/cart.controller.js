import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

/* -------------------------------------------------------
   🔧 Helper: Recalculate Cart Totals
--------------------------------------------------------*/
async function updateCartTotals(cartId) {
  const items = await prisma.cartItem.findMany({
    where: { cartId, isSelected: true }
  });

  const subtotal = items.reduce((sum, i) => sum + i.offerPrice, 0);
  const discount = 0;
  const finalAmount = subtotal - discount;

  await prisma.cart.update({
    where: { id: cartId },
    data: { subtotal, discount, finalAmount }
  });
}


/* -------------------------------------------------------
   🟢 1. Add Item to Cart
--------------------------------------------------------*/
export const addToCart = async (req, res) => {
  try {
    const {
      patientId,
      memberId,
      name,
      testType,
      offerPrice,
      testId,
      healthPackageId
    } = req.body;

    if (!patientId || !memberId || !offerPrice) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 🔥 Validate patient
    const patient = await prisma.patient.findUnique({
      where: { id: patientId }
    });
    if (!patient) return res.status(404).json({ error: "Patient does not exist" });

    // 🔥 Validate member
    const member = await prisma.patient.findUnique({
      where: { id: memberId }
    });
    if (!member) return res.status(404).json({ error: "Member does not exist" });

    // ❌ Avoid both test + healthPackage
    if (testId && healthPackageId) {
      return res.status(400).json({
        error: "Choose either testId or healthPackageId"
      });
    }

    if (!testId && !healthPackageId) {
      return res.status(400).json({
        error: "Either testId or healthPackageId is required"
      });
    }

    // 🔥 Validate REAL test
    if (testId) {
      const t = await prisma.test.findUnique({
        where: { id: Number(testId) }
      });
      if (!t) return res.status(400).json({ error: `Invalid testId ${testId}` });
    }

    // 🔥 Validate REAL HealthPackage
    if (healthPackageId) {
      const hp = await prisma.healthPackage.findUnique({
        where: { id: Number(healthPackageId) }
      });
      if (!hp)
        return res.status(400).json({ error: `Invalid healthPackageId ${healthPackageId}` });
    }

    // 🛒 Get/create active cart
    let cart = await prisma.cart.findFirst({
      where: { patientId, status: "active" }
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          patientId,
          subtotal: 0,
          finalAmount: 0,
          discount: 0
        }
      });
    }

    // ❗ DUPLICATE CHECK
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        patientId: memberId,
        ...(testId ? { testId: Number(testId) } : {}),
        ...(healthPackageId ? { packageId: Number(healthPackageId) } : {})
      }
    });

    if (existingItem) {
      return res.status(400).json({
        error: "This item is already added for this member"
      });
    }

    // ➕ Add item
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        patientId: memberId,
        name,
        testType,
        offerPrice: Number(offerPrice),
        testId: testId ? Number(testId) : null,
        packageId: healthPackageId ? Number(healthPackageId) : null
      }
    });

    await updateCartTotals(cart.id);

    return res.json({ success: true, message: "Item added to cart" });

  } catch (err) {
    console.error("ADD TO CART ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


/* -------------------------------------------------------
   🟡 2. Get Cart
--------------------------------------------------------*/
export const getCart = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);

    const cart = await prisma.cart.findFirst({
      where: { patientId, status: "active" },
      include: {
        patient: { select: { fullName: true, age: true } },
        cartItems: {
          include: {
            test: true, // single test cart item
            package: {
              include: {
                checkupPackages: {
                  include: {
                    test: {select:{
                      id:true
                    }}, // ✅ tests inside package
                  },
                },
              },
            },
          },
        },
      },
    });

    return res.json(cart ?? { cart: null, items: [] });
  } catch (err) {
    console.error("GET CART ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


export const getAllCarts = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      fromDate,
      toDate,
      status
    } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    const where = {};

    // ✅ Status filter
    if (status) {
      where.status = status;
    }

    // ✅ Search by patient name / phone
    if (search) {
      where.patient = {
        OR: [
          {
            fullName: {
              contains: search,
              mode: "insensitive"
            }
          },
          {
            contactNo: {
              contains: search,
              mode: "insensitive"
            }
          }
        ]
      };
    }

    // ✅ Date-wise filter
    if (fromDate || toDate) {
      where.createdAt = {};

      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }

      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // ✅ Fetch carts
    const carts = await prisma.cart.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            contactNo: true,
            age: true
          }
        },
        cartItems: {
          include: {
            test: true,
            package: true
          }
        }
      }
    });

    // ✅ Total count
    const total = await prisma.cart.count({ where });

    return res.json({
      success: true,
      data: carts,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total,
        perPage: limit
      }
    });

  } catch (err) {
    console.error("GET ALL CARTS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch carts"
    });
  }
};


/* -------------------------------------------------------
   🔴 3. Remove Item
--------------------------------------------------------*/
export const removeCartItem = async (req, res) => {
  try {
    const { cartItemId } = req.body;

    const item = await prisma.cartItem.findUnique({
      where: { id: Number(cartItemId) }
    });

    if (!item) return res.status(404).json({ error: "Cart item not found" });

    await prisma.cartItem.delete({ where: { id: Number(cartItemId) } });

    await updateCartTotals(item.cartId);

    return res.json({ success: true, message: "Item removed" });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
};


/* -------------------------------------------------------
   🔥 4. Clear Cart
--------------------------------------------------------*/
export const clearCart = async (req, res) => {
  try {
    const { patientId } = req.body;

    const cart = await prisma.cart.findFirst({
      where: { patientId, status: "active" }
    });

    if (!cart) return res.json({ message: "Cart already empty" });

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    await prisma.cart.update({
      where: { id: cart.id },
      data: { subtotal: 0, discount: 0, finalAmount: 0 }
    });

    return res.json({ success: true, message: "Cart cleared" });

  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
};


/* -------------------------------------------------------
   🛒 5. Checkout → Create Order
--------------------------------------------------------*/
export const checkoutCart = async (req, res) => {
  try {
    const { patientId, addressId, slot, date, orderType } = req.body;

    const cart = await prisma.cart.findFirst({
      where: { patientId, status: "active" },
      include: { cartItems: true }
    });

    if (!cart || cart.cartItems.length === 0)
      return res.status(400).json({ error: "Cart is empty" });

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber: "ORD-" + Date.now(),
        patientId,
        addressId,
        slot,
        date: new Date(date),
        orderType,
        testType: "mixed",
        totalAmount: cart.subtotal,
        finalAmount: cart.finalAmount,
        discount: cart.discount,
        status: "pending"
      }
    });

    // Insert tests & health packages into OrderMember + OrderMemberPackage
    const orderMember = await prisma.orderMember.create({
      data: {
        orderId: order.id,
        patientId
      }
    });

    for (const item of cart.cartItems) {
      if (item.testId) {
        await prisma.orderMemberPackage.create({
          data: {
            orderMemberId: orderMember.id,
            packageId: item.testId
          }
        });
      }

      if (item.packageId) {
        await prisma.orderCheckup.create({
          data: {
            orderId: order.id,
            checkupId: item.packageId   // healthPackage
          }
        });
      }
    }

    // mark cart as booked
    await prisma.cart.update({
      where: { id: cart.id },
      data: { status: "booked" }
    });

    return res.json({
      success: true,
      message: "Order created",
      orderId: order.id
    });

  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


/* -------------------------------------------------------
   🗑 6. Delete all items for a Member
--------------------------------------------------------*/
export const deleteAllItemsByPatient = async (req, res) => {
  try {
    const memberId = Number(req.params.patientId);
    const ownerId = Number(req.params.userId);

    const cart = await prisma.cart.findFirst({
      where: { patientId: ownerId, status: "active" }
    });

    if (!cart) return res.json({ success: true, message: "No active cart" });

    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id, patientId: memberId }
    });

    await updateCartTotals(cart.id);

    return res.json({
      success: true,
      message: "Deleted all items for this member"
    });

  } catch (err) {
    console.error("DELETE CART ITEMS ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


/* -------------------------------------------------------
   🗑 7. Delete whole cart
--------------------------------------------------------*/
export const deleteCartCompletely = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);

    const cart = await prisma.cart.findFirst({
      where: { patientId, status: "active" }
    });

    if (!cart) {
      return res.json({ success: true, message: "Cart does not exist" });
    }

    await prisma.cart.delete({
      where: { id: cart.id }
    });

    return res.json({ success: true, message: "Cart deleted" });

  } catch (err) {
    console.error("DELETE CART ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


/* -------------------------------------------------------
   🟢 8. Update Member Selection
--------------------------------------------------------*/
export const updateMemberSelection = async (req, res) => {
  try {
    const { cartId, memberId, isSelected } = req.body;

    if (!cartId || !memberId || isSelected === undefined) {
      return res.status(400).json({ error: "Missing fields" });
    }

    await prisma.cartItem.updateMany({
      where: { cartId, patientId: memberId },
      data: { isSelected }
    });

    await updateCartTotals(cartId);

    return res.json({
      success: true,
      message: `Member items marked as ${isSelected ? "selected" : "unselected"}`
    });

  } catch (err) {
    console.error("UPDATE MEMBER SELECTION ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
