import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

// CREATE Banner
export const addBanner = async (req, res) => {
  try {
    const { subCategoryId } = req.body;

    // ✅ Validate image
    if (!req.file) {
      return res.status(400).json({ error: "Image is required" });
    }

    // ✅ Upload to S3 (adjust to your upload logic)
    const imgUrl = await uploadToS3(req.file, "banners");

    // ✅ If subCategoryId provided, verify existence
    let subCategory = null;
    if (subCategoryId) {
      subCategory = await prisma.subCategory.findUnique({
        where: { id: Number(subCategoryId) },
      });

      if (!subCategory) {
        return res.status(400).json({ error: "Invalid subCategoryId" });
      }
    }

    // ✅ Create banner — include subCategoryId only if provided
    const banner = await prisma.banner.create({
      data: {
        imgUrl,
        ...(subCategoryId ? { subCategoryId: Number(subCategoryId) } : {}),
      },
    });

    return res.status(201).json({
      success: true,
      message: "Banner created successfully",
      banner,
    });
  } catch (error) {
    console.error("Error creating banner:", error);
    return res.status(500).json({ error: "Failed to create banner" });
  }
};


// READ ALL Banners
export const getAllBanners = async (req, res) => {
  try {
    const banners = await prisma.banner.findMany({
      include: { subCategory: true },
    });
    res.json(banners);
  } catch (error) {
    console.error("Error fetching banners:", error);
    res.status(500).json({ error: "Failed to fetch banners" });
  }
};

// READ ONE Banner
export const getBannerById = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await prisma.banner.findUnique({
      where: { id: Number(id) },
      include: { subCategory: true },
    });

    if (!banner) return res.status(404).json({ error: "Banner not found" });

    res.json(banner);
  } catch (error) {
    console.error("Error fetching banner:", error);
    res.status(500).json({ error: "Failed to fetch banner" });
  }
};

// UPDATE Banner
export const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { subCategoryId } = req.body;

    const existing = await prisma.banner.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: "Banner not found" });

    let imgUrl = existing.imgUrl;
    if (req.file) {
      if (existing.imgUrl) {
        await deleteFromS3(existing.imgUrl);
      }
      imgUrl = await uploadToS3(req.file, "banners");
    }

    let finalSubCategoryId = existing.subCategoryId;
    if (subCategoryId) {
      const subCat = await prisma.subCategory.findUnique({
        where: { id: Number(subCategoryId) },
      });
      if (!subCat) return res.status(400).json({ error: "Invalid subCategoryId" });
      finalSubCategoryId = subCat.id;
    }

    const updated = await prisma.banner.update({
      where: { id: Number(id) },
      data: {
        imgUrl,
        subCategoryId: finalSubCategoryId,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating banner:", error);
    res.status(500).json({ error: "Failed to update banner" });
  }
};

// DELETE Banner
export const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.banner.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: "Banner not found" });

    if (existing.imgUrl) {
      await deleteFromS3(existing.imgUrl);
    }

    await prisma.banner.delete({ where: { id: Number(id) } });

    res.json({ message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Error deleting banner:", error);
    res.status(500).json({ error: "Failed to delete banner" });
  }
};

// GET Banners by SubCategory
export const getBannersBySubCategory = async (req, res) => {
  try {
    const { subCategoryId } = req.params;

    const banners = await prisma.banner.findMany({
      where: { subCategoryId: Number(subCategoryId) },
      include: { subCategory: true },
    });

    res.json(banners);
  } catch (error) {
    console.error("Error fetching banners by subCategory:", error);
    res.status(500).json({ error: "Failed to fetch banners by subCategory" });
  }
};
