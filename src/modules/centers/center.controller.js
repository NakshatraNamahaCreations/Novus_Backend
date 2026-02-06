import { PrismaClient } from "@prisma/client";
import dayjs from "dayjs";
const prisma = new PrismaClient();

const toBool = (v, fallback = false) => {
  if (v === true || v === false) return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return fallback;
};

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
      isSelf,
        showApp,  
      testIds = [],
    } = req.body;

    const cleanName = String(name || "").trim();
    const cleanAddress = String(address || "").trim();

    if (!cleanName || !cleanAddress) {
      return res.status(400).json({ error: "Name and Address are required" });
    }

    // ✅ Email unique check
    if (email) {
      const exists = await prisma.center.findUnique({ where: { email } });
      if (exists)
        return res.status(400).json({ error: "Email already registered" });
    }

    // ✅ Validate cityId
    if (cityId) {
      const cityExists = await prisma.city.findUnique({
        where: { id: Number(cityId) },
        select: { id: true },
      });
      if (!cityExists) return res.status(400).json({ error: "Invalid cityId" });
    }

    // ✅ Normalize testIds
    const testIdNums = Array.isArray(testIds)
      ? testIds.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];

    if (testIdNums.length > 0) {
      const validTests = await prisma.test.findMany({
        where: { id: { in: testIdNums } },
        select: { id: true },
      });

      const validSet = new Set(validTests.map((t) => t.id));
      const invalidIds = testIdNums.filter((t) => !validSet.has(t));
      if (invalidIds.length) {
        return res
          .status(400)
          .json({ error: `Invalid testIds: ${invalidIds.join(", ")}` });
      }
    }

    const center = await prisma.center.create({
      data: {
        name: cleanName,
        contactName: contactName ? String(contactName).trim() : null,
        address: cleanAddress,
        email: email || null,
        alternativeEmail: alternativeEmail || null,
        mobile: mobile || null,
         showApp: toBool(showApp, false),
        isSelf: toBool(isSelf, false), // ✅ FIXED
        lat:
          lat !== undefined && lat !== null && lat !== "" ? Number(lat) : null,
        long:
          long !== undefined && long !== null && long !== ""
            ? Number(long)
            : null,

        ...(req.user?.id
          ? { createdBy: { connect: { id: Number(req.user.id) } } }
          : {}),

        ...(cityId ? { city: { connect: { id: Number(cityId) } } } : {}),

        ...(testIdNums.length > 0
          ? {
              centerPackages: {
                create: testIdNums.map((tid) => ({ testId: tid })),
              },
            }
          : {}),
      },
      include: {
        city: true,
        centerPackages: { include: { test: true } },
      },
    });

    return res
      .status(201)
      .json({ message: "Center created successfully", center });
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
            {
              city: { is: { name: { contains: search, mode: "insensitive" } } },
            },
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
        isSelf:true,
        city: true,
           showApp: true,
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

    const existing = await prisma.center.findUnique({
      where: { id: Number(id) },
    });
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
      isSelf,
       showApp,
      testIds = [],
    } = req.body;

    // Email unique check
    if (email && email !== existing.email) {
      const exists = await prisma.center.findUnique({ where: { email } });
      if (exists)
        return res.status(400).json({ error: "Email already in use" });
    }

    // Validate cityId if provided
    let cityData = {};
    if (cityId === "" || cityId === null) {
      cityData = { cityId: null };
    } else if (cityId !== undefined) {
      const city = await prisma.city.findUnique({
        where: { id: Number(cityId) },
      });
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
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(contactName !== undefined
          ? { contactName: contactName ? String(contactName).trim() : null }
          : {}),
        ...(address !== undefined
          ? { address: address ? String(address).trim() : null }
          : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(alternativeEmail !== undefined
          ? { alternativeEmail: alternativeEmail || null }
          : {}),
        ...(mobile !== undefined ? { mobile: mobile || null } : {}),
          ...(showApp !== undefined ? { showApp: toBool(showApp, existing.showApp) } : {}), 
        ...(isSelf !== undefined
          ? { isSelf: toBool(isSelf, existing.isSelf) }
          : {}), // ✅ FIXED
        ...(lat !== undefined
          ? { lat: lat === "" || lat === null ? null : Number(lat) }
          : {}),
        ...(long !== undefined
          ? { long: long === "" || long === null ? null : Number(long) }
          : {}),
        ...cityData,
      },
    });

    // Update tests mapping (replace all)
    if (Array.isArray(testIds)) {
      await prisma.centerPackage.deleteMany({
        where: { centerId: Number(id) },
      });

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

    return res.json({
      message: "Center updated successfully",
      center: updated,
    });
  } catch (error) {
    console.error("Error updating center:", error);
    return res.status(500).json({ error: "Failed to update center" });
  }
};

/* ✅ DELETE Center */
export const deleteCenter = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.center.findUnique({
      where: { id: Number(id) },
    });
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



export const getNearbyCenters = async (req, res) => {
  try {
    const { lat, long, radius = 1000, categoryIds } = req.query;

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

    // ✅ parse categoryIds (comma-separated)
    let categoryIdList = [];
    if (categoryIds && typeof categoryIds === "string") {
      categoryIdList = categoryIds
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    }

    // ✅ raw query for nearby centers
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
          AND c."showApp" = true
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

    // ✅ sanitize (remove password + normalize distance)
    const sanitized = nearbyCenters.map((row) => {
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
    if (centerIds.length === 0) return res.json({ count: 0, centers: [] });

    // ✅ categories for centers
    const centerCategories = await prisma.centerCategory.findMany({
      where: { centerId: { in: centerIds } },
      include: { category: true },
    });

    // ✅ filter centers: MUST have ALL requested categories
    let filteredCenters = sanitized;

    if (categoryIdList.length > 0) {
      // build centerId -> Set(categoryId)
      const centerToCategorySet = new Map();

      for (const cc of centerCategories) {
        if (!centerToCategorySet.has(cc.centerId)) {
          centerToCategorySet.set(cc.centerId, new Set());
        }
        centerToCategorySet.get(cc.centerId).add(cc.categoryId);
      }

      filteredCenters = sanitized.filter((center) => {
        const set = centerToCategorySet.get(center.id);
        if (!set) return false;

        // ✅ must contain ALL
        return categoryIdList.every((catId) => set.has(catId));
      });

      if (filteredCenters.length === 0) {
        return res.json({ count: 0, centers: [] });
      }
    }

    // ✅ attach categories to each center
    const responseCenters = filteredCenters.map((center) => {
      const cats = centerCategories
        .filter((cc) => cc.centerId === center.id && cc.category)
        .map((cc) => ({ id: cc.category.id, name: cc.category.name }));

      return { ...center, categories: cats };
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




/* ✅ Assign Categories */
export const assignCategoriesToCenter = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryIds = [] } = req.body;

    const center = await prisma.center.findUnique({
      where: { id: Number(id) },
    });
    if (!center) return res.status(404).json({ error: "Center not found" });

    const validCategories = await prisma.category.findMany({
      where: { id: { in: categoryIds.map(Number) } },
      select: { id: true },
    });

    const validIds = new Set(validCategories.map((c) => c.id));
    const invalidIds = categoryIds.filter((cid) => !validIds.has(Number(cid)));

    if (invalidIds.length > 0) {
      return res
        .status(400)
        .json({ error: `Invalid category IDs: ${invalidIds.join(", ")}` });
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

    return res.json({
      message: "Categories assigned successfully",
      center: updated,
    });
  } catch (error) {
    console.error("Error assigning categories:", error);
    return res.status(500).json({ error: "Failed to assign categories" });
  }
};

/* ✅ Create Slot */
export const createCenterSlot = async (req, res) => {
  try {
    const { id } = req.params; // centerId
    const { categoryId, name, startTime, endTime, capacity = 0 } = req.body;

    const centerId = Number(id);
    const catId =
      categoryId !== undefined && categoryId !== null
        ? Number(categoryId)
        : null;

    const center = await prisma.center.findUnique({ where: { id: centerId } });
    if (!center) return res.status(404).json({ error: "Center not found" });

    // ✅ if categoryId is provided, validate category exists
    if (catId !== null) {
      const category = await prisma.category.findUnique({
        where: { id: catId },
      });
      if (!category)
        return res.status(404).json({ error: "Category not found" });
    }

    const slot = await prisma.centerSlot.create({
      data: {
        centerId,
        categoryId: catId, // ✅ NEW
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
    const { id } = req.params; // centerId
    const { categoryId, includeGlobal = "true", date } = req.query;

    const centerId = Number(id);
    if (!centerId) return res.status(400).json({ error: "Invalid centerId" });

    const catId =
      categoryId !== undefined && categoryId !== null && categoryId !== ""
        ? Number(categoryId)
        : null;

    // ✅ date handling (default today)
    const target = date ? dayjs(date) : dayjs();
    if (!target.isValid()) {
      return res.status(400).json({ error: "Invalid date. Use YYYY-MM-DD" });
    }

    const startOfDay = target.startOf("day").toDate();
    const endOfDay = target.endOf("day").toDate();

    // ✅ build where condition for slots
    let where = { centerId };

    if (catId !== null) {
      const useGlobal = String(includeGlobal) === "true";
      where = useGlobal
        ? { centerId, OR: [{ categoryId: catId }, { categoryId: null }] }
        : { centerId, categoryId: catId };
    }

    // 1) fetch slots
    const slots = await prisma.centerSlot.findMany({
      where,
      orderBy: { startTime: "asc" },
  
      include: {
        category: { select: { id: true, name: true } },
      },
    });

   
    const grouped = await prisma.centerSlotBooking.groupBy({
      by: ["centerSlotId"],
      where: {
        centerId,
        slotDate: { gte: startOfDay, lte: endOfDay },
       
      },
      _count: { _all: true },
      _sum: { quantity: true }, 
    });

    const bookedMap = new Map(
      grouped.map((g) => [
        g.centerSlotId,
        // prefer quantity sum if present, else fallback to count
        Number(g._sum?.quantity ?? 0) || g._count._all,
      ])
    );

    // 3) attach availability
    const data = slots.map((slot) => {
      const capacity = Number(slot.capacity || 0);
      const booked = bookedMap.get(slot.id) || 0;
      const remaining = Math.max(capacity - booked, 0);

      return {
        ...slot,
        date: target.format("YYYY-MM-DD"),
        booked,
        remaining,
        isFull: capacity > 0 ? booked >= capacity : false,
      };
    });

    return res.json({
      date: target.format("YYYY-MM-DD"),
      slots: data,
    });
  } catch (error) {
    console.error("Error fetching center slots:", error);
    return res.status(500).json({ error: "Failed to fetch slots" });
  }
};
export const updateCenterSlot = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { categoryId, name, startTime, endTime, capacity, isActive } =
      req.body;

    const id = Number(slotId);

    const slot = await prisma.centerSlot.findUnique({ where: { id } });
    if (!slot) return res.status(404).json({ error: "Slot not found" });

    const catId =
      categoryId !== undefined && categoryId !== null
        ? Number(categoryId)
        : undefined;

    // ✅ validate category if provided
    if (catId !== undefined) {
      const category = await prisma.category.findUnique({
        where: { id: catId },
      });
      if (!category)
        return res.status(404).json({ error: "Category not found" });
    }

    const updated = await prisma.centerSlot.update({
      where: { id },
      data: {
        ...(catId !== undefined ? { categoryId: catId } : {}),
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

export const getCenterCategories = async (req, res) => {
  try {
    const centerId = Number(req.params.id);

    const rows = await prisma.centerCategory.findMany({
      where: { centerId },
      include: { category: true },
      orderBy: { id: "asc" },
    });

    const categories = rows.map((r) => r.category);
    return res.json({ categories });
  } catch (e) {
    console.error("getCenterCategories error:", e);
    return res.status(500).json({ error: "Failed to fetch center categories" });
  }
};

export const getCenterCategoryCommissions = async (req, res) => {
  try {
    const centerId = Number(req.params.centerId);
    if (!Number.isFinite(centerId) || centerId <= 0) {
      return res.status(400).json({ success: false, message: "Valid centerId required" });
    }

    const rows = await prisma.centerCategoryCommission.findMany({
      where: { centerId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("GET COMMISSIONS ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const upsertCenterCategoryCommissions = async (req, res) => {
  try {
    const centerId = Number(req.params.centerId);
    const commissions = Array.isArray(req.body?.commissions) ? req.body.commissions : [];

    if (!Number.isFinite(centerId) || centerId <= 0) {
      return res.status(400).json({ success: false, message: "Valid centerId required" });
    }

    // basic validation
    for (const c of commissions) {
      const categoryId = Number(c.categoryId);
      const type = String(c.type || "PERCENT").toUpperCase();
      const value = Number(c.value || 0);

      if (!Number.isFinite(categoryId) || categoryId <= 0) {
        return res.status(400).json({ success: false, message: "categoryId invalid" });
      }
      if (!["PERCENT", "AMOUNT"].includes(type)) {
        return res.status(400).json({ success: false, message: "type must be PERCENT or AMOUNT" });
      }
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ success: false, message: "value must be >= 0" });
      }
      if (type === "PERCENT" && value > 100) {
        return res.status(400).json({ success: false, message: "percent cannot be > 100" });
      }
    }

    const userId = req.user?.id ? Number(req.user.id) : null;

    // Upsert all in a transaction
    await prisma.$transaction(
      commissions.map((c) => {
        const categoryId = Number(c.categoryId);
        const type = String(c.type || "PERCENT").toUpperCase();
        const value = Number(c.value || 0);
        const isActive = c.isActive !== false;

        return prisma.centerCategoryCommission.upsert({
          where: { centerId_categoryId: { centerId, categoryId } },
          create: {
            centerId,
            categoryId,
            type,
            value,
            isActive,
            createdById: userId,
          },
          update: {
            type,
            value,
            isActive,
          },
        });
      })
    );

    const fresh = await prisma.centerCategoryCommission.findMany({
      where: { centerId },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return res.json({ success: true, message: "Commissions saved", data: fresh });
  } catch (err) {
    console.error("UPSERT COMMISSIONS ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};