import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * CenterPackage schema is:
 * model CenterPackage { centerId Int, testId Int, ... }
 * So frontend must send: testIds = [1,2,3]
 */

/* ✅ CREATE Center */
export const createCenter = async (req, res) => {
  try {
    const {
      name,
      contactName,
      address,
      email,
      alternativeEmail,
      mobile,
      lat,
      long,
      cityId,
      testIds = [],
    } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: "Name and Address are required" });
    }

    // Email unique check
    if (email) {
      const exists = await prisma.center.findUnique({ where: { email } });
      if (exists) return res.status(400).json({ error: "Email already registered" });
    }

    // Validate cityId
    if (cityId) {
      const cityExists = await prisma.city.findUnique({
        where: { id: Number(cityId) },
        select: { id: true },
      });
      if (!cityExists) {
        return res.status(400).json({ error: "Invalid cityId" });
      }
    }

    // Validate testIds (because CenterPackage has testId)
    if (Array.isArray(testIds) && testIds.length > 0) {
      const validTests = await prisma.test.findMany({
        where: { id: { in: testIds.map(Number) } },
        select: { id: true },
      });

      const validSet = new Set(validTests.map((t) => t.id));
      const invalidIds = testIds.filter((t) => !validSet.has(Number(t)));

      if (invalidIds.length) {
        return res
          .status(400)
          .json({ error: `Invalid testIds: ${invalidIds.join(", ")}` });
      }
    }

    const center = await prisma.center.create({
      data: {
        name,
        contactName: contactName || null,
        address,
        email: email || null,
        alternativeEmail: alternativeEmail || null,
        mobile: mobile || null,
        lat: lat !== undefined && lat !== null && lat !== "" ? Number(lat) : null,
        long: long !== undefined && long !== null && long !== "" ? Number(long) : null,

        // ✅ FIX: use relation connect
        ...(req.user?.id ? { createdBy: { connect: { id: Number(req.user.id) } } } : {}),

        // ✅ City relation connect
        ...(cityId ? { city: { connect: { id: Number(cityId) } } } : {}),

        // ✅ test mapping
        ...(Array.isArray(testIds) && testIds.length > 0
          ? {
              centerPackages: {
                create: testIds.map((tid) => ({ testId: Number(tid) })),
              },
            }
          : {}),
      },
      include: {
        city: true,
        centerPackages: { include: { test: true } },
      },
    });

    return res.status(201).json({ message: "Center created successfully", center });
  } catch (error) {
    console.error("Error creating center:", error);
    return res.status(500).json({ error: "Failed to create center" });
  }
};


/* ✅ GET ALL Centers with Pagination + Search */
export const getAllCenters = async (req, res) => {
  try {
    const { page = 1, limit = 15, search = "" } = req.query;
    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { mobile: { contains: search, mode: "insensitive" } },
            { address: { contains: search, mode: "insensitive" } },
            { city: { is: { name: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {};

    const total = await prisma.center.count({ where });

    const centers = await prisma.center.findMany({
      where,
      include: {
        city: true,
        centerPackages: { include: { test: true } },
      },
      orderBy: { name: "asc" },
      skip,
      take,
    });

    return res.json({
      data: centers,
      meta: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Error fetching centers:", error);
    return res.status(500).json({ error: "Failed to fetch centers" });
  }
};


/* ✅ GET ALL Centers with Pagination + Search */
export const getAllCentersforadmin = async (req, res) => {
  try {
    const { page = 1, limit = 15, search = "" } = req.query;

    // ✅ accept categoryId or categoryIds
    let categoryIds = [];

    if (req.query.categoryId) {
      categoryIds = [Number(req.query.categoryId)];
    } else if (req.query.categoryIds) {
      if (Array.isArray(req.query.categoryIds)) {
        categoryIds = req.query.categoryIds.map(Number).filter(Boolean);
      } else {
        categoryIds = String(req.query.categoryIds)
          .split(",")
          .map((x) => Number(x.trim()))
          .filter(Boolean);
      }
    }

    const take = Number(limit);
    const skip = (Number(page) - 1) * take;

    const where = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { mobile: { contains: search, mode: "insensitive" } },
              { address: { contains: search, mode: "insensitive" } },
              {
                city: {
                  is: { name: { contains: search, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),

      // ✅ category filter
      ...(categoryIds.length > 0
        ? {
            categories: {
              some: {
                categoryId: { in: categoryIds },
              },
            },
          }
        : {}),
    };

    const total = await prisma.center.count({ where });

    const centers = await prisma.center.findMany({
      where,
      select: {
        id: true,
        name: true,
        contactName: true,
        mobile: true,
        email: true,
        address: true,

        // ✅ city
        city: true,
        centerSlots: true,
   
      },
      orderBy: { name: "asc" },
      skip,
      take,
    });

    return res.json({
      data: centers,
      meta: {
        total,
        page: Number(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error("Error fetching centers:", error);
    return res.status(500).json({ error: "Failed to fetch centers" });
  }
};

/* ✅ GET ONE Center */
export const getCenterById = async (req, res) => {
  try {
    const { id } = req.params;

    const center = await prisma.center.findUnique({
      where: { id: Number(id) },
      include: {
        city: true,
        centerPackages: { include: { test: true } },
        categories: { include: { category: true } },
      },
    });

    if (!center) return res.status(404).json({ error: "Center not found" });
    return res.json(center);
  } catch (error) {
    console.error("Error fetching center:", error);
    return res.status(500).json({ error: "Failed to fetch center" });
  }
};

/* ✅ UPDATE Center */
export const updateCenter = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.center.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: "Center not found" });

    const {
      name,
      contactName,
      address,
      email,
      alternativeEmail,
      mobile,
      lat,
      long,
      cityId,
      testIds = [],
    } = req.body;

    // Email unique check
    if (email && email !== existing.email) {
      const exists = await prisma.center.findUnique({ where: { email } });
      if (exists) return res.status(400).json({ error: "Email already in use" });
    }

    // Validate cityId if provided
    let cityData = {};
    if (cityId === "" || cityId === null) {
      cityData = { cityId: null };
    } else if (cityId !== undefined) {
      const city = await prisma.city.findUnique({ where: { id: Number(cityId) } });
      if (!city) return res.status(400).json({ error: "Invalid cityId" });
      cityData = { cityId: Number(cityId) };
    }

    // Validate testIds
    if (Array.isArray(testIds) && testIds.length > 0) {
      const validTests = await prisma.test.findMany({
        where: { id: { in: testIds.map(Number) } },
        select: { id: true },
      });

      const validIds = new Set(validTests.map((t) => t.id));
      const invalidIds = testIds.filter((tid) => !validIds.has(Number(tid)));

      if (invalidIds.length > 0) {
        return res.status(400).json({
          error: `Invalid testIds: ${invalidIds.join(", ")}`,
        });
      }
    }

    await prisma.center.update({
      where: { id: Number(id) },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(contactName !== undefined ? { contactName } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(alternativeEmail !== undefined ? { alternativeEmail } : {}),
        ...(mobile !== undefined ? { mobile } : {}),
        ...(lat !== undefined ? { lat: lat === "" || lat === null ? null : Number(lat) } : {}),
        ...(long !== undefined ? { long: long === "" || long === null ? null : Number(long) } : {}),
        ...cityData,
      },
    });

    // Update tests mapping (replace all)
    if (Array.isArray(testIds)) {
      await prisma.centerPackage.deleteMany({ where: { centerId: Number(id) } });

      if (testIds.length > 0) {
        await prisma.centerPackage.createMany({
          data: testIds.map((tid) => ({
            centerId: Number(id),
            testId: Number(tid),
          })),
        });
      }
    }

    const updated = await prisma.center.findUnique({
      where: { id: Number(id) },
      include: {
        city: true,
        centerPackages: { include: { test: true } },
      },
    });

    return res.json({ message: "Center updated successfully", center: updated });
  } catch (error) {
    console.error("Error updating center:", error);
    return res.status(500).json({ error: "Failed to update center" });
  }
};

/* ✅ DELETE Center */
export const deleteCenter = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.center.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: "Center not found" });

    // remove related mappings first (safe)
    await prisma.centerPackage.deleteMany({ where: { centerId: Number(id) } });

    await prisma.center.delete({ where: { id: Number(id) } });

    return res.json({ message: "Center deleted successfully" });
  } catch (error) {
    console.error("Error deleting center:", error);
    return res.status(500).json({ error: "Failed to delete center" });
  }
};

/* -----------------------------
   Nearby Centers (unchanged logic, only include city if needed)
------------------------------ */

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

    const userLat = parseFloat(lat);
    const userLong = parseFloat(long);
    const distanceKm = parseFloat(radius);

    if (isNaN(userLat) || isNaN(userLong)) {
      return res.status(400).json({
        error: "Latitude and longitude are required and must be numbers",
      });
    }
    if (isNaN(distanceKm) || distanceKm <= 0) {
      return res.status(400).json({ error: "Radius must be a positive number" });
    }

    let categoryIdList = [];
    if (categoryIds && typeof categoryIds === "string") {
      categoryIdList = categoryIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    }

    let bookingDateStart = null;
    let bookingDateEnd = null;
    if (date) {
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "Date must be in YYYY-MM-DD format" });
      }
      bookingDateStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0);
      bookingDateEnd = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + 1, 0, 0, 0);
    }

    const includeFull = String(includeFullSlots).toLowerCase() === "true";

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

    const sanitized = nearbyCenters.map((row) => {
      const { password, ...rest } = row;
      return {
        ...rest,
        distance: typeof rest.distance === "string" ? parseFloat(rest.distance) : rest.distance,
      };
    });

    const centerIds = sanitized.map((c) => c.id).filter(Boolean);
    if (centerIds.length === 0) return res.json({ count: 0, centers: [] });

    const centerCategories = await prisma.centerCategory.findMany({
      where: { centerId: { in: centerIds } },
      include: { category: true },
    });

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

    let bookingMap = {};
    if (bookingDateStart && bookingDateEnd && centerSlots.length > 0) {
      const slotIds = centerSlots.map((s) => s.id);
      const slotBookings = await prisma.centerSlotBooking.findMany({
        where: {
          slotId: { in: slotIds },
          date: { gte: bookingDateStart, lt: bookingDateEnd },
        },
        select: { slotId: true, count: true },
      });

      for (const b of slotBookings) {
        bookingMap[b.slotId] = (bookingMap[b.slotId] || 0) + (b.count || 0);
      }
    }

    let filteredCenters = sanitized;
    if (categoryIdList.length > 0) {
      const matched = centerCategories.filter((cc) => categoryIdList.includes(cc.categoryId));
      const allowedCenterIds = new Set(matched.map((m) => m.centerId));
      filteredCenters = sanitized.filter((center) => allowedCenterIds.has(center.id));
      if (filteredCenters.length === 0) return res.json({ count: 0, centers: [] });
    }

    const now = new Date();
    const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const today = new Date();

    const isToday =
      bookingDateStart &&
      bookingDateStart.getFullYear() === today.getFullYear() &&
      bookingDateStart.getMonth() === today.getMonth() &&
      bookingDateStart.getDate() === today.getDate();

    const responseCenters = filteredCenters.map((center) => {
      const cats = centerCategories
        .filter((cc) => cc.centerId === center.id && cc.category)
        .map((cc) => ({ id: cc.category.id, name: cc.category.name }));

      const allSlots = centerSlots.filter((s) => s.centerId === center.id && (s.isActive ?? true));

      let slotsWithAvailability = allSlots.map((slot) => {
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

      if (isToday) {
        slotsWithAvailability = slotsWithAvailability.filter((slot) => {
          const slotStart = getSlotDate(slot.startTime);
          return slotStart >= threeHoursLater;
        });
      }

      if (!includeFull) {
        slotsWithAvailability = slotsWithAvailability.filter((s) => s.availableCount > 0);
      }

      return { ...center, categories: cats, slots: slotsWithAvailability };
    });

    return res.json({ count: responseCenters.length, centers: responseCenters });
  } catch (error) {
    console.error("Error fetching nearby centers:", error);
    return res.status(500).json({ error: "Failed to fetch nearby centers" });
  }
};

/* ✅ Assign Categories */
export const assignCategoriesToCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryIds = [] } = req.body;

    const center = await prisma.center.findUnique({ where: { id: Number(id) } });
    if (!center) return res.status(404).json({ error: "Center not found" });

    const validCategories = await prisma.category.findMany({
      where: { id: { in: categoryIds.map(Number) } },
      select: { id: true },
    });

    const validIds = new Set(validCategories.map((c) => c.id));
    const invalidIds = categoryIds.filter((cid) => !validIds.has(Number(cid)));

    if (invalidIds.length > 0) {
      return res.status(400).json({ error: `Invalid category IDs: ${invalidIds.join(", ")}` });
    }

    await prisma.centerCategory.deleteMany({ where: { centerId: Number(id) } });

    if (categoryIds.length > 0) {
      await prisma.centerCategory.createMany({
        data: categoryIds.map((cid) => ({
          centerId: Number(id),
          categoryId: Number(cid),
        })),
      });
    }

    const updated = await prisma.center.findUnique({
      where: { id: Number(id) },
      include: { categories: { include: { category: true } } },
    });

    return res.json({ message: "Categories assigned successfully", center: updated });
  } catch (error) {
    console.error("Error assigning categories:", error);
    return res.status(500).json({ error: "Failed to assign categories" });
  }
};

/* ✅ Create Slot */
export const createCenterSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startTime, endTime, capacity = 0 } = req.body;

    const center = await prisma.center.findUnique({ where: { id: Number(id) } });
    if (!center) return res.status(404).json({ error: "Center not found" });

    const slot = await prisma.centerSlot.create({
      data: {
        centerId: Number(id),
        name,
        startTime,
        endTime,
        capacity: Number(capacity),
      },
    });

    return res.status(201).json({ message: "Slot created successfully", slot });
  } catch (error) {
    console.error("Error creating slot:", error);
    return res.status(500).json({ error: "Failed to create slot" });
  }
};

export const getCenterSlots = async (req, res) => {
  try {
    const { id } = req.params;

    const slots = await prisma.centerSlot.findMany({
      where: { centerId: Number(id) },
      orderBy: { startTime: "asc" },
    });

    return res.json({ slots });
  } catch (error) {
    console.error("Error fetching center slots:", error);
    return res.status(500).json({ error: "Failed to fetch slots" });
  }
};

export const updateCenterSlot = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { name, startTime, endTime, capacity, isActive } = req.body;

    const slot = await prisma.centerSlot.findUnique({ where: { id: Number(slotId) } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });

    const updated = await prisma.centerSlot.update({
      where: { id: Number(slotId) },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(startTime !== undefined ? { startTime } : {}),
        ...(endTime !== undefined ? { endTime } : {}),
        ...(capacity !== undefined ? { capacity: Number(capacity) } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    return res.json({ message: "Slot updated successfully", slot: updated });
  } catch (error) {
    console.error("Error updating slot:", error);
    return res.status(500).json({ error: "Failed to update slot" });
  }
};

export const deleteCenterSlot = async (req, res) => {
  try {
    const { slotId } = req.params;

    await prisma.centerSlot.delete({ where: { id: Number(slotId) } });

    return res.json({ message: "Slot deleted successfully" });
  } catch (error) {
    console.error("Error deleting slot:", error);
    return res.status(500).json({ error: "Failed to delete slot" });
  }
};
