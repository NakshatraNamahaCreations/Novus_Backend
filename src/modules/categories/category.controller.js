import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

// ✅ CREATE
export const addCategory = async (req, res) => {
  try {
    const { name, type, order, isPopular } = req.body;

    let imgUrl = null;
    let bannerUrl = null;

    const imageFile = req.files?.image?.[0];
    const bannerFile = req.files?.banner?.[0];

    if (imageFile) imgUrl = await uploadToS3(imageFile, "categories");
    if (bannerFile)
      bannerUrl = await uploadToS3(bannerFile, "category-banners");

    const category = await prisma.category.create({
      data: {
        name,
        type,
        order: order ? Number(order) : null,
        isPopular: isPopular === "true" || isPopular === true, // ✅ handle form-data string
        imgUrl,
        bannerUrl,
      },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
};

// ✅ READ ALL (with optional filters + limit)
export const getAllCategories = async (req, res) => {
  try {
    const { type, limit, popular } = req.query;

    const where = {};
    if (type) where.type = type;
    if (popular === "true") where.bannerUrl = { not: null };

    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: limit ? Number(limit) : undefined,
    });

    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

// ✅ READ ONE
export const getCategoryById = async (req, res) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: Number(req.params.id) },
      include: { subCategories: true },
    });

    if (!category) return res.status(404).json({ error: "Category not found" });
    res.json(category);
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({ error: "Failed to fetch category" });
  }
};

// ✅ UPDATE
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, order, isPopular, removeBanner, removeImage } =
      req.body;

    const existingCategory = await prisma.category.findUnique({
      where: { id: Number(id) },
    });

    if (!existingCategory)
      return res.status(404).json({ error: "Category not found" });

    let imgUrl = existingCategory.imgUrl;
    let bannerUrl = existingCategory.bannerUrl;

    const imageFile = req.files?.image?.[0];
    const bannerFile = req.files?.banner?.[0];

    const shouldRemoveImage = removeImage === "true" || removeImage === true;
    const shouldRemoveBanner = removeBanner === "true" || removeBanner === true;

    // ✅ remove banner (only if no new banner uploaded)
    if (shouldRemoveBanner && !bannerFile) {
      if (existingCategory.bannerUrl)
        await deleteFromS3(existingCategory.bannerUrl);
      bannerUrl = null;
    }

    // ✅ remove image (only if no new image uploaded)
    if (shouldRemoveImage && !imageFile) {
      if (existingCategory.imgUrl) await deleteFromS3(existingCategory.imgUrl);
      imgUrl = null;
    }

    // ✅ replace category image
    if (imageFile) {
      if (existingCategory.imgUrl) await deleteFromS3(existingCategory.imgUrl);
      imgUrl = await uploadToS3(imageFile, "categories");
    }

    // ✅ replace banner image
    if (bannerFile) {
      if (existingCategory.bannerUrl)
        await deleteFromS3(existingCategory.bannerUrl);
      bannerUrl = await uploadToS3(bannerFile, "category-banners");
    }

    const updatedCategory = await prisma.category.update({
      where: { id: Number(id) },
      data: {
        name: name ?? existingCategory.name,
        type: type ?? existingCategory.type,
        order: order !== undefined ? Number(order) : existingCategory.order,
        isPopular:
          isPopular !== undefined
            ? isPopular === "true" || isPopular === true
            : existingCategory.isPopular,
        imgUrl,
        bannerUrl,
      },
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Failed to update category" });
  }
};

// ✅ DELETE
// ✅ DELETE (safe + user-friendly)
export const deleteCategory = async (req, res) => {
  try {
    const id = Number(req.params.id);
    console.log("id", id);

    if (!Number.isFinite(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid category id" });
    }

    // 1) find category + usage counts
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

    // 2) block delete if used anywhere
    if (usage.length > 0) {
      const details = usage.map((u) => `${u.label} (${u.count})`).join(", ");
      return res.status(409).json({
        success: false,
        code: "CATEGORY_IN_USE",
        message: `Cannot delete "${existingCategory.name}". It is already used in: ${details}.`,
        usage,
      });
    }

    // 3) delete DB first (prevents deleting S3 when FK fails)
    await prisma.category.delete({ where: { id } });
    console.log("db deleted");

    // 4) delete S3 images best-effort (don’t fail delete if S3 fails)
    try {
      if (existingCategory.imgUrl) await deleteFromS3(existingCategory.imgUrl);
      if (existingCategory.bannerUrl)
        await deleteFromS3(existingCategory.bannerUrl);
    } catch (s3Err) {
      console.error("S3 delete failed (ignored):", s3Err);
    }

    return res.json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting category:", error);

    // If something else still references it (fallback)
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
    const { limit = 6, type } = req.query;

    const where = { isPopular: true };
    if (type) where.type = type;

    const categories = await prisma.category.findMany({
      where,
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: Number(limit),
    });

    res.json(categories);
  } catch (e) {
    console.error("getPopularCategories error:", e);
    res.status(500).json({ error: "Failed to fetch popular categories" });
  }
};

export const getBasedOnTestType = async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;
    const where = {};
    if (type) where.type = type;

    const categories = await prisma.category.findMany({
      where,
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
