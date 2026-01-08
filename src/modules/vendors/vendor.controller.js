import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "NOVUS!@2025";

// ✅ REGISTER
export const registerVendor = async (req, res) => {
  try {
    const {
      name,
      number,
      city,
      category,
      gender,
      dob,
      age,
      address,
      pincode,
      radius,
      email,
      password,
      status,
    } = req.body;

    // Check duplicate number or email
    const existing = await prisma.vendor.findFirst({
      where: { OR: [{ number }, { email }] },
    });

    if (existing) {
      return res.status(400).json({ error: "Vendor already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const vendor = await prisma.vendor.create({
      data: {
        name,
         createdById: req.user.id,
        number,
        city,
        category,
        gender,
        dob: dob ? new Date(dob) : null,
        age: age ? Number(age) : null,
        address,
        pincode: pincode ? Number(pincode) : null,
        radius: radius ? Number(radius) : null,
        email,
        password: hashedPassword,
        status: status || "inactive", // default
      },
    });

    return res.status(201).json({
      message: "Vendor registered successfully",
      vendor,
    });
  } catch (error) {
    console.error("Error registering vendor:", error);
    return res.status(500).json({ error: "Failed to register vendor" });
  }
};

export const loginVendor = async (req, res) => {
  try {
    const { number, password } = req.body;

    if (!number) {
      return res.status(400).json({ error: "Please enter the number" });
    }

    if (!password) {
      return res.status(400).json({ error: "Please enter the password" });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { number },
    });

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const isPasswordValid = await bcrypt.compare(password, vendor.password);
    if (!isPasswordValid)
      return res.status(401).json({ error: "Invalid credentials" });

    if (vendor.block)
      return res.status(403).json({ error: "Account blocked by admin" });

    const token = jwt.sign({ id: vendor.id }, JWT_SECRET, { expiresIn: "7d" });

    // 🛡️ SANITIZE VENDOR DATA
    const cleanVendor = {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
      number: vendor.number,
    };

    return res.json({
      message: "Login successful",
      token,
      vendor: vendor,
    });
  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).json({ error: "Failed to login vendor" });
  }
};

// ✅ LOGOUT (client just deletes token)
export const logoutVendor = async (req, res) => {
  // JWT logout = client deletes token
  res.json({ message: "Vendor logged out successfully" });
};

export const sendOtp = async (req, res) => {
  try {
    const { number } = req.body;

    if (!number) {
      return res.status(400).json({ error: "Mobile number required" });
    }

    // Check vendor exists
    const vendor = await prisma.vendor.findUnique({ where: { number } });
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    if (vendor.block) {
      return res.status(403).json({ error: "Account blocked by admin" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Expiry time = 5 minutes
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    // Store in DB
    await prisma.vendor.update({
      where: { number },
      data: {
        otp,
        otpExpiry: expiry,
      },
    });

    // Send OTP (Use your SMS API)
    // await sendSMS(number, `Your OTP is: ${otp}`);

    return res.json({ message: "OTP sent successfully", otp: otp });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ error: "Failed to send OTP" });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { number, otp } = req.body;

    if (!number || !otp) {
      return res
        .status(400)
        .json({ error: "Mobile number and OTP are required" });
    }

    const vendor = await prisma.vendor.findUnique({ where: { number } });
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // Check OTP expiry
    if (!vendor.otp || !vendor.otpExpiry || vendor.otpExpiry < new Date()) {
      return res.status(400).json({ error: "OTP expired or invalid" });
    }

    // Validate OTP
    if (vendor.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Clear OTP after verification
    await prisma.vendor.update({
      where: { number },
      data: { otp: null, otpExpiry: null },
    });

    // Generate token
    const token = jwt.sign({ id: vendor.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({
      message: "Login successful",
      token,
      vendor,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({ error: "Failed to verify OTP" });
  }
};

// ✅ GET ALL Vendors
export const getAllVendors = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      city,
      category,
      status,
      block,
      search,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // ✅ Build dynamic filters
    const where = {};

    if (city) {
      where.city = { contains: city, mode: "insensitive" };
    }

    if (category) {
      where.category = { contains: category, mode: "insensitive" };
    }

    if (status) {
      where.status = { equals: status, mode: "insensitive" };
    }

    if (block !== undefined) {
      where.block = block === "true";
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { number: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ];
    }

    // ✅ Fetch total count (for pagination info)
    const totalCount = await prisma.vendor.count({ where });

    // ✅ Fetch vendors with filters + pagination
    const vendors = await prisma.vendor.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    res.json({
      page: Number(page),
      limit: Number(limit),
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      vendors,
    });
  } catch (error) {
    console.error("Error fetching vendors:", error);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
};

// ✅ GET Vendor by ID
export const getVendorById = async (req, res) => {
  try {
    const { id } = req.params;

    const vendor = await prisma.vendor.findUnique({
      where: { id: Number(id) },
    });

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    res.json(vendor);
  } catch (error) {
    console.error("Error fetching vendor:", error);
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
};

// ✅ GET Vendors by Category
export const getVendorsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const vendors = await prisma.vendor.findMany({
      where: { category: { equals: category, mode: "insensitive" } },
    });
    res.json(vendors);
  } catch (error) {
    console.error("Error fetching vendors by category:", error);
    res.status(500).json({ error: "Failed to fetch vendors by category" });
  }
};

export const updateVendor = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      number,
      city,
      category,
      gender,
      dob,
      age,
      address,
      pincode,
      radius,
      email,
      password,
      status,
      block,
    } = req.body;

    const existing = await prisma.vendor.findUnique({
      where: { id: Number(id) },
    });

    if (!existing) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // Password update (only if new password provided)
    let hashedPassword = existing.password;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.vendor.update({
      where: { id: Number(id) },
      data: {
        name: name ?? existing.name,
        number: number ?? existing.number,
        city: city ?? existing.city,
        category: category ?? existing.category,
        gender: gender ?? existing.gender,
        dob: dob ? new Date(dob) : existing.dob,
        age: age ? Number(age) : existing.age,
        address: address ?? existing.address,
        pincode: pincode ? Number(pincode) : existing.pincode,
        radius: radius ? Number(radius) : existing.radius,
        email: email ?? existing.email,
        password: hashedPassword,
        status: status ?? existing.status,
        block: block !== undefined ? block : existing.block,
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error("Error updating vendor:", error);
    return res.status(500).json({ error: "Failed to update vendor" });
  }
};

// ✅ DELETE Vendor
export const deleteVendor = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.vendor.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) return res.status(404).json({ error: "Vendor not found" });

    await prisma.vendor.delete({ where: { id: Number(id) } });

    res.json({ message: "Vendor deleted successfully" });
  } catch (error) {
    console.error("Error deleting vendor:", error);
    res.status(500).json({ error: "Failed to delete vendor" });
  }
};

// ✅ BLOCK / UNBLOCK Vendor
export const toggleBlockVendor = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.vendor.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) return res.status(404).json({ error: "Vendor not found" });

    const updated = await prisma.vendor.update({
      where: { id: Number(id) },
      data: { block: !existing.block },
    });

    res.json({
      message: updated.block
        ? "Vendor blocked successfully"
        : "Vendor unblocked successfully",
      vendor: updated,
    });
  } catch (error) {
    console.error("Error toggling vendor block:", error);
    res.status(500).json({ error: "Failed to toggle block status" });
  }
};

export const getVendorEarnings = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { filter, startDate, endDate } = req.query;
    // filter = today | week | month | custom

    const vendor = await prisma.vendor.findUnique({
      where: { id: Number(vendorId) },
    });

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    // 🕒 Build date range
    let dateFilter = {};

    const now = new Date();

    if (filter === "today") {
      const start = new Date(now.setHours(0, 0, 0, 0));
      const end = new Date(now.setHours(23, 59, 59, 999));

      dateFilter.createdAt = { gte: start, lte: end };
    } else if (filter === "week") {
      // Week starts Monday
      const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // Convert Sunday 0 → 7
      const start = new Date(now);
      start.setDate(now.getDate() - (currentDay - 1));
      start.setHours(0, 0, 0, 0);

      const end = new Date(now);
      end.setHours(23, 59, 59, 999);

      dateFilter.createdAt = { gte: start, lte: end };
    } else if (filter === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );

      dateFilter.createdAt = { gte: start, lte: end };
    } else if (filter === "custom") {
      if (!startDate || !endDate) {
        return res.status(400).json({
          error: "startDate and endDate are required for custom filter",
        });
      }

      dateFilter.createdAt = {
        gte: new Date(startDate),
        lte: new Date(`${endDate}T23:59:59.999Z`),
      };
    }

    // Fetch filtered history
    const history = await prisma.earningsHistory.findMany({
      where: {
        vendorId: Number(vendorId),
        ...dateFilter,
      },
      orderBy: { createdAt: "desc" },
    });

    // Calculate total for selected filter
    const filteredTotal = history.reduce((sum, i) => sum + i.amount, 0);

    return res.json({
      vendorId,
      filter: filter || "all",
      totalEarnings: vendor.earnings,
      filteredTotal,
      history,
    });
  } catch (error) {
    console.error("Error fetching vendor earnings:", error);
    res.status(500).json({ error: "Failed to fetch earnings history" });
  }
};

export const addVendorEarning = async (req, res) => {
  try {
    const { vendorId, title, desc, amount, type } = req.body;

    // Validate fields
    if (!vendorId || !amount || !type) {
      return res.status(400).json({
        error: "vendorId, amount, and type are required",
      });
    }

    // Validate type
    const validTypes = ["Credit", "Debit", "order_earning"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: "Invalid type. Must be 'Credit', 'Debit', or 'order_earning'",
      });
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: Number(vendorId) },
    });

    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // Calculate new earnings based on type
    let newEarnings = vendor.earnings;
    let transactionType = type;

    if (type === "Credit") {
      newEarnings += Number(amount);
      transactionType = "add"; // For frontend display
    } else if (type === "Debit") {
      newEarnings -= Number(amount);
      transactionType = "deduct"; // For frontend display
    } else if (type === "order_earning") {
      newEarnings += Number(amount);
      transactionType = "order_earning";
    }

    // Ensure earnings don't go negative for deductions
    if (newEarnings < 0) {
      return res.status(400).json({
        error: "Insufficient balance for deduction",
      });
    }

    // Create earning record with balanceAfter
    const historyRecord = await prisma.earningsHistory.create({
      data: {
        vendorId: Number(vendorId),
        title:
          title ||
          (type === "Credit"
            ? "Wallet Top-up"
            : type === "Debit"
            ? "Wallet Deduction"
            : "Order Earning"),
        desc: desc || "Transaction",
        amount: Number(amount),
        type: transactionType, // Store as 'add', 'deduct', or 'order_earning'
        balanceAfter: newEarnings,
      },
    });

    // Update vendor total earnings
    await prisma.vendor.update({
      where: { id: Number(vendorId) },
      data: {
        earnings: newEarnings,
      },
    });

    return res.status(200).json({
      message: "Transaction completed successfully",
      transaction: historyRecord,
      newBalance: newEarnings,
    });
  } catch (error) {
    console.error("Error processing transaction:", error);
    res.status(500).json({
      error: "Failed to process transaction",
      details: error.message,
    });
  }
};

// Get earnings history with pagination
export const getEarningsHistory = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!vendorId) {
      return res.status(400).json({ error: "vendorId is required" });
    }

    // Pagination
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "50", 10);
    const skip = (page - 1) * limit;

    // Check vendor exists
    const vendor = await prisma.vendor.findUnique({
      where: { id: Number(vendorId) },
      select: {
        id: true,
        name: true,
        earnings: true,
      },
    });

    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // Total records count
    const totalCount = await prisma.earningsHistory.count({
      where: { vendorId: Number(vendorId) },
    });

    // Paginated list
    const history = await prisma.earningsHistory.findMany({
      where: { vendorId: Number(vendorId) },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        desc: true,
        amount: true,
        type: true,
        balanceAfter: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      vendor: {
        id: vendor.id,
        name: vendor.name,
        totalEarnings: vendor.earnings,
      },
      pagination: {
        page,
        limit,
        totalRecords: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: page * limit < totalCount,
        nextPage: page * limit < totalCount ? page + 1 : null,
      },
      history: history || [],
    });
  } catch (error) {
    console.error("Error fetching earning history:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const addVendorReview = async (req, res) => {
  try {
    const { vendorId, patientId, rating, comment } = req.body;

    if (!vendorId || !rating) {
      return res
        .status(400)
        .json({ error: "vendorId and rating are required" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // Fetch vendor
    const vendor = await prisma.vendor.findUnique({
      where: { id: Number(vendorId) },
    });

    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    // 1️⃣ Create Review
    const review = await prisma.vendorReview.create({
      data: {
        vendorId: Number(vendorId),
        patientId: patientId ? Number(patientId) : null,
        rating,
        comment,
      },
    });

    // 2️⃣ Calculate new rating
    const newTotalReviews = vendor.totalReviews + 1;

    const newOverallRating =
      (vendor.overallRating * vendor.totalReviews + rating) / newTotalReviews;

    // 3️⃣ Update vendor with new rating + review count
    await prisma.vendor.update({
      where: { id: Number(vendorId) },
      data: {
        overallRating: newOverallRating,
        totalReviews: newTotalReviews,
      },
    });

    return res.json({
      message: "Review added successfully",
      review,
      updatedRating: {
        overallRating: newOverallRating,
        totalReviews: newTotalReviews,
      },
    });
  } catch (error) {
    console.error("Error adding review:", error);
    return res.status(500).json({ error: "Failed to add review" });
  }
};

export const getVendorReviews = async (req, res) => {
  try {
    const { vendorId } = req.params;
    if (!vendorId) {
      return res.status(404).json({ error: "vendorId not found" });
    }

    const page = parseInt(req.query.page || "1");
    const limit = parseInt(req.query.limit || "10");
    const skip = (page - 1) * limit;

    const vendor = await prisma.vendor.findUnique({
      where: { id: Number(vendorId) },
      select: { id: true, name: true },
    });

    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const total = await prisma.vendorReview.count({
      where: { vendorId: Number(vendorId) },
    });

    const reviews = await prisma.vendorReview.findMany({
      where: { vendorId: Number(vendorId) },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    res.json({
      vendor,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
      reviews,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
};
