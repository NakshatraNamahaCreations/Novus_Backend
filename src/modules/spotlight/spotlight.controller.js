import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

// CREATE Spotlight Banner
export const addSpotlightBanner = async (req, res) => {
  try {
    const { subCategoryId } = req.body;

    // validate subCategory
    const subCat = await prisma.subCategory.findUnique({
      where: { id: Number(subCategoryId) },
    });
    if (!subCat) return res.status(400).json({ error: "Invalid subCategoryId" });

    if (!req.file) {
      return res.status(400).json({ error: "Image is required" });
    }

    const imgUrl = await uploadToS3(req.file, "spotlight-banners");

    const banner = await prisma.spotlightBanner.create({
      data: {
        imgUrl,
        subCategoryId: Number(subCategoryId),
      },
    });

    res.status(201).json(banner);
  } catch (error) {
    console.error("Error creating spotlight banner:", error);
    res.status(500).json({ error: "Failed to create spotlight banner" });
  }
};

// READ ALL Spotlight Banners
export const getAllSpotlightBanners = async (req, res) => {
  try {
    const banners = await prisma.spotlightBanner.findMany({
      include: { subCategory: true },
    });
    res.json(banners);
  } catch (error) {
    console.error("Error fetching spotlight banners:", error);
    res.status(500).json({ error: "Failed to fetch spotlight banners" });
  }
};

// READ ONE Spotlight Banner
export const getSpotlightBannerById = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await prisma.spotlightBanner.findUnique({
      where: { id: Number(id) },
      include: { subCategory: true },
    });

    if (!banner) return res.status(404).json({ error: "Spotlight banner not found" });

    res.json(banner);
  } catch (error) {
    console.error("Error fetching spotlight banner:", error);
    res.status(500).json({ error: "Failed to fetch spotlight banner" });
  }
};

// UPDATE Spotlight Banner
export const updateSpotlightBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { subCategoryId } = req.body;

    const existing = await prisma.spotlightBanner.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: "Spotlight banner not found" });

    let imgUrl = existing.imgUrl;
    if (req.file) {
      if (existing.imgUrl) {
        await deleteFromS3(existing.imgUrl);
      }
      imgUrl = await uploadToS3(req.file, "spotlight-banners");
    }

    let finalSubCategoryId = existing.subCategoryId;
    if (subCategoryId) {
      const subCat = await prisma.subCategory.findUnique({
        where: { id: Number(subCategoryId) },
      });
      if (!subCat) return res.status(400).json({ error: "Invalid subCategoryId" });
      finalSubCategoryId = subCat.id;
    }

    const updated = await prisma.spotlightBanner.update({
      where: { id: Number(id) },
      data: {
        imgUrl,
        subCategoryId: finalSubCategoryId,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating spotlight banner:", error);
    res.status(500).json({ error: "Failed to update spotlight banner" });
  }
};

// DELETE Spotlight Banner
export const deleteSpotlightBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.spotlightBanner.findUnique({ where: { id: Number(id) } });
    if (!existing) return res.status(404).json({ error: "Spotlight banner not found" });

    if (existing.imgUrl) {
      await deleteFromS3(existing.imgUrl);
    }

    await prisma.spotlightBanner.delete({ where: { id: Number(id) } });

    res.json({ message: "Spotlight banner deleted successfully" });
  } catch (error) {
    console.error("Error deleting spotlight banner:", error);
    res.status(500).json({ error: "Failed to delete spotlight banner" });
  }
};

// GET Spotlight Banners by SubCategory
export const getSpotlightBannersBySubCategory = async (req, res) => {
  try {
    const { subCategoryId } = req.params;

    const banners = await prisma.spotlightBanner.findMany({
      where: { subCategoryId: Number(subCategoryId) },
      include: { subCategory: true },
    });

    res.json(banners);
  } catch (error) {
    console.error("Error fetching spotlight banners by subCategory:", error);
    res.status(500).json({ error: "Failed to fetch spotlight banners by subCategory" });
  }
};
