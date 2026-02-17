import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

/**
 * ✅ Changes done:
 * 1) Category now requires departmentItemId (DepartmentItem relation)
 * 2) Category "type" is optional and should NOT be PATHOLOGY/RADIOLOGY (comes from department)
 * 3) All list APIs support departmentItemId filter
 * 4) Popular filters corrected (use isPopular, not bannerUrl)
 * 5) include departmentItem in responses for UI
 * 6) try/catch everywhere ✅
 */

// ✅ CREATE
export const addCategory = async (req, res) => {
  try {
    const { name, type, order, isPopular, departmentItemId } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }
    if (!departmentItemId) {
      return res.status(400).json({ error: "departmentItemId is required" });
    }


    let imgUrl = null;
    let bannerUrl = null;

    const imageFile = req.files?.image?.[0];
    const bannerFile = req.files?.banner?.[0];

    if (imageFile) imgUrl = await uploadToS3(imageFile, "categories");
    if (bannerFile) bannerUrl = await uploadToS3(bannerFile, "category-banners");

    const category = await prisma.category.create({
      data: {
        name: name.trim(),
        type: type || null,
        order: order !== undefined && order !== null && order !== ""
          ? Number(order)
          : null,
        isPopular: isPopular === "true" || isPopular === true,
        imgUrl,
        bannerUrl,
        departmentItemId: Number(departmentItemId), // ✅ NEW
      },
      include: {
        departmentItem: true, // ✅ for frontend display
      },
    });

    return res.status(201).json(category);
  } catch (error) {
    console.error("Error creating category:", error);

    // unique constraint
    if (error?.code === "P2002") {
      return res.status(409).json({ error: "Category with this name already exists" });
    }

    return res.status(500).json({ error: "Failed to create category" });
  }
};

// ✅ READ ALL (with optional filters + limit)
export const getAllCategories = async (req, res) => {
  try {
    const { type, limit, popular, departmentItemId } = req.query;

    const where = {};

    // ✅ optional filters
    if (departmentItemId) where.departmentItemId = Number(departmentItemId);
    if (type) where.type = type;

    // ✅ if popular=true => isPopular true
    if (popular === "true") where.isPopular = true;

    const categories = await prisma.category.findMany({
      where,
      include: { departmentItem: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: limit ? Number(limit) : undefined,
    });

    return res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
};

// ✅ READ ONE
export const getCategoryById = async (req, res) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: Number(req.params.id) },
      include: { subCategories: true, departmentItem: true },
    });

    if (!category) return res.status(404).json({ error: "Category not found" });
    return res.json(category);
  } catch (error) {
    console.error("Error fetching category:", error);
    return res.status(500).json({ error: "Failed to fetch category" });
  }
};

// ✅ UPDATE
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      type,
      order,
      isPopular,
      removeBanner,
      removeImage,
      departmentItemId,
    } = req.body;

    const existingCategory = await prisma.category.findUnique({
      where: { id: Number(id) },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: "Category not found" });
    }



    let imgUrl = existingCategory.imgUrl;
    let bannerUrl = existingCategory.bannerUrl;

    const imageFile = req.files?.image?.[0];
    const bannerFile = req.files?.banner?.[0];

    const shouldRemoveImage = removeImage === "true" || removeImage === true;
    const shouldRemoveBanner = removeBanner === "true" || removeBanner === true;

    // ✅ remove banner (only if no new banner uploaded)
    if (shouldRemoveBanner && !bannerFile) {
      if (existingCategory.bannerUrl) {
        try {
          await deleteFromS3(existingCategory.bannerUrl);
        } catch (e) {
          console.error("delete banner s3 failed:", e);
        }
      }
      bannerUrl = null;
    }

    // ✅ remove image (only if no new image uploaded)
    if (shouldRemoveImage && !imageFile) {
      if (existingCategory.imgUrl) {
        try {
          await deleteFromS3(existingCategory.imgUrl);
        } catch (e) {
          console.error("delete image s3 failed:", e);
        }
      }
      imgUrl = null;
    }

    // ✅ replace category image
    if (imageFile) {
      if (existingCategory.imgUrl) {
        try {
          await deleteFromS3(existingCategory.imgUrl);
        } catch (e) {
          console.error("replace image delete old failed:", e);
        }
      }
      imgUrl = await uploadToS3(imageFile, "categories");
    }

    // ✅ replace banner image
    if (bannerFile) {
      if (existingCategory.bannerUrl) {
        try {
          await deleteFromS3(existingCategory.bannerUrl);
        } catch (e) {
          console.error("replace banner delete old failed:", e);
        }
      }
      bannerUrl = await uploadToS3(bannerFile, "category-banners");
    }

    const updatedCategory = await prisma.category.update({
      where: { id: Number(id) },
      data: {
        name: name !== undefined ? String(name).trim() : existingCategory.name,
        type: type !== undefined ? (type || null) : existingCategory.type,

        // order: keep same if not provided
        order:
          order !== undefined && order !== null && order !== ""
            ? Number(order)
            : order === "" // if they explicitly send empty string => set null
              ? null
              : existingCategory.order,

        isPopular:
          isPopular !== undefined
            ? isPopular === "true" || isPopular === true
            : existingCategory.isPopular,

        imgUrl,
        bannerUrl,

        // ✅ NEW
        departmentItemId:
          departmentItemId !== undefined && departmentItemId !== null && departmentItemId !== ""
            ? Number(departmentItemId)
            : existingCategory.departmentItemId,
      },
      include: { departmentItem: true },
    });

    return res.json(updatedCategory);
  } catch (error) {
    console.error("Error updating category:", error);

    if (error?.code === "P2002") {
      return res.status(409).json({ error: "Category with this name already exists" });
    }

    return res.status(500).json({ error: "Failed to update category" });
  }
};

// ✅ DELETE (safe + user-friendly)
export const deleteCategory = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid category id" });
    }

    const existingCategory = await prisma.category.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        imgUrl: true,
        bannerUrl: true,
        _count: {
          select: {
            subCategories: true,
            tests: true,
            packages: true,
            centers: true,
            ESignatureCategory: true,
          },
        },
      },
    });

    if (!existingCategory) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    const usage = [
      {
        key: "subCategories",
        label: "Sub Categories",
        count: existingCategory._count.subCategories,
      },
      { key: "tests", label: "Tests", count: existingCategory._count.tests },
      {
        key: "packages",
        label: "Packages",
        count: existingCategory._count.packages,
      },
      {
        key: "centers",
        label: "Center Mappings",
        count: existingCategory._count.centers,
      },
      {
        key: "ESignatureCategory",
        label: "E-Signature Mappings",
        count: existingCategory._count.ESignatureCategory,
      },
    ].filter((x) => x.count > 0);

    if (usage.length > 0) {
      const details = usage.map((u) => `${u.label} (${u.count})`).join(", ");
      return res.status(409).json({
        success: false,
        code: "CATEGORY_IN_USE",
        message: `Cannot delete "${existingCategory.name}". It is already used in: ${details}.`,
        usage,
      });
    }

    await prisma.category.delete({ where: { id } });

    // best-effort S3 cleanup
    try {
      if (existingCategory.imgUrl) await deleteFromS3(existingCategory.imgUrl);
      if (existingCategory.bannerUrl) await deleteFromS3(existingCategory.bannerUrl);
    } catch (s3Err) {
      console.error("S3 delete failed (ignored):", s3Err);
    }

    return res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting category:", error);

    if (error?.code === "P2003") {
      return res.status(409).json({
        success: false,
        code: "CATEGORY_IN_USE",
        message:
          "Cannot delete category because it is referenced in other records.",
        meta: error.meta,
      });
    }

    return res
      .status(500)
      .json({ success: false, message: "Failed to delete category" });
  }
};

export const getPopularCategories = async (req, res) => {
  try {
    const { limit = 6, type, departmentItemId } = req.query;

    const where = { isPopular: true };
    if (type) where.type = type;
    if (departmentItemId) where.departmentItemId = Number(departmentItemId);

    const categories = await prisma.category.findMany({
      where,
      include: { departmentItem: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: Number(limit),
    });

    return res.json(categories);
  } catch (e) {
    console.error("getPopularCategories error:", e);
    return res.status(500).json({ error: "Failed to fetch popular categories" });
  }
};

export const getBasedOnTestType = async (req, res) => {
  try {
    const { type, limit = 50, departmentItemId } = req.query;

    const where = {};
    if (departmentItemId) where.departmentItemId = Number(departmentItemId);

    // ✅ IMPORTANT:
    // You said "remove pathology/radiology from category type".
    // So DON'T rely on type=PATHOLOGY/RADIOLOGY here.
    // If you still want "CHECKUP" behavior, keep it based on category.type (CURATED_CHECKUP / PROFILE etc.)
    if (type) {
      if (String(type).toUpperCase() === "CHECKUP") {
        where.OR = [{ type: "CURATED_CHECKUP" }, { type: "PROFILE" }];
      } else {
        where.type = type;
      }
    }

    const categories = await prisma.category.findMany({
      where,
      include: { departmentItem: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: Number(limit) || 50,
    });

    return res.json({
      success: true,
      categories,
      total: categories.length,
    });
  } catch (e) {
    console.error("getBasedOnTestType error:", e);
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
};
