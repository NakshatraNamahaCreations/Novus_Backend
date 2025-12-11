import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
      include: {
        centerPackages: { include: { test: true } },
        categories: {
          include: { category: true },
        },
      },
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
// Convert slot time string "02:30 PM" → Date object (today at that time)
function getSlotDate(slotTimeString) {
  const [time, modifier] = slotTimeString.split(" ");
  let [hours, minutes] = time.split(":").map(Number);

  if (modifier === "PM" && hours !== 12) hours += 12;
  if (modifier === "AM" && hours === 12) hours = 0;

  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// ✅ NEARBY Centers
export const getNearbyCenters = async (req, res) => {
  try {
    const {
      lat,
      long,
      radius = 1000,
      categoryIds,
      date,
      includeFullSlots = "false",
    } = req.query;

    // validate lat/long
    const userLat = parseFloat(lat);
    const userLong = parseFloat(long);
    const distanceKm = parseFloat(radius);

    if (isNaN(userLat) || isNaN(userLong)) {
      return res
        .status(400)
        .json({
          error: "Latitude and longitude are required and must be numbers",
        });
    }
    if (isNaN(distanceKm) || distanceKm <= 0) {
      return res
        .status(400)
        .json({ error: "Radius must be a positive number" });
    }

    // parse categoryIds if provided
    let categoryIdList = [];
    if (categoryIds && typeof categoryIds === "string") {
      categoryIdList = categoryIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    }

    // parse date if provided
    let bookingDateStart = null;
    let bookingDateEnd = null;
    if (date) {
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) {
        return res
          .status(400)
          .json({ error: "Date must be in YYYY-MM-DD format" });
      }
      // set start of day (00:00:00) and next day (exclusive)
      bookingDateStart = new Date(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate(),
        0,
        0,
        0
      );
      bookingDateEnd = new Date(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate() + 1,
        0,
        0,
        0
      );
    }

    const includeFull = String(includeFullSlots).toLowerCase() === "true";

    // 1) Fetch nearby centers with distance using Haversine (6371 km earth radius)
    // limit to 200 to avoid huge IN queries later
    const nearbyCenters = await prisma.$queryRaw`
      SELECT 
        c.*,
        (6371 * acos(
           cos(radians(${userLat})) * cos(radians(c.lat)) *
           cos(radians(c.long) - radians(${userLong})) +
           sin(radians(${userLat})) * sin(radians(c.lat))
        )) AS distance
      FROM "Center" c
      WHERE c.lat IS NOT NULL AND c.long IS NOT NULL
        AND (6371 * acos(
           cos(radians(${userLat})) * cos(radians(c.lat)) *
           cos(radians(c.long) - radians(${userLong})) +
           sin(radians(${userLat})) * sin(radians(c.lat))
        )) <= ${distanceKm}
      ORDER BY distance ASC
      LIMIT 200;
    `;

    if (!nearbyCenters || nearbyCenters.length === 0) {
      return res.json({ count: 0, centers: [] });
    }

    // sanitize (remove sensitive fields like password if present)
    const sanitized = nearbyCenters.map((row) => {
      // ensure distance is a Number (some drivers return string)
      const { password, ...rest } = row;
      return {
        ...rest,
        distance:
          typeof rest.distance === "string"
            ? parseFloat(rest.distance)
            : rest.distance,
      };
    });

    const centerIds = sanitized.map((c) => c.id).filter(Boolean);
    if (centerIds.length === 0) {
      return res.json({ count: 0, centers: [] });
    }

    // 2) Fetch categories for these centers (join table entries)
    const centerCategories = await prisma.centerCategory.findMany({
      where: { centerId: { in: centerIds } },
      include: { category: true },
    });

    // 3) Fetch slots for these centers (use select to avoid schema mismatches)
    const centerSlots = await prisma.centerSlot.findMany({
      where: { centerId: { in: centerIds } },
      select: {
        id: true,
        centerId: true,
        name: true,
        startTime: true,
        endTime: true,
        capacity: true,
        isActive: true,
      },
    });

    // 4) If date provided, fetch booking counts for each slot for that date (use range to handle DateTime)
    let bookingMap = {}; // slotId -> bookedCount
    if (bookingDateStart && bookingDateEnd && centerSlots.length > 0) {
      const slotIds = centerSlots.map((s) => s.id);
      const slotBookings = await prisma.centerSlotBooking.findMany({
        where: {
          slotId: { in: slotIds },
          date: {
            gte: bookingDateStart,
            lt: bookingDateEnd,
          },
        },
        select: {
          slotId: true,
          count: true,
        },
      });

      for (const b of slotBookings) {
        bookingMap[b.slotId] = (bookingMap[b.slotId] || 0) + (b.count || 0);
      }
    }

    // 5) If category filter is applied, filter centers (ANY-match)
    let filteredCenters = sanitized;
    if (categoryIdList.length > 0) {
      const matched = centerCategories.filter((cc) =>
        categoryIdList.includes(cc.categoryId)
      );
      const allowedCenterIds = new Set(matched.map((m) => m.centerId));
      filteredCenters = sanitized.filter((center) =>
        allowedCenterIds.has(center.id)
      );
      if (filteredCenters.length === 0) {
        return res.json({ count: 0, centers: [] });
      }
    }

    // 6) Compose final response: attach categories and slots (with availability if date provided)
    const responseCenters = filteredCenters.map((center) => {
      // categories: map to simple { id, name }
      const cats = centerCategories
        .filter((cc) => cc.centerId === center.id && cc.category)
        .map((cc) => ({ id: cc.category.id, name: cc.category.name }));

      // slots for this center
      const allSlots = centerSlots.filter(
        (s) => s.centerId === center.id && (s.isActive ?? true)
      );

      const slotsWithAvailability = allSlots.map((slot) => {
        const booked = bookingMap[slot.id] || 0;
        const available = (Number(slot.capacity) || 0) - booked;
        return {
          id: slot.id,
          name: slot.name,
          startTime: slot.startTime,
          endTime: slot.endTime,
          capacity: slot.capacity,
          bookedCount: booked,
          availableCount: available,
        };
      });

      // 3-HOUR GAP RULE
      const now = new Date();
      const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);

      let availableSlots = slotsWithAvailability;

      // If date == today ⇒ apply 3-hour-gap rule
      const today = new Date();
      const isToday =
        bookingDateStart &&
        bookingDateStart.getFullYear() === today.getFullYear() &&
        bookingDateStart.getMonth() === today.getMonth() &&
        bookingDateStart.getDate() === today.getDate();

      if (isToday) {
        availableSlots = availableSlots.filter((slot) => {
          const slotStart = getSlotDate(slot.startTime);
          return slotStart >= threeHoursLater; // must be >= now+3hr
        });
      }

      // Also apply "slot must have capacity"
      if (!includeFull) {
        availableSlots = availableSlots.filter((s) => s.availableCount > 0);
      }

      const finalSlots = availableSlots;

      return {
        ...center,
        categories: cats,
        slots: finalSlots,
      };
    });

    return res.json({
      count: responseCenters.length,
      centers: responseCenters,
    });
  } catch (error) {
    console.error("Error fetching nearby centers:", error);
    return res.status(500).json({ error: "Failed to fetch nearby centers" });
  }
};

export const assignCategoriesToCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryIds = [] } = req.body;

    // Validate center exists
    const center = await prisma.center.findUnique({
      where: { id: Number(id) },
    });

    if (!center) {
      return res.status(404).json({ error: "Center not found" });
    }

    // Validate categories
    const validCategories = await prisma.category.findMany({
      where: { id: { in: categoryIds.map(Number) } },
    });

    const validIds = validCategories.map((c) => c.id);
    const invalidIds = categoryIds.filter(
      (cid) => !validIds.includes(Number(cid))
    );

    if (invalidIds.length > 0) {
      return res
        .status(400)
        .json({ error: `Invalid category IDs: ${invalidIds.join(", ")}` });
    }

    // Remove old categories
    await prisma.centerCategory.deleteMany({
      where: { centerId: Number(id) },
    });

    // Insert new categories
    await prisma.centerCategory.createMany({
      data: categoryIds.map((cid) => ({
        centerId: Number(id),
        categoryId: Number(cid),
      })),
    });

    const updated = await prisma.center.findUnique({
      where: { id: Number(id) },
      include: {
        categories: {
          include: { category: true },
        },
      },
    });

    res.json({
      message: "Categories assigned successfully",
      center: updated,
    });
  } catch (error) {
    console.error("Error assigning categories:", error);
    res.status(500).json({ error: "Failed to assign categories" });
  }
};

export const createCenterSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startTime, endTime, capacity = 0 } = req.body;

    const center = await prisma.center.findUnique({
      where: { id: Number(id) },
    });

    if (!center) {
      return res.status(404).json({ error: "Center not found" });
    }

    const slot = await prisma.centerSlot.create({
      data: {
        centerId: Number(id),
        name,
        startTime,
        endTime,
        capacity: Number(capacity),
      },
    });

    res.status(201).json({
      message: "Slot created successfully",
      slot,
    });
  } catch (error) {
    console.error("Error creating slot:", error);
    res.status(500).json({ error: "Failed to create slot" });
  }
};

export const getCenterSlots = async (req, res) => {
  try {
    const { id } = req.params;

    const slots = await prisma.centerSlot.findMany({
      where: { centerId: Number(id) },
      orderBy: { startTime: "asc" },
    });

    res.json({ slots });
  } catch (error) {
    console.error("Error fetching center slots:", error);
    res.status(500).json({ error: "Failed to fetch slots" });
  }
};

export const updateCenterSlot = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { name, startTime, endTime, capacity, isActive } = req.body;

    const slot = await prisma.centerSlot.findUnique({
      where: { id: Number(slotId) },
    });

    if (!slot) {
      return res.status(404).json({ error: "Slot not found" });
    }

    const updated = await prisma.centerSlot.update({
      where: { id: Number(slotId) },
      data: {
        name,
        startTime,
        endTime,
        capacity,
        isActive,
      },
    });

    res.json({
      message: "Slot updated successfully",
      slot: updated,
    });
  } catch (error) {
    console.error("Error updating slot:", error);
    res.status(500).json({ error: "Failed to update slot" });
  }
};

export const deleteCenterSlot = async (req, res) => {
  try {
    const { slotId } = req.params;

    await prisma.centerSlot.delete({
      where: { id: Number(slotId) },
    });

    res.json({ message: "Slot deleted successfully" });
  } catch (error) {
    console.error("Error deleting slot:", error);
    res.status(500).json({ error: "Failed to delete slot" });
  }
};
