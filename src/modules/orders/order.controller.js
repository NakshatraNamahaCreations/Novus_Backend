import { PrismaClient } from "@prisma/client";
import { uploadToS3 } from "../../config/s3.js";
import locationService from "../location/location.service.js";
import { broadcastNewOrder } from "../../services/location.service.js";
import redis from "../../config/redis.js";
import dayjs from "dayjs";
import { bookSlotTx } from "../../utils/bookSlotTx.js";
import { whatsappQueue } from "../../queues/whatsapp.queue.js";
import { acquireLock } from "../../utils/redisLock.js";

const prisma = new PrismaClient();


const formatTime = (date) =>
  dayjs(date).format("hh:mm A");


export const createOrder = async (req, res) => {
  let lock;

  try {
    const {
      source,
      addressId,
      patientId,
      totalAmount,
      discount,
      finalAmount,
      testType,
      date,
      doctorId,
      isSelf,
      members,
      paymentStatus,
      merchantOrderId,
      slotId,
      isHomeSample,
      centerId,
    } = req.body;

    if (!members?.length) {
      return res.status(400).json({ error: "Members required" });
    }

    const orderDate = new Date(date);
    if (isNaN(orderDate)) {
      return res.status(400).json({ error: "Invalid date" });
    }

    /* 🔐 REDIS LOCK (slot + date) */
    const lockKey = `lock:slot:${slotId}:${dayjs(orderDate).format(
      "YYYY-MM-DD"
    )}`;
    lock = await acquireLock(lockKey);

    /* 🧠 DB TRANSACTION */
    const order = await prisma.$transaction(async (tx) => {
      await bookSlotTx(tx, slotId, orderDate);

      const createdOrder = await tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          source,
          addressId,
          patientId,
          totalAmount,
          discount,
          finalAmount,
          doctorId,
          isSelf,
          testType,
          date: orderDate,
          status: "pending",
          paymentStatus: paymentStatus || "pending",
          merchantOrderId,
          isHomeSample,
          centerId,
          slotId,
        },
      });

      await tx.payment.create({
        data: {
          orderId: createdOrder.id,
          patientId,
          paymentId: `PAY-${Date.now()}`,
          paymentMethod: "UPI",
          paymentMode: "ONLINE",
          paymentStatus: "COMPLETED",
          amount: finalAmount,
          currency: "INR",
          paymentDate: new Date(),
        },
      });

      return createdOrder;
    });

    /* 👥 MEMBERS (FAST BULK INSERT) */
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

     /*  SOCKET */
    const address = await prisma.address.findUnique({
      where: { id: addressId },
    });


       const slotData = await prisma.slot.findUnique({
      where: { id: slotId },
    });


    if (!address) return res.status(400).json({ error: "Address not found" });

    const lat = Number(address.latitude);
    const lng = Number(address.longitude);

    const orderForBroadcast = {
      orderId: order.id,
      pincode: address.pincode?.toString(),
      latitude: lat,
      longitude: lng,
      slot: `${formatTime(slotData.startTime)} - ${formatTime(slotData.endTime)}`,
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
  
    const today = new Date();

    const isToday =
      orderDate.getFullYear() === today.getFullYear() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getDate() === today.getDate();

    const io = req.app.get("io");

    if (io && isToday && testType === "PATHOLOGY") {

     
      await broadcastNewOrder(io, {
        id: order.id,
        slot:`${formatTime(slotData.startTime)} - ${formatTime(slotData.endTime)}`,
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




    /* 🟢 REDIS CACHE */
    await redis.hSet(`order:${order.id}`, {
      orderId: order.id.toString(),
      slotId: slotId.toString(),
      date: orderDate.toISOString(),
      status: "pending",
    });

    /* 🚀 RESPOND IMMEDIATELY */
    res.json({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
    });

    /* 🟢 BACKGROUND: WhatsApp (enqueue minimal data only) */
    await whatsappQueue.add(
      "ORDER_CONFIRMED",
      {
        orderId: order.id,
      },
      {
        jobId: `wa-order-${order.id}`,
        removeOnComplete: true,
      }
    );

   
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: err.message || "Something went wrong" });
  } finally {
    if (lock?.release) await lock.release();
  }
};

export const createAdminOrder = async (req, res) => {
  try {
    const {
      patientId,
      selectedTests,
      addressId,
      homeCollection = false,
      registrationType,
      provisionalDiagnosis,
      notes,
      remark,
      diagnosticCenterId,
      refCenterId,
      doctorId,
      source,
      centerId,
      collectionCenterId,
      totalAmount: bodyTotalAmount,
      discount,
      discountAmount,
      finalAmount: bodyFinalAmount,
    } = req.body;

    // Basic validation
    if (
      !patientId ||
      !selectedTests ||
      !Array.isArray(selectedTests) ||
      selectedTests.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Patient & tests required",
      });
    }

    // Helper to cast ints or return null
    const castInt = (v) =>
      typeof v === "undefined" || v === null || v === "" ? null : Number(v);

    // Generate unique order number
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = await prisma.order.count({
      where: { orderNumber: { startsWith: `ORD${today}` } },
    });
    const orderNumber = `ORD${today}${String(count + 1).padStart(4, "0")}`;

    // Compute totalAmount from selectedTests unless caller provided a totalAmount override
    const computedTotal = selectedTests.reduce(
      (s, t) => s + Number((t && (t.price ?? t.amount ?? t.total)) || 0),
      0
    );
    const total =
      typeof bodyTotalAmount !== "undefined" && bodyTotalAmount !== null
        ? Number(bodyTotalAmount)
        : computedTotal;

    // Determine discount / final amounts
    const discountAmt =
      typeof discountAmount !== "undefined" && discountAmount !== null
        ? Number(discountAmount)
        : typeof discount !== "undefined" && discount !== null
        ? Number(discount)
        : 0;

    const finalAmt =
      typeof bodyFinalAmount !== "undefined" && bodyFinalAmount !== null
        ? Number(bodyFinalAmount)
        : Math.max(0, total - discountAmt);

    // Validate selectedTests have valid ids
    for (const t of selectedTests) {
      const testId = Number(t.id ?? t.testId ?? t.packageId);
      if (!testId || Number.isNaN(testId)) {
        return res.status(400).json({
          success: false,
          message: "Each selected test must have a valid id",
        });
      }
    }

    // Build data object for order.create
    // Only include relation connect blocks when values are present
    const dataToCreate = {
      orderNumber,
      createdById: req.user.id,
      patient: { connect: { id: Number(patientId) } },
      orderType: registrationType ?? undefined,
      totalAmount: Number(total),
      discount:
        typeof discount !== "undefined" && discount !== null
          ? Number(discount)
          : undefined,
      discountAmount:
        discountAmt !== undefined ? Number(discountAmt) : undefined,
      finalAmount: Number(finalAmt),
      diagnosticCenterId: castInt(diagnosticCenterId),

      source: source ?? undefined,
      date: new Date(),
      isHomeSample: Boolean(homeCollection),
      remarks: [provisionalDiagnosis, notes, remark]
        .filter(Boolean)
        .join(" | "),
      // NOTE: address, doctor, center, refCenter are added conditionally below
    };

    // Conditionally add optional relation connects
    if (castInt(addressId)) {
      dataToCreate.address = { connect: { id: Number(addressId) } };
    }
    if (castInt(doctorId)) {
      dataToCreate.doctor = { connect: { id: Number(doctorId) } };
    }
    // if (castInt(centerId)) {
    //   dataToCreate.center = { connect: { id: Number(centerId) } };
    // }
    if (castInt(refCenterId)) {
      dataToCreate.refCenter = { connect: { id: Number(refCenterId) } };
    }

    // Create order, orderMember and orderMemberPackages in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: dataToCreate,
      });

      const orderMember = await tx.orderMember.create({
        data: {
          orderId: order.id,
          patientId: Number(patientId),
        },
      });

      // create orderMemberPackage rows
      const packageCreates = selectedTests.map((test) => {
        const testId = Number(test.id ?? test.testId ?? test.packageId);
        return tx.orderMemberPackage.create({
          data: {
            orderMemberId: orderMember.id,
            testId,
          },
        });
      });

      await Promise.all(packageCreates);

      return { orderId: order.id };
    });

    // fetch created order with relations for response
    const createdOrder = await prisma.order.findUnique({
      where: { id: result.orderId },
      include: {
        patient: true,
        address: true,
        orderMembers: { include: { orderMemberPackages: true } },
        doctor: true,
        refCenter: true,
        center: true,
      },
    });

    return res.json({
      success: true,
      message: "Order created successfully",
      order: createdOrder,
    });
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({
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
       STEP 1 — Get order details
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
       STEP 2 — Slot conflict check
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
        message: "You already accepted another job for this slot",
      });
    }

    /* --------------------------------------------------------
       STEP 3 — Atomic transaction (ORDER + EARNINGS)
    ---------------------------------------------------------*/
    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Recheck order
      const existing = await tx.order.findUnique({
        where: { id: Number(orderId) },
        select: { vendorId: true },
      });

      if (existing.vendorId) {
        throw new Error("Order already accepted");
      }

      // 2️⃣ Accept order
      const updatedOrder = await tx.order.update({
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

      // 3️⃣ Get earning config (latest or first)
      const earningConfig = await tx.vendorEarningConfig.findFirst({
        orderBy: { createdAt: "desc" },
      });

      const baseAmount = earningConfig?.baseAmount || 0;

      // 4️⃣ Fetch vendor current earnings
      const vendor = await tx.vendor.findUnique({
        where: { id: Number(vendorId) },
        select: { earnings: true },
      });

      const newBalance = (vendor?.earnings || 0) + baseAmount;

      // 5️⃣ Update vendor balance
      await tx.vendor.update({
        where: { id: Number(vendorId) },
        data: { earnings: newBalance },
      });

      // 6️⃣ Insert earnings history
      if (baseAmount > 0) {
        await tx.earningsHistory.create({
          data: {
            vendorId: Number(vendorId),
            title: "Order Accepted",
            desc: `Base earning for accepting order #${orderId}`,
            amount: baseAmount,
            type: "order_earning",
            balanceAfter: newBalance,
          },
        });
      }

      return updatedOrder;
    });

    /* --------------------------------------------------------
       STEP 4 — Remove from Redis
    ---------------------------------------------------------*/
    await redis.del(`order:${orderId}`);

    /* --------------------------------------------------------
       STEP 5 — Socket notifications
    ---------------------------------------------------------*/
    io.to(`vendor_${vendorId}`).emit("orderAccepted", {
      orderId,
      vendorId,
      order: result,
    });

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
        status: "on_the_way", // Set initial assignment status
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
        OR: [{ patientId }, { orderMembers: { some: { patientId } } }],
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
          where: { patientId },
          include: {
            patient: {
              select: {
                id: true,
                fullName: true,
                email: true,
                contactNo: true,
              },
            },

            // FIXED RELATION
            orderMemberPackages: {
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
    const { reportReady } = req.query;

    const reportReadyBool =
      reportReady === "true"
        ? true
        : reportReady === "false"
        ? false
        : undefined; // no filter if not provided
    const orders = await prisma.order.findMany({
      where: { patientId, reportReady: reportReadyBool },
      select: {
        id: true,
        merchantOrderId: true,
        paymentStatus: true,
        status: true,
        reportReady: true,
        isHomeSample: true,
        sampleCollected: true,
        patient: {
          select: {
            id: true,
            fullName: true,
            email: true,
            contactNo: true,
          },
        },

        address: true,

        vendor: {
          select: {
            id: true,
            name: true,
            number: true,
          },
        },

        orderMembers: {
          select: {
            id: true,
            patient: {
              select: {
                id: true,
                fullName: true,
                email: true,
                contactNo: true,
              },
            },
            orderMemberPackages: {
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
                test: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    actualPrice: true,
                    offerPrice: true,
                    imgUrl: true,
                    testType: true,
                  },
                },
              },
            },
          },
        },

        createdAt: true,
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
        { source: { contains: search, mode: "insensitive" } },

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

      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        finalAmount: true,
        discount: true,
        paymentMode: true,
        date: true,
        reportReady: true,
        sampleCollected: true,
        createdAt: true,
        isSelf: true,
        trackingId: true,
        isHomeSample: true,
        source: true,
        isHomeSample: true,
        // ✅ RELATIONS
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
          },
        },

        slot: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
          },
        },
        address: {
          select: {
            id: true,
            address: true,
            pincode: true,
            city: true,
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
                contactNo: true,
                gender: true,
              },
            },
            orderMemberPackages: {
              include: {
                // Standalone test booking
                test: {
                  select: {
                    id: true,
                    name: true,
                    actualPrice: true,
                    offerPrice: true,
                    discount: true,
                    testType: true,
                    sampleRequired: true,
                    preparations: true,
                  },
                },

                // Health checkup package booking
                package: {
                  select: {
                    id: true,
                    name: true,
                    actualPrice: true,
                    offerPrice: true,
                    description: true,
                    imgUrl: true,
                    testType: true,
                    noOfParameter: true,

                    // ✅ THIS IS THE IMPORTANT PART
                    checkupPackages: {
                      include: {
                        test: {
                          select: {
                            id: true,
                            name: true,
                            testType: true,
                            actualPrice: true,
                            offerPrice: true,
                            sampleRequired: true,
                          },
                        },
                      },
                    },
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
        ...(status && { status }),
        ...(paymentStatus && { paymentStatus }),
        ...(sampleCollected !== undefined && {
          sampleCollected:
            sampleCollected === "true" || sampleCollected === true,
        }),
        ...(reportReady !== undefined && {
          reportReady: reportReady === "true" || reportReady === true,
        }),
        ...(reportUrl && { reportUrl }),
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
    const { vendorId } = req.body;

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
        finalAmount: true,

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

export const addOrderPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
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

    // Get order with payments
    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      include: {
        payments: true,
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

    // Calculate existing payments
    const existingPaymentsTotal = order.payments.reduce((total, payment) => {
      return total + (payment.amount || 0);
    }, 0);

    const balance = order.finalAmount - existingPaymentsTotal;

    // Validate amount
    if (amount > balance) {
      return res.status(400).json({
        success: false,
        message: `Payment amount exceeds order balance. Maximum allowed: ${balance}`,
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Payment amount must be greater than 0",
      });
    }

    // Generate payment ID
    const paymentId = `PAY-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Create payment
    const payment = await prisma.payment.create({
      data: {
        orderId: parseInt(orderId),
        patientId: order.patientId,
        userId: req.user?.id,
        vendorId: order.vendorId,
        centerId: order.centerId,
        paymentId,
        paymentMethod: paymentMode?.toUpperCase(), // Prisma ENUM

        paymentStatus: "CAPTURED",
        amount,
        currency,
        paymentDate: new Date(),
        transactionNote,
        referenceId,
        gatewayResponse,
        capturedAmount: capturedAmount || amount,
        ipAddress: ipAddress || req.ip,
        createdById: req.user?.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Calculate new payment status
    const newTotalPaid = existingPaymentsTotal + amount;
    const newPaymentStatus =
      newTotalPaid >= order.finalAmount
        ? "paid"
        : newTotalPaid > 0
        ? "partially_paid"
        : "pending";

    // Update order payment status
    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(orderId) },
      data: { paymentStatus: newPaymentStatus },
      include: {
        payments: {
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
        },
      },
    });

    // Update vendor earnings if applicable
    if (order.vendorId && amount > 0) {
      await prisma.vendor.update({
        where: { id: order.vendorId },
        data: {
          earnings: { increment: amount },
        },
      });

      // Create earnings history
      await prisma.earningsHistory.create({
        data: {
          vendorId: order.vendorId,
          title: "Order Payment Received",
          desc: `Payment of ${amount} ${currency} received for order ${order.orderNumber}`,
          amount,
          type: "add",
          balanceAfter: await prisma.vendor
            .findUnique({
              where: { id: order.vendorId },
              select: { earnings: true },
            })
            .then((vendor) => vendor.earnings),
          createdById: req.user?.id,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: "Payment added to order successfully",
      payment,
      order: updatedOrder,
      summary: {
        orderTotal: order.finalAmount,
        previousPaid: existingPaymentsTotal,
        newPayment: amount,
        totalPaid: newTotalPaid,
        balance: order.finalAmount - newTotalPaid,
        paymentStatus: newPaymentStatus,
      },
    });
  } catch (error) {
    console.error("Add order payment error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding payment to order",
      error: error.message,
    });
  }
};

/**
 * @desc    Get order payment summary
 * @route   GET /api/orders/:orderId/payments/summary
 * @access  Private (Admin/Patient/Vendor)
 */

export const getOrderPaymentSummary = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: parseInt(orderId) },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        discount: true,
        finalAmount: true,
        paymentStatus: true,
        patientId: true,
        vendorId: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check authorization
    if (req.user.role !== "admin") {
      if (req.user.patientId && order.patientId !== req.user.patientId) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access order payments",
        });
      }
      if (req.user.vendorId && order.vendorId !== req.user.vendorId) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access order payments",
        });
      }
    }

    // Get all payments for this order
    const payments = await prisma.payment.findMany({
      where: { orderId: parseInt(orderId) },
      orderBy: { createdAt: "desc" },
    });

    // Calculate summary
    const totalPaid = payments.reduce(
      (sum, payment) => sum + payment.amount,
      0
    );
    const totalRefunded = payments.reduce(
      (sum, payment) => sum + (payment.refundAmount || 0),
      0
    );
    const netPaid = totalPaid - totalRefunded;
    const balance = order.finalAmount - netPaid;

    // Group by payment method
    const paymentMethods = payments.reduce((acc, payment) => {
      const method = payment.paymentMethod;
      if (!acc[method]) {
        acc[method] = {
          method,
          count: 0,
          amount: 0,
        };
      }
      acc[method].count += 1;
      acc[method].amount += payment.amount;
      return acc;
    }, {});

    // Get recent payments
    const recentPayments = payments.slice(0, 5).map((payment) => ({
      id: payment.id,
      paymentId: payment.paymentId,
      amount: payment.amount,
      method: payment.paymentMethod,
      status: payment.paymentStatus,
      date: payment.paymentDate,
      refundAmount: payment.refundAmount,
    }));

    res.json({
      success: true,
      summary: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          discount: order.discount,
          finalAmount: order.finalAmount,
          paymentStatus: order.paymentStatus,
        },
        payments: {
          totalPaid,
          totalRefunded,
          netPaid,
          balance,
          isPaid: netPaid >= order.finalAmount,
          isPartiallyPaid: netPaid > 0 && netPaid < order.finalAmount,
        },
        byMethod: Object.values(paymentMethods),
        recentPayments,
        paymentCount: payments.length,
      },
    });
  } catch (error) {
    console.error("Get order payment summary error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching order payment summary",
      error: error.message,
    });
  }
};

export const getOrderReports = async (req, res) => {
  try {
    let {
      date,
      fromDate,
      toDate,
      centerId,
      refCenterId,
      doctorId,
      diagnosticCenterId,
      status,
      source,
      page = 1,
      limit = 25,
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    let where = {};

    // -------------------------------------
    // ✅ APPLY DATE FILTERS ONLY IF PROVIDED
    // -------------------------------------

    // 📌 Single Date
    if (date && date !== "") {
      const d = dayjs(date).startOf("day");
      where.date = {
        gte: d.toDate(),
        lt: d.add(1, "day").toDate(),
      };
    }

    // 📌 Date Range (fromDate + toDate)
    if (fromDate && toDate && fromDate !== "" && toDate !== "") {
      where.date = {
        gte: dayjs(fromDate).startOf("day").toDate(),
        lt: dayjs(toDate).endOf("day").toDate(),
      };
    }

    // Remove empty date filter if created
    if (where.date && Object.keys(where.date).length === 0) {
      delete where.date;
    }

    // -------------------------------------
    // ✅ OTHER FILTERS
    // -------------------------------------
    if (centerId) where.centerId = Number(centerId);
    if (refCenterId) where.refCenterId = Number(refCenterId);
    if (doctorId) where.doctorId = Number(doctorId);
    if (diagnosticCenterId)
      where.diagnosticCenterId = Number(diagnosticCenterId);

    if (status) where.status = status;
    if (source) where.source = source;

    // -------------------------------------
    // ✅ FETCH PAGINATED ORDERS
    // -------------------------------------
    const orders = await prisma.order.findMany({
      where,
      include: {
        patient: { select: { id: true, fullName: true, contactNo: true } },
        center: { select: { id: true, name: true } },
        refCenter: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        diagnosticCenter: { select: { id: true, name: true } },

        orderCheckups: {
          include: {
            checkup: { select: { id: true, name: true } },
          },
        },

        orderMembers: {
          include: {
            patient: { select: { fullName: true } },
            orderMemberPackages: {
              include: {
                package: true,
                test: { select: { id: true, name: true } },
              },
            },
          },
        },
      },

      orderBy: { id: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    // -------------------------------------
    // ✅ TOTAL COUNT (must use SAME where)
    // -------------------------------------
    const total = await prisma.order.count({ where });

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: orders,
    });
  } catch (error) {
    console.error("Order report error:", error);
    return res.status(500).json({ error: "Failed to fetch order reports" });
  }
};

export const getOrdersExpiringSoon = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const now = dayjs();
    const next30Min = now.add(30, "minute");

    // 1️⃣ Count total orders
    const totalOrders = await prisma.order.count({
      where: {
        vendorId: null,
        status: "pending",
        source: "app",
        isHomeSample: true,
        slot: { not: null },
      },
    });

    // 2️⃣ Fetch orders with pagination
    const orders = await prisma.order.findMany({
      where: {
        vendorId: null,
        status: "pending",
        source: "app",
        isHomeSample: true,
        slot: { not: null },
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            contactNo: true,
          },
        },
        address: true,
      },
      orderBy: {
        date: "asc", // Sort by date ascending
      },
      skip,
      take: limitNum,
    });

    // 3️⃣ Calculate time left for each order
    const ordersWithTimeLeft = orders.map((order) => {
      const slotDateTime = dayjs(
        `${dayjs(order.date).format("YYYY-MM-DD")} ${order.slot}`,
        "YYYY-MM-DD hh:mm A"
      );
      const minsLeft = slotDateTime.diff(now, "minute");

      return {
        ...order,
        minsLeft,
      };
    });

    res.json({
      success: true,
      orders: ordersWithTimeLeft,
      total: totalOrders,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalOrders / limitNum),
    });
  } catch (error) {
    console.error("Expiring orders error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expiring orders",
    });
  }
};
