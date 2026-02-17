import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Helpers
 */
const toBool = (v) => v === true || v === "true";
const toInt = (v, def = null) => {
  if (v === undefined || v === null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const normalizeType = (t) => (t ? String(t).toUpperCase() : null);

// ✅ CREATE
export const addDepartmentItem = async (req, res) => {
  try {
    const { name, type, isActive, sortOrder } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: "Name is required" });
    }
    if (!type) {
      return res.status(400).json({ success: false, message: "Type is required" });
    }

    const created = await prisma.departmentItem.create({
      data: {
        name: String(name).trim(),
        type: normalizeType(type),
        isActive: isActive !== undefined ? toBool(isActive) : true,
        sortOrder: sortOrder !== undefined ? toInt(sortOrder, 0) : 0,
      },
    });

    return res.status(201).json({ success: true, department: created });
  } catch (error) {
    console.error("Error creating department item:", error);

    // Unique constraint on name
    if (error?.code === "P2002") {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_NAME",
        message: "Department item name already exists",
        meta: error.meta,
      });
    }

    return res.status(500).json({ success: false, message: "Failed to create department item" });
  }
};

// ✅ READ ALL (filters + pagination + include optional)
export const getAllDepartmentItems = async (req, res) => {
  try {
    const { type, isActive, limit, page, includeCategories } = req.query;

    const where = {};
    if (type) where.type = normalizeType(type);
    if (isActive !== undefined) where.isActive = toBool(isActive);

    const take = limit ? toInt(limit, 50) : 50;
    const pageNum = page ? Math.max(toInt(page, 1), 1) : 1;
    const skip = (pageNum - 1) * take;

    const [items, total] = await Promise.all([
      prisma.departmentItem.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        take,
        skip,
        include: toBool(includeCategories)
          ? {
              categories: { select: { id: true, name: true, type: true, order: true } },
            }
          : undefined,
      }),
      prisma.departmentItem.count({ where }),
    ]);

    return res.json({
      success: true,
      items,
      total,
      page: pageNum,
      limit: take,
      pages: Math.ceil(total / take),
    });
  } catch (error) {
    console.error("Error fetching department items:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch department items" });
  }
};

// ✅ READ ONE
export const getDepartmentItemById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid department id" });
    }

    const item = await prisma.departmentItem.findUnique({
      where: { id },
      include: {
        categories: { select: { id: true, name: true, type: true, order: true } },
      },
    });

    if (!item) return res.status(404).json({ success: false, message: "Department item not found" });

    return res.json({ success: true, department: item });
  } catch (error) {
    console.error("Error fetching department item:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch department item" });
  }
};

// ✅ UPDATE
export const updateDepartmentItem = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid department id" });
    }

    const { name, type, isActive, sortOrder } = req.body;

    const existing = await prisma.departmentItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Department item not found" });
    }

    const updated = await prisma.departmentItem.update({
      where: { id },
      data: {
        name: name !== undefined ? String(name).trim() : existing.name,
        type: type !== undefined ? normalizeType(type) : existing.type,
        isActive: isActive !== undefined ? toBool(isActive) : existing.isActive,
        sortOrder: sortOrder !== undefined ? toInt(sortOrder, existing.sortOrder ?? 0) : existing.sortOrder,
      },
    });

    return res.json({ success: true, department: updated });
  } catch (error) {
    console.error("Error updating department item:", error);

    if (error?.code === "P2002") {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE_NAME",
        message: "Department item name already exists",
        meta: error.meta,
      });
    }

    return res.status(500).json({ success: false, message: "Failed to update department item" });
  }
};

// ✅ DELETE (safe)
export const deleteDepartmentItem = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid department id" });
    }

    // check usage
    const existing = await prisma.departmentItem.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { categories: true } },
      },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Department item not found" });
    }

    if (existing._count.categories > 0) {
      return res.status(409).json({
        success: false,
        code: "DEPARTMENT_IN_USE",
        message: `Cannot delete "${existing.name}". It has ${existing._count.categories} linked categories.`,
        usage: [{ key: "categories", label: "Categories", count: existing._count.categories }],
      });
    }

    await prisma.departmentItem.delete({ where: { id } });

    return res.json({ success: true, message: "Department item deleted successfully" });
  } catch (error) {
    console.error("Error deleting department item:", error);

    // Fallback if still referenced
    if (error?.code === "P2003") {
      return res.status(409).json({
        success: false,
        code: "DEPARTMENT_IN_USE",
        message: "Cannot delete department item because it is referenced in other records.",
        meta: error.meta,
      });
    }

    return res.status(500).json({ success: false, message: "Failed to delete department item" });
  }
};

// ✅ QUICK FILTER ENDPOINT (by type)
export const getDepartmentItemsByType = async (req, res) => {
  try {
    const { type, isActive, limit = 50 } = req.query;

    const where = {};
    if (type) where.type = normalizeType(type);
    if (isActive !== undefined) where.isActive = toBool(isActive);

    const items = await prisma.departmentItem.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: toInt(limit, 50),
    });

    return res.json({ success: true, items, total: items.length });
  } catch (error) {
    console.error("getDepartmentItemsByType error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch department items" });
  }
};
