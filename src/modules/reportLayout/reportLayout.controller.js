import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

// CREATE Layout
export const createLayout = async (req, res) => {
  try {
    const { title, alignment, isDefault } = req.body;

    let headerImg = null;
    let footerImg = null;

    if (req.files?.headerImg) {
      headerImg = await uploadToS3(req.files.headerImg[0], "headers");
    }
    if (req.files?.footerImg) {
      footerImg = await uploadToS3(req.files.footerImg[0], "footers");
    }

    if (isDefault === "true") {
      await prisma.reportLayout.updateMany({
        data: { isDefault: false }, // Make only one default
      });
    }

    const layout = await prisma.reportLayout.create({
      data: {
        title,
        alignment,
        isDefault: isDefault === "true",
        headerImg,
        footerImg,
      },
    });

    res.status(201).json({ success: true, layout });
  } catch (error) {
    res.status(500).json({ error: "Failed to create layout" });
  }
};

// GET ALL
export const getLayouts = async (req, res) => {
  try {
    const layouts = await prisma.reportLayout.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, layouts });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch layouts" });
  }
};

// UPDATE Layout
export const updateLayout = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, alignment, isDefault } = req.body;

    const existing = await prisma.reportLayout.findUnique({
      where: { id: Number(id) },
    });

    let headerImg = existing.headerImg;
    let footerImg = existing.footerImg;

    if (req.files?.headerImg) {
      if (headerImg) await deleteFromS3(headerImg);
      headerImg = await uploadToS3(req.files.headerImg[0], "headers");
    }

    if (req.files?.footerImg) {
      if (footerImg) await deleteFromS3(footerImg);
      footerImg = await uploadToS3(req.files.footerImg[0], "footers");
    }

    if (isDefault === "true") {
      await prisma.reportLayout.updateMany({ data: { isDefault: false } });
    }

    const updated = await prisma.reportLayout.update({
      where: { id: Number(id) },
      data: {
        title,
        alignment,
        isDefault: isDefault === "true",
        headerImg,
        footerImg,
      },
    });

    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
};

// DELETE
export const deleteLayout = async (req, res) => {
  try {
    const { id } = req.params;

    const layout = await prisma.reportLayout.findUnique({
      where: { id: Number(id) },
    });

    if (layout.headerImg) await deleteFromS3(layout.headerImg);
    if (layout.footerImg) await deleteFromS3(layout.footerImg);

    await prisma.reportLayout.delete({ where: { id: Number(id) } });

    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
};
