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
    const { name, email, password, city, lat, long, address, packageIds = [] } = req.body;

    if (!name || !email || !password || !city || !lat || !long || !address) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if email already exists
    const existing = await prisma.center.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "Email already registered" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Validate packages
    if (packageIds.length > 0) {
      const existingPackages = await prisma.package.findMany({
        where: { id: { in: packageIds.map(Number) } },
        select: { id: true },
      });

      const existingIds = existingPackages.map((p) => p.id);
      const invalidIds = packageIds.filter((pid) => !existingIds.includes(Number(pid)));

      if (invalidIds.length > 0) {
        return res.status(400).json({
          error: `Invalid package IDs: ${invalidIds.join(", ")}`,
        });
      }
    }

    // Create center
    const center = await prisma.center.create({
      data: {
        name,
        email,
        password: hashedPassword,
        city,
        lat: parseFloat(lat),
        long: parseFloat(long),
        address,
        centerPackages:
          packageIds.length > 0
            ? {
                create: packageIds.map((pid) => ({
                  packageId: Number(pid),
                })),
              }
            : undefined,
      },
      include: { centerPackages: { include: { package: true } } },
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
    // Get query parameters
    const {
      page = 1,
      limit = 15,
      search = "",
    } = req.query;


    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Prisma where condition for search
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          
            { city: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    // Fetch total count
    const totalCount = await prisma.center.count({ where });

    // Fetch centers with pagination
    const centers = await prisma.center.findMany({
      where,
      include: {
        centerPackages: {
          include: { package: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });

    // Remove password field
    const sanitized = centers.map(({ password, ...rest }) => rest);

    // Send response with pagination meta
    res.json({
      data: sanitized,
      meta: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / limit),
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
      include: { centerPackages: { include: { package: true } } },
    });

    if (!center) return res.status(404).json({ error: "Center not found" });

    // Remove password before sending
    const { password, ...safeCenter } = center;
    res.json(safeCenter);
  } catch (error) {
    console.error("Error fetching center:", error);
    res.status(500).json({ error: "Failed to fetch center" });
  }
};

// ✅ UPDATE Center
export const updateCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, city, lat, long, address, packageIds = [] } = req.body;

    const existing = await prisma.center.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: "Center not found" });

    let updatedPassword = existing.password;
    if (password) {
      updatedPassword = await bcrypt.hash(password, 10);
    }

    await prisma.center.update({
      where: { id: Number(id) },
      data: {
        name,
        email,
        password: updatedPassword,
        city,
        lat: parseFloat(lat),
        long: parseFloat(long),
        address,
      },
    });

    // Update packages if provided
    if (packageIds && packageIds.length > 0) {
      await prisma.centerPackage.deleteMany({ where: { centerId: Number(id) } });
      await prisma.centerPackage.createMany({
        data: packageIds.map((pid) => ({
          centerId: Number(id),
          packageId: Number(pid),
        })),
      });
    }

    const updated = await prisma.center.findUnique({
      where: { id: Number(id) },
      include: { centerPackages: { include: { package: true } } },
    });

    const { password: pw, ...safeCenter } = updated;
    res.json({ message: "Center updated successfully", center: safeCenter });
  } catch (error) {
    console.error("Error updating center:", error);
    res.status(500).json({ error: "Failed to update center" });
  }
};

// ✅ DELETE Center
export const deleteCenter = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.center.findUnique({ where: { id: Number(id) } });
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
      return res.status(400).json({ error: "Latitude and longitude are required" });
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
