import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";

// ✅ Center Login
export const loginCenter = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    // Find center by email
    const center = await prisma.center.findUnique({ where: { email } });
    if (!center) return res.status(404).json({ error: "Center not found" });

    // Compare password
    const isMatch = await bcrypt.compare(password, center.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    // Generate JWT token
    const token = jwt.sign(
      { id: center.id, email: center.email, role: "center" },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Optionally mark as active
    await prisma.center.update({
      where: { id: center.id },
      data: { status: "active" },
    });

    // Exclude password before sending
    const { password: pw, ...safeCenter } = center;

    res.json({
      message: "Login successful",
      token,
      center: safeCenter,
    });
  } catch (error) {
    console.error("Error logging in center:", error);
    res.status(500).json({ error: "Login failed" });
  }
};

// ✅ Optional Logout (if you want to mark inactive)
export const logoutCenter = async (req, res) => {
  try {
    const { centerId } = req.body;

    if (!centerId) return res.status(400).json({ error: "Center ID required" });

    await prisma.center.update({
      where: { id: Number(centerId) },
      data: { status: "inactive" },
    });

    res.json({ message: "Logout successful" });
  } catch (error) {
    console.error("Error logging out center:", error);
    res.status(500).json({ error: "Logout failed" });
  }
};

// ✅ CREATE Center
export const createCenter = async (req, res) => {
  try {
    const {
      name,
      contactName,
      venue,
      address,
      email,
      alternativeEmail,
      mobile,
      billType,
      account,
      emailReportConfig,
      sendReportToPatient = false,
      sendBillToPatient = false,
      paymentType = "PrePaid",

      city,
      lat,
      long,

      packageIds = [],
    } = req.body;

    // Required fields based on UI
    if (!name || !venue || !address) {
      return res
        .status(400)
        .json({ error: "Name, Venue, and Address are required" });
    }

    // Email optional, but must be unique if provided
    if (email) {
      const exists = await prisma.center.findUnique({ where: { email } });
      if (exists) {
        return res.status(400).json({ error: "Email already registered" });
      }
    }

    // Validate package IDs if provided
    if (packageIds.length > 0) {
      const validPackages = await prisma.package.findMany({
        where: { id: { in: packageIds.map(Number) } },
        select: { id: true },
      });

      const validIds = validPackages.map((p) => p.id);
      const invalidIds = packageIds.filter(
        (pid) => !validIds.includes(Number(pid))
      );

      if (invalidIds.length > 0) {
        return res
          .status(400)
          .json({ error: `Invalid package IDs: ${invalidIds.join(", ")}` });
      }
    }

    // Create center
    const center = await prisma.center.create({
      data: {
        name,
        contactName,
        venue,
        address,
        email,
        alternativeEmail,
        mobile,
        billType,
        account,
        emailReportConfig,

        sendReportToPatient,
        sendBillToPatient,
        paymentType,

        city: city || null,
        lat: lat ? Number(lat) : null,
        long: long ? Number(long) : null,

        centerPackages:
          packageIds.length > 0
            ? {
                create: packageIds.map((pid) => ({
                  packageId: Number(pid),
                })),
              }
            : undefined,
      },

      include: { centerPackages: { include: { test: true } } },
    });

    res.status(201).json({ message: "Center created successfully", center });
  } catch (error) {
    console.error("Error creating center:", error);
    res.status(500).json({ error: "Failed to create center" });
  }
};

// ✅ GET ALL Centers with Pagination + Search
export const getAllCenters = async (req, res) => {
  try {
    const { page = 1, limit = 15, search = "" } = req.query;

    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { venue: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { mobile: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const total = await prisma.center.count({ where });

    const centers = await prisma.center.findMany({
      where,
      include: {
        centerPackages: { include: { test: true } },
      },
      orderBy: { name: "asc" }, // Alphabetical
      skip: Number(skip),
      take: Number(limit),
    });

    res.json({
      data: centers,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching centers:", error);
    res.status(500).json({ error: "Failed to fetch centers" });
  }
};

// ✅ GET ONE Center
export const getCenterById = async (req, res) => {
  try {
    const { id } = req.params;

    const center = await prisma.center.findUnique({
      where: { id: Number(id) },
      include: { centerPackages: { include: { test: true } } },
    });

    if (!center) return res.status(404).json({ error: "Center not found" });

    res.json(center);
  } catch (error) {
    console.error("Error fetching center:", error);
    res.status(500).json({ error: "Failed to fetch center" });
  }
};

// ✅ UPDATE Center
export const updateCenter = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.center.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) return res.status(404).json({ error: "Center not found" });

    const {
      name,
      contactName,
      venue,
      address,
      email,
      alternativeEmail,
      mobile,
      billType,
      account,
      emailReportConfig,
      sendReportToPatient,
      sendBillToPatient,
      paymentType,
      city,
      lat,
      long,

      packageIds = [],
    } = req.body;

    // Email unique check
    if (email && email !== existing.email) {
      const exists = await prisma.center.findUnique({ where: { email } });
      if (exists) {
        return res.status(400).json({ error: "Email already in use" });
      }
    }

    // Update center
    await prisma.center.update({
      where: { id: Number(id) },
      data: {
        name,
        contactName,
        venue,
        address,
        email,
        alternativeEmail,
        mobile,
        billType,
        account,
        emailReportConfig,
        sendReportToPatient,
        sendBillToPatient,
        paymentType,
        city,
        lat: lat ? Number(lat) : null,
        long: long ? Number(long) : null,
      },
    });

    // Update packages
    if (packageIds.length > 0) {
      await prisma.centerPackage.deleteMany({
        where: { centerId: Number(id) },
      });

      await prisma.centerPackage.createMany({
        data: packageIds.map((pid) => ({
          centerId: Number(id),
          packageId: Number(pid),
        })),
      });
    }

    const updated = await prisma.center.findUnique({
      where: { id: Number(id) },
      include: { centerPackages: { include: { test: true } } },
    });

    res.json({ message: "Center updated successfully", center: updated });
  } catch (error) {
    console.error("Error updating center:", error);
    res.status(500).json({ error: "Failed to update center" });
  }
};

// ✅ DELETE Center
export const deleteCenter = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.center.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) return res.status(404).json({ error: "Center not found" });

    await prisma.center.delete({ where: { id: Number(id) } });

    res.json({ message: "Center deleted successfully" });
  } catch (error) {
    console.error("Error deleting center:", error);
    res.status(500).json({ error: "Failed to delete center" });
  }
};

// ✅ NEARBY Centers
export const getNearbyCenters = async (req, res) => {
  try {
    const { lat, long, radius = 10 } = req.query;

    const userLat = parseFloat(lat);
    const userLong = parseFloat(long);
    const distanceKm = parseFloat(radius);

    if (isNaN(userLat) || isNaN(userLong)) {
      return res
        .status(400)
        .json({ error: "Latitude and longitude are required" });
    }

    const centers = await prisma.$queryRaw`
      SELECT 
        c.*, 
        (6371 * acos(
          cos(radians(${userLat})) * cos(radians(c.lat)) *
          cos(radians(c.long) - radians(${userLong})) +
          sin(radians(${userLat})) * sin(radians(c.lat))
        )) AS distance
      FROM "Center" c
      WHERE 
        (6371 * acos(
          cos(radians(${userLat})) * cos(radians(c.lat)) *
          cos(radians(c.long) - radians(${userLong})) +
          sin(radians(${userLat})) * sin(radians(c.lat))
        )) <= ${distanceKm}
      ORDER BY distance ASC
      LIMIT 50;
    `;

    // Remove passwords
    const sanitized = centers.map(({ password, ...rest }) => rest);

    res.json({ count: sanitized.length, centers: sanitized });
  } catch (error) {
    console.error("Error fetching nearby centers:", error);
    res.status(500).json({ error: "Failed to fetch nearby centers" });
  }
};
