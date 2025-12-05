import { PrismaClient } from "@prisma/client";
import { uploadToS3 } from "../../config/s3.js";
import locationService from "../location/location.service.js";
import { broadcastNewOrder } from "../../services/location.service.js";
import redis from "../../config/redis.js";

const prisma = new PrismaClient();

export const bookSlot = async (slotId, orderDate) => {
  // Ensure orderDate is a Date object
  const dateObj = new Date(orderDate);

  if (isNaN(dateObj)) {
    throw new Error("Invalid orderDate format");
  }

  // Normalize date to remove time
  const dateOnly = new Date(dateObj);
  dateOnly.setHours(0, 0, 0, 0);

  console.log("slotId", slotId);
  // 1. Fetch slot
  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
  });

  if (!slot) throw new Error("Slot not found");

  // 2. Find existing OrderSlot
  let record = await prisma.orderSlot.findFirst({
    where: {
      slotId,
      date: dateOnly,
    },
  });

  // 3. Create new record if none exists
  if (!record) {
    await prisma.orderSlot.create({
      data: {
        slotId,
        date: dateOnly,
        count: 1,
      },
    });
    return { success: true };
  }

  // 4. If full → error
  if (record.count >= slot.capacity) {
    throw new Error("Slot is already full");
  }

  // 5. Increment count
  await prisma.orderSlot.update({
    where: { id: record.id },
    data: {
      count: { increment: 1 },
    },
  });

  return { success: true };
};

export const createOrder = async (req, res) => {
  try {
    const {
      orderType,
      addressId,
      patientId,
      totalAmount,
      discount,
      finalAmount,
      testType,
      slot,
      date,
      doctorId,
      isSelf,
      members,
      paymentStatus,
      merchantOrderId,
      slotId,
      isHomeSample,
    } = req.body;

    if (!members || members.length === 0) {
      return res.status(400).json({ error: "Members list is required" });
    }

    /* ---------------------------------------------
       1️⃣ CHECK SLOT BEFORE ORDER CREATION
    --------------------------------------------- */
    try {
      await bookSlot(slotId, date);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "Slot full or invalid",
      });
    }

    /* ---------------------------------------------
       2️⃣ CREATE ORDER
    --------------------------------------------- */
    const order = await prisma.order.create({
      data: {
        orderNumber: "ORD-" + Date.now(),
        orderType,
        addressId,
        patientId,
        totalAmount,
        discount,
        finalAmount,
        doctorId,
        isSelf,
        testType,
        slot,
        date: new Date(date),
        status: "pending",
        paymentStatus: paymentStatus || "pending",
        merchantOrderId,
        isHomeSample,
      },
    });

    /* ---------------------------------------------
       3️⃣ ADD MEMBERS (packages + tests)
    --------------------------------------------- */
    for (const m of members) {
      const orderMember = await prisma.orderMember.create({
        data: {
          orderId: order.id,
          patientId: m.patientId,
        },
      });

      if (Array.isArray(m.packages)) {
        for (const pkgId of m.packages) {
          await prisma.orderMemberPackage.create({
            data: {
              orderMemberId: orderMember.id,
              packageId: Number(pkgId),
            },
          });
        }
      }

      if (Array.isArray(m.tests)) {
        for (const testId of m.tests) {
          await prisma.orderMemberPackage.create({
            data: {
              orderMemberId: orderMember.id,
              testId: Number(testId),
            },
          });
        }
      }
    }

    /* ---------------------------------------------
       4️⃣ ADDRESS
    --------------------------------------------- */
    const address = await prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address) return res.status(400).json({ error: "Address not found" });

    const lat = Number(address.latitude);
    const lng = Number(address.longitude);

    const orderForBroadcast = {
      orderId: order.id,
      pincode: address.pincode?.toString(),
      latitude: lat,
      longitude: lng,
      slot,
      date,
      testType,
      radiusKm: 5,
      status: "pending",
    };

    /* ---------------------------------------------
       5️⃣ CONDITIONS TO BROADCAST:
       ✔ Today’s Order Only
       ✔ testType MUST BE "Pathology"
    --------------------------------------------- */
    const orderDate = new Date(date);
    const today = new Date();

    const isToday =
      orderDate.getFullYear() === today.getFullYear() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getDate() === today.getDate();

    const io = req.app.get("io");

    if (io && isToday && testType === "Pathology") {
      await broadcastNewOrder(io, {
        id: order.id,
        slot,
        date: orderDate,
        testType,
        address: {
          latitude: lat,
          longitude: lng,
          pincode: orderForBroadcast.pincode,
        },
        radiusKm: 5,
      });

      io.emit("orderCreatedServer", { orderId: order.id });
    }

    /* ---------------------------------------------
       6️⃣ SAVE IN REDIS
    --------------------------------------------- */
    await redis.hSet(`order:${order.id}`, {
      orderId: order.id.toString(),
      pincode: orderForBroadcast.pincode || "",
      latitude: lat.toString(),
      longitude: lng.toString(),
      slot: slot || "",
      date: orderDate.toISOString(),
      testType,
      status: "pending",
    });

    return res.json({
      success: true,
      message: "Order created successfully",
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
  } catch (err) {
    console.error("Order creation error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

export const createAdminOrder = async (req, res) => {
  try {
    const {
      patientId,
      selectedTests,
      addressId,
      homeCollection,
      collectionCenterId,
      registrationType,
      referredBy,
      provisionalDiagnosis,
      notes,
      remark
    } = req.body;

    if (!patientId || !selectedTests || selectedTests.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Patient & tests required",
      });
    }

    // generate order number
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = await prisma.order.count({
      where: { orderNumber: { startsWith: `ORD${today}` } }
    });

    const orderNumber = `ORD${today}${String(count + 1).padStart(4, "0")}`;
    const totalAmount = selectedTests.reduce((s, t) => s + Number(t.price), 0);

    /* -----------------------------------------
       1️⃣ CREATE ORDER
    ------------------------------------------ */
    const order = await prisma.order.create({
      data: {
        orderNumber,
        patient: { connect: { id: Number(patientId) } },
        address: { connect: { id: Number(addressId || 1) } },

        orderType: registrationType,
        
        totalAmount,
        finalAmount: totalAmount,
        status: "confirmed",
        paymentStatus: "paid",
        paymentMode: "cash",
        date: new Date(),
        isHomeSample: homeCollection,

        remarks: [provisionalDiagnosis, notes, remark]
          .filter(Boolean)
          .join(" | "),
      },
    });

    /* -----------------------------------------
       2️⃣ CREATE ORDER MEMBER (PRIMARY MEMBER)
    ------------------------------------------ */
    const orderMember = await prisma.orderMember.create({
      data: {
        orderId: order.id,
        patientId: Number(patientId),
     
      },
    });

    /* -----------------------------------------
       3️⃣ INSERT TESTS / PACKAGES LIKE CUSTOMER FLOW
    ------------------------------------------ */

    for (const test of selectedTests) {
      await prisma.orderMemberPackage.create({
        data: {
          orderMemberId: orderMember.id,
          testId: Number(test.id), // correct relation
        },
      });
    }

    return res.json({
      success: true,
      message: "Order created successfully",
      order,
    });

  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({
      success: false,
      message: "Order failed",
      error: error.message,
    });
  }
};



export const acceptOrderByVendor = async (req, res) => {
  try {
    const { orderId, vendorId } = req.body;

    if (!orderId || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "orderId and vendorId are required",
      });
    }

    const io = req.app.get("io");

    /* --------------------------------------------------------
       🔥 STEP 1 — Get order details (slot + date)
    ---------------------------------------------------------*/
    const orderDetails = await prisma.order.findUnique({
      where: { id: Number(orderId) },
      select: {
        id: true,
        date: true,
        slot: true,
        vendorId: true,
      },
    });

    if (!orderDetails)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    if (orderDetails.vendorId)
      return res
        .status(400)
        .json({ success: false, message: "Order already accepted" });

    /* --------------------------------------------------------
       🔥 STEP 2 — Check slot conflict (same vendor, same date & slot)
    ---------------------------------------------------------*/
    const conflict = await prisma.order.findFirst({
      where: {
        vendorId: Number(vendorId),
        date: orderDetails.date,
        slot: orderDetails.slot,
        status: { in: ["accepted", "assigned", "on_the_way"] },
      },
    });

    if (conflict) {
      return res.status(400).json({
        success: false,
        message: `You already accepted another job for this same date & slot`,
      });
    }

    /* --------------------------------------------------------
       🔥 STEP 3 — Atomic order acceptance
    ---------------------------------------------------------*/
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { id: Number(orderId) },
        select: { vendorId: true },
      });

      if (existing.vendorId) {
        throw new Error("Order already accepted");
      }

      return await tx.order.update({
        where: { id: Number(orderId) },
        data: {
          vendorId: Number(vendorId),
          status: "accepted",
        },
        include: {
          patient: true,
          address: true,
        },
      });
    });

    /* --------------------------------------------------------
       🔥 STEP 4 — Remove from Redis pending pool
    ---------------------------------------------------------*/
    await redis.del(`order:${orderId}`);

    /* --------------------------------------------------------
       🔥 STEP 5 — Notify vendor + remove from other vendors
    ---------------------------------------------------------*/

    // Notify THIS vendor
    io.to(`vendor_${vendorId}`).emit("orderAccepted", {
      orderId,
      vendorId,
      order: result,
    });

    // Notify ALL vendors → remove job from job list
    io.emit("orderRemoved", { orderId });

    return res.json({
      success: true,
      message: "Order accepted successfully",
      order: result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to accept order",
    });
  }
};

/* ------------------------- VENDOR ACCEPTS AND STARTS JOB ------------------------- */
export const vendorStartJob = async (req, res) => {
  // NOTE: vendorId is pulled from the request body for this example
  try {
    const { orderId } = req.params;
    const { userLatitude, userLongitude, vendorId } = req.body;

    if (!vendorId || !userLatitude || !userLongitude) {
      return res
        .status(400)
        .json({ error: "Vendor ID and patient coordinates are required." });
    }

    const vendorIdNumber = Number(vendorId);
    const orderIdNumber = Number(orderId);

    // 1. Assign the vendor to the order and update status to 'ASSIGNED'
    const order = await prisma.order.update({
      where: { id: orderIdNumber },
      data: {
        vendorId: vendorIdNumber,
        status: "ASSIGNED", // Set initial assignment status
      },
      select: { id: true, vendorId: true },
    });

    // 2. Start location tracking (This handles the ON_THE_WAY status update and upsert)
    const tracking = await locationService.startOrderTracking(
      order.id,
      order.vendorId,
      parseFloat(userLatitude),
      parseFloat(userLongitude)
    );

    // 3. Emit socket event
    const io = req.app.get("io");

    if (io) {
      io.to(`order_${order.id}`).emit("trackingStarted", {
        orderId: order.id,
        vendorId: order.vendorId,
        startTime: tracking.startTime,
      });
    }

    res.json({
      success: true,
      message: "Job started and tracking initiated.",
      orderId: order.id,
      tracking,
    });
  } catch (error) {
    console.error("Error starting vendor job:", error);
    res.status(500).json({
      success: false,
      error: "Failed to start vendor job and tracking: " + error.message,
    });
  }
};

export const rejectOrderByVendor = async (req, res) => {
  try {
    const { orderId, vendorId, reason } = req.body;

    if (!orderId || !vendorId || !reason) {
      return res.status(400).json({
        success: false,
        message: "orderId, vendorId, and reason are required",
      });
    }

    const orderIdNum = Number(orderId);
    const vendorIdNum = Number(vendorId);

    // Validate numeric IDs
    if (isNaN(orderIdNum) || isNaN(vendorIdNum)) {
      return res.status(400).json({
        success: false,
        message: "orderId and vendorId must be valid numbers",
      });
    }

    // Check order exists
    const order = await prisma.order.findUnique({ where: { id: orderIdNum } });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Check vendor exists
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorIdNum },
    });
    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    // Prevent duplicate reject
    const existing = await prisma.vendorOrderRejection.findFirst({
      where: { orderId: orderIdNum, vendorId: vendorIdNum },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Order already rejected by vendor",
      });
    }

    // Store rejection in DB
    await prisma.vendorOrderRejection.create({
      data: { vendorId: vendorIdNum, orderId: orderIdNum, reason },
    });

    /* ---------------------------------------------------
       🚫 Mark vendor as rejected for this order (Redis)
    ---------------------------------------------------- */
    await redis.sAdd(`rejected:${orderIdNum}`, String(vendorIdNum));

    // Optional expiry (you can remove this if rejections must be permanent)
    await redis.expire(`rejected:${orderIdNum}`, 3600 * 6);

    /* ---------------------------------------------------
       🔥 Socket: Remove from vendor UI instantly
    ---------------------------------------------------- */
    const io = req.app.get("io");
    if (io) {
      io.to(`vendor_${vendorIdNum}`).emit("removeOrderFromList", {
        orderId: orderIdNum,
      });
    }

    return res.json({
      success: true,
      message: "Order rejected successfully",
    });
  } catch (err) {
    console.error("Reject Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to reject order",
    });
  }
};

/* ------------------------- UPDATE DOCUMENT IMAGE ------------------------- */
export const updateDocumentImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file)
      return res.status(400).json({ error: "No document file provided" });

    // Upload to S3
    const documentImage = await uploadToS3(req.file, "order-documents");

    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: {
        documentImage,
        sampleCollected: true,
        status: "sample_collected",
      },
    });

    res.json({
      message: "Document image updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Error updating document image:", error);
    res.status(500).json({ error: "Failed to update document image" });
  }
};

export const getOrdersByPatientId = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { patientId },
          { orderMembers: { some: { patientId } } }, // order includes patient as member
        ],
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            contactNo: true,
          },
        },
        address: true,
        vendor: true,

        orderMembers: {
          where: {
            patientId: patientId,
          },
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                email: true,
                contactNo: true,
              },
            },
            packages: {
              include: {
                package: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    actualPrice: true,
                    offerPrice: true,
                    imgUrl: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

export const getOrdersByPrimaryPatientId = async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);

    const orders = await prisma.order.findMany({
      where: {
        patientId: patientId, // ONLY primary patient
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            contactNo: true,
          },
        },
        address: true,
        vendor: true,
        orderMembers: {
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                email: true,
                contactNo: true,
              },
            },
            packages: {
              include: {
                package: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    actualPrice: true,
                    offerPrice: true,
                    imgUrl: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({ success: true, orders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch primary patient orders" });
  }
};

/* ------------------------- GET ALL ORDERS ------------------------- */
export const getAllOrders = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", status = "" } = req.query;

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    let where = {};

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { trackingId: { contains: search, mode: "insensitive" } },
        { patient: { fullName: { contains: search, mode: "insensitive" } } },
        { patient: { contactNo: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (status && status !== "all") {
      where.status = status;
    }

    const orders = await prisma.order.findMany({
      where,
      skip,
      take: limit,
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            contactNo: true,
          },
        },
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            // Remove contactNo since it doesn't exist in your model
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const total = await prisma.order.count({ where });
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      orders,
      meta: {
        currentPage: page,
        totalPages,
        total,
        perPage: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch orders",
    });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const orderId = Number(id);
    if (isNaN(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    /* --------------------------------------------------------------------
       🔥 FETCH ORDER WITH FULL DETAILS (same structure as getOrdersByVendor)
    --------------------------------------------------------------------- */
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            contactNo: true,
            dob: true,
            age: true,
            gender: true,
            bloodType: true,
            height: true,
            weight: true,
            smokingHabit: true,
            alcoholConsumption: true,
            exerciseFrequency: true,
          },
        },
        address: {
          select: {
            id: true,
            city: true,
            state: true,
            pincode: true,
            landmark: true,
            latitude: true,
            longitude: true,
          },
        },

        vendor: {
          select: {
            id: true,
            name: true,
            number: true,
            city: true,
          },
        },

        center: {
          select: {
            id: true,
            name: true,
          },
        },

        /* --------------------------------------------------------------
           🔥 Members + their tests + their packages
        -------------------------------------------------------------- */
        orderMembers: {
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                gender: true,
                contactNo: true,
              },
            },

            orderMemberPackages: {
              include: {
                test: {
                  select: {
                    id: true,
                    name: true,
                    actualPrice: true,
                    sampleRequired: true,
                    preparations: true,
                    discount: true,
                  },
                },
                package: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    imgUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order details",
    });
  }
};

/* ------------------------- UPDATE ORDER STATUS ------------------------- */
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, sampleCollected, reportReady, reportUrl } =
      req.body;

    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: {
        status,
        paymentStatus,
        sampleCollected: sampleCollected === "true",
        reportReady: reportReady === "true",
        reportUrl,
      },
    });

    res.json({ message: "Order updated successfully", order });
  } catch (error) {
    res.status(500).json({ error: "Failed to update order" });
  }
};

export const updateAssignvendor = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId } =
      req.body;

    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: {
        vendorId,
      
      },
    });

    res.json({ message: "Order updated successfully", order });
  } catch (error) {
    res.status(500).json({ error: "Failed to update order" });
  }
};

/* ------------------------- CANCEL ORDER ------------------------- */
export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelledBy } = req.body;

    const order = await prisma.order.update({
      where: { id: Number(id) },
      data: {
        status: "cancelled",
        cancelledBy,
        cancelledAt: new Date(),
      },
    });

    res.json({ message: "Order cancelled successfully", order });
  } catch (error) {
    res.status(500).json({ error: "Failed to cancel order" });
  }
};

export const getOrdersByVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { status } = req.query;

    const id = Number(vendorId);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendorId",
      });
    }

    // Check vendor exists
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        number: true,
        city: true,
        status: true,
      },
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    /* ---------------------------------------------------------
       STATUS FILTER LOGIC
    ---------------------------------------------------------- */

    let statusFilter;

    if (!status) {
      // Default: return everything except completed
      statusFilter = { not: "completed" };
    } else {
      // When status query provided
      const statusList = status.split(",").map((s) => s.trim());

      if (statusList.length === 1) {
        statusFilter = statusList[0]; // exact match
      } else {
        statusFilter = { in: statusList }; // multiple match
      }
    }

    /* ---------------------------------------------------------
       FETCH ORDERS
    ---------------------------------------------------------- */
    const orders = await prisma.order.findMany({
      where: {
        vendorId: id,
        status: statusFilter,
      },
      orderBy: { createdAt: "desc" },

      select: {
        id: true,
        slot: true,
        date: true,
        testType: true,
        orderType: true,
        finalAmount: true,
        totalAmount: true,
        discount: true,
        status: true,

        patient: {
          select: {
            id: true,
            fullName: true,
            gender: true,
            contactNo: true,
          },
        },

        address: {
          select: {
            id: true,
            city: true,
            state: true,
            pincode: true,
            landmark: true,
          },
        },

        center: {
          select: {
            id: true,
            name: true,
          },
        },

        orderMembers: {
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                gender: true,
                contactNo: true,
              },
            },
            orderMemberPackages: {
              include: {
                test: {
                  select: {
                    id: true,
                    name: true,
                    actualPrice: true,
                    sampleRequired: true,
                    preparations: true,
                    discount: true,
                  },
                },
                package: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return res.json({
      success: true,
      vendor,
      filterApplied: status || "excluding completed",
      totalOrders: orders.length,
      orders,
    });

  } catch (error) {
    console.error("Error fetching vendor orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor orders",
    });
  }
};


export const getVendorOrdersBasic = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;

    const id = Number(vendorId);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid vendorId",
      });
    }

    // Pagination
    const take = Number(limit) || 10;
    const skip = (Number(page) - 1) * take;

    /* ---------------------------------------------------------
       DATE FILTER LOGIC
    ---------------------------------------------------------- */

    let dateFilter = {};

    if (startDate && endDate) {
      dateFilter = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else if (startDate) {
      dateFilter = {
        gte: new Date(startDate),
      };
    } else if (endDate) {
      dateFilter = {
        lte: new Date(endDate),
      };
    }

    /* ---------------------------------------------------------
       FETCH ORDERS (BASIC FIELDS ONLY)
    ---------------------------------------------------------- */
    const orders = await prisma.order.findMany({
      where: {
        vendorId: id,
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,

      select: {
        id: true,
        date: true,
        createdAt: true,
        status: true,
        testType: true,
        finalAmount:true,

        orderMembers: {
          take: 1, // Only first member
          select: {
            orderMemberPackages: {
              take: 1, // Only one test or package
              select: {
                test: {
                  select: {
                    id: true,
                    name: true,
                    testType: true,
                  },
                },
                package: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Total count for pagination
    const totalCount = await prisma.order.count({
      where: {
        vendorId: id,
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
    });

    return res.json({
      success: true,
      page: Number(page),
      limit: take,
      total: totalCount,
      totalPages: Math.ceil(totalCount / take),
      orders,
    });

  } catch (error) {
    console.error("Error fetching basic vendor orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch vendor basic orders",
    });
  }
};


export const vendorUpdateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, vendorId } = req.body;
    

    if (!status || !vendorId) {
      return res.status(400).json({
        success: false,
        message: "status and vendorId are required in body",
      });
    }

    const allowedStatus = [
      "accepted",
      "on_the_way",
      "reached",
      "sample_collected",
      "completed",
    ];

    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${allowedStatus.join(", ")}`,
      });
    }

    // Check vendor exists
    const vendor = await prisma.vendor.findUnique({
      where: { id: parseInt(vendorId) },
    });

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Get order
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check ownership
    if (order.vendorId !== parseInt(vendorId)) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this order",
      });
    }

    // Prepare update fields
    const updateData = { status };

    // Optional: Timestamp tracking
    if (status === "reached") updateData.reachedAt = new Date();
    if (status === "sample_collected") updateData.sampleCollected = true;
    if (status === "completed") updateData.completedAt = new Date();

    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(orderId) },
      data: updateData,
      include: {
        patient: { select: { fullName: true, contactNo: true } },
        address: true,
      },
    });

    res.json({
      success: true,
      message: "Order status updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Status Update Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update order status",
    });
  }
};
