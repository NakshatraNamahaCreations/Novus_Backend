import prisma from '../../lib/prisma.js';
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";
import redis, { getOrSet } from '../../utils/cache.js';

// ─────────────────────────────────────────
//  CACHE CONFIG
// ─────────────────────────────────────────

const CACHE_TTL = 60 * 60; // 1 hour

const keys = {
  all:       (type, limit, popular) => `categories:all:${type||''}:${limit||''}:${popular||''}`,
  byId:      (id)                   => `categories:id:${id}`,
  popular:   (type, limit)          => `categories:popular:${type||''}:${limit||''}`,
  byType:    (type, limit)          => `categories:type:${type||''}:${limit||''}`,
};

const invalidateCaches = async (id = null) => {
  const toDelete = [];

  // Wipe all pattern-based keys
  const [allKeys, popularKeys, typeKeys] = await Promise.all([
    redis.keys('categories:all:*'),
    redis.keys('categories:popular:*'),
    redis.keys('categories:type:*'),
  ]);

  toDelete.push(...allKeys, ...popularKeys, ...typeKeys);

  if (id) toDelete.push(keys.byId(id));

  if (toDelete.length) await redis.del(...toDelete);
};

// ─────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────

export const addCategory = async (req, res) => {
  try {
    const { name, type, order, isPopular } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }

    let imgUrl    = null;
    let bannerUrl = null;

    const imageFile  = req.files?.image?.[0];
    const bannerFile = req.files?.banner?.[0];

    if (imageFile)  imgUrl    = await uploadToS3(imageFile,  "categories");
    if (bannerFile) bannerUrl = await uploadToS3(bannerFile, "category-banners");

    const category = await prisma.category.create({
      data: {
        name:      name.trim(),
        type:      type || null,
        order:     order !== undefined && order !== null && order !== "" ? Number(order) : null,
        isPopular: isPopular === "true" || isPopular === true,
        imgUrl,
        bannerUrl,
      },
    });

    await invalidateCaches();

    return res.status(201).json(category);
  } catch (error) {
    console.error("Error creating category:", error);
    if (error?.code === "P2002") {
      return res.status(409).json({ error: "Category with this name already exists" });
    }
    return res.status(500).json({ error: "Failed to create category" });
  }
};

// ─────────────────────────────────────────
//  READ ALL  ── CACHED
// ─────────────────────────────────────────

export const getAllCategories = async (req, res) => {
  try {
    const { type, limit, popular } = req.query;

    const data = await getOrSet(
      keys.all(type, limit, popular),
      CACHE_TTL,
      async () => {
        const where = {};
        if (type)            where.type      = type;
        if (popular === "true") where.isPopular = true;

        return prisma.category.findMany({
          where,
          orderBy: [{ order: "asc" }, { createdAt: "desc" }],
          take: limit ? Number(limit) : undefined,
        });
      }
    );

    return res.json(data);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
};

// ─────────────────────────────────────────
//  READ ONE  ── CACHED
// ─────────────────────────────────────────

export const getCategoryById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const data = await getOrSet(
      keys.byId(id),
      CACHE_TTL,
      () => prisma.category.findUnique({
        where:   { id },
        include: { subCategories: true },
      })
    );

    if (!data) return res.status(404).json({ error: "Category not found" });
    return res.json(data);
  } catch (error) {
    console.error("Error fetching category:", error);
    return res.status(500).json({ error: "Failed to fetch category" });
  }
};

// ─────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────

export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, order, isPopular, removeBanner, removeImage } = req.body;

    const existingCategory = await prisma.category.findUnique({
      where: { id: Number(id) },
    });

    if (!existingCategory) {
      return res.status(404).json({ error: "Category not found" });
    }

    let imgUrl    = existingCategory.imgUrl;
    let bannerUrl = existingCategory.bannerUrl;

    const imageFile  = req.files?.image?.[0];
    const bannerFile = req.files?.banner?.[0];

    const shouldRemoveImage  = removeImage  === "true" || removeImage  === true;
    const shouldRemoveBanner = removeBanner === "true" || removeBanner === true;

    if (shouldRemoveBanner && !bannerFile) {
      if (existingCategory.bannerUrl) {
        try { await deleteFromS3(existingCategory.bannerUrl); } catch (e) { console.error("delete banner s3 failed:", e); }
      }
      bannerUrl = null;
    }

    if (shouldRemoveImage && !imageFile) {
      if (existingCategory.imgUrl) {
        try { await deleteFromS3(existingCategory.imgUrl); } catch (e) { console.error("delete image s3 failed:", e); }
      }
      imgUrl = null;
    }

    if (imageFile) {
      if (existingCategory.imgUrl) {
        try { await deleteFromS3(existingCategory.imgUrl); } catch (e) { console.error("replace image delete old failed:", e); }
      }
      imgUrl = await uploadToS3(imageFile, "categories");
    }

    if (bannerFile) {
      if (existingCategory.bannerUrl) {
        try { await deleteFromS3(existingCategory.bannerUrl); } catch (e) { console.error("replace banner delete old failed:", e); }
      }
      bannerUrl = await uploadToS3(bannerFile, "category-banners");
    }

    const updatedCategory = await prisma.category.update({
      where: { id: Number(id) },
      data: {
        name:      name      !== undefined ? String(name).trim() : existingCategory.name,
        type:      type      !== undefined ? (type || null)       : existingCategory.type,
        order:     order     !== undefined && order !== null && order !== ""
                     ? Number(order)
                     : order === "" ? null : existingCategory.order,
        isPopular: isPopular !== undefined
                     ? isPopular === "true" || isPopular === true
                     : existingCategory.isPopular,
        imgUrl,
        bannerUrl,
      },
    });

    await invalidateCaches(Number(id));

    return res.json(updatedCategory);
  } catch (error) {
    console.error("Error updating category:", error);
    if (error?.code === "P2002") {
      return res.status(409).json({ error: "Category with this name already exists" });
    }
    return res.status(500).json({ error: "Failed to update category" });
  }
};

// ─────────────────────────────────────────
//  DELETE
// ─────────────────────────────────────────

export const deleteCategory = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid category id" });
    }

    const existingCategory = await prisma.category.findUnique({
      where:  { id },
      select: {
        id: true, name: true, imgUrl: true, bannerUrl: true,
        _count: { select: { subCategories: true, tests: true, packages: true, centers: true } },
      },
    });

    if (!existingCategory) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const usage = [
      { key: "subCategories", label: "Sub Categories",      count: existingCategory._count.subCategories },
      { key: "tests",         label: "Tests",               count: existingCategory._count.tests },
      { key: "packages",      label: "Packages",            count: existingCategory._count.packages },
      { key: "centers",       label: "Center Mappings",     count: existingCategory._count.centers },
    ].filter((x) => x.count > 0);

    if (usage.length > 0) {
      const details = usage.map((u) => `${u.label} (${u.count})`).join(", ");
      return res.status(409).json({
        success: false,
        code:    "CATEGORY_IN_USE",
        message: `Cannot delete "${existingCategory.name}". It is already used in: ${details}.`,
        usage,
      });
    }

    await prisma.category.delete({ where: { id } });

    await invalidateCaches(id);

    // best-effort S3 cleanup
    try {
      if (existingCategory.imgUrl)    await deleteFromS3(existingCategory.imgUrl);
      if (existingCategory.bannerUrl) await deleteFromS3(existingCategory.bannerUrl);
    } catch (s3Err) {
      console.error("S3 delete failed (ignored):", s3Err);
    }

    return res.json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    if (error?.code === "P2003") {
      return res.status(409).json({
        success: false,
        code:    "CATEGORY_IN_USE",
        message: "Cannot delete category because it is referenced in other records.",
        meta:    error.meta,
      });
    }
    return res.status(500).json({ success: false, message: "Failed to delete category" });
  }
};

// ─────────────────────────────────────────
//  POPULAR CATEGORIES  ── CACHED
// ─────────────────────────────────────────

export const getPopularCategories = async (req, res) => {
  try {
    const { limit = 6, type } = req.query;

    const data = await getOrSet(
      keys.popular(type, limit),
      CACHE_TTL,
      async () => {
        const where = { isPopular: true };
        if (type) where.type = type;

        return prisma.category.findMany({
          where,
          orderBy: [{ order: "asc" }, { createdAt: "desc" }],
          take: Number(limit),
        });
      }
    );

    return res.json(data);
  } catch (e) {
    console.error("getPopularCategories error:", e);
    return res.status(500).json({ error: "Failed to fetch popular categories" });
  }
};

// ─────────────────────────────────────────
//  BY TEST TYPE  ── CACHED
// ─────────────────────────────────────────

export const getBasedOnTestType = async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;

    const data = await getOrSet(
      keys.byType(type, limit),
      CACHE_TTL,
      async () => {
        const where = {};

        if (type) {
          if (String(type).toUpperCase() === "CHECKUP") {
            where.OR = [{ type: "CURATED_CHECKUP" }, { type: "PATHOLOGY" }];
          } else {
            where.type = type;
          }
        }

        const categories = await prisma.category.findMany({
          where,
          orderBy: [{ order: "asc" }, { createdAt: "desc" }],
          take: Number(limit) || 50,
        });

        return { success: true, categories, total: categories.length };
      }
    );

    return res.json(data);
  } catch (e) {
    console.error("getBasedOnTestType error:", e);
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
};