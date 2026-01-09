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
    if (bannerFile) bannerUrl = await uploadToS3(bannerFile, "category-banners");

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

    // popular=true => only categories that have bannerUrl (optional rule)
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
    const { name, type, order, isPopular } = req.body;

    const existingCategory = await prisma.category.findUnique({
      where: { id: Number(id) },
    });

    if (!existingCategory)
      return res.status(404).json({ error: "Category not found" });

    let imgUrl = existingCategory.imgUrl;
    let bannerUrl = existingCategory.bannerUrl;

    const imageFile = req.files?.image?.[0];
    const bannerFile = req.files?.banner?.[0];

    // ✅ replace category image
    if (imageFile) {
      if (existingCategory.imgUrl) await deleteFromS3(existingCategory.imgUrl);
      imgUrl = await uploadToS3(imageFile, "categories");
    }

    // ✅ replace banner image
    if (bannerFile) {
      if (existingCategory.bannerUrl) await deleteFromS3(existingCategory.bannerUrl);
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
        ? (isPopular === "true" || isPopular === true)
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
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCategory = await prisma.category.findUnique({
      where: { id: Number(id) },
    });

    if (!existingCategory)
      return res.status(404).json({ error: "Category not found" });

    if (existingCategory.imgUrl) await deleteFromS3(existingCategory.imgUrl);
    if (existingCategory.bannerUrl) await deleteFromS3(existingCategory.bannerUrl);

    await prisma.category.delete({ where: { id: Number(id) } });

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Failed to delete category" });
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
