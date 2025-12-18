import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

/* =====================================================
   CREATE LAYOUT (ONLY ONCE)
===================================================== */
export const createLayout = async (req, res) => {
  try {
    // 🔒 Allow ONLY ONE layout
    const existing = await prisma.reportLayout.findFirst();
    if (existing) {
      return res.status(400).json({
        error: "Report layout already exists. Please update the existing layout.",
      });
    }

    const { title, alignment } = req.body;

    let headerImg = null;
    let footerImg = null;
    let frontPageLastImg = null;
    let lastPageImg = null;

    if (req.files?.headerImg) {
      headerImg = await uploadToS3(req.files.headerImg[0], "headers");
    }

    if (req.files?.footerImg) {
      footerImg = await uploadToS3(req.files.footerImg[0], "footers");
    }

    if (req.files?.frontPageLastImg) {
      frontPageLastImg = await uploadToS3(
        req.files.frontPageLastImg[0],
        "front-page"
      );
    }

    if (req.files?.lastPageImg) {
      lastPageImg = await uploadToS3(
        req.files.lastPageImg[0],
        "last-page"
      );
    }

    const layout = await prisma.reportLayout.create({
      data: {
        title,
        alignment,
        headerImg,
        footerImg,
        frontPageLastImg,
        lastPageImg,
      },
    });

    res.status(201).json({ success: true, layout });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create report layout" });
  }
};

/* =====================================================
   GET LAYOUT (SINGLE)
===================================================== */
export const getLayouts = async (req, res) => {
  try {
    const layout = await prisma.reportLayout.findFirst();
    res.json({ success: true, layout });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch report layout" });
  }
};

/* =====================================================
   UPDATE LAYOUT
===================================================== */
export const updateLayout = async (req, res) => {
  try {
    const existing = await prisma.reportLayout.findFirst();

    if (!existing) {
      return res.status(404).json({
        error: "Report layout not found. Please create one first.",
      });
    }

    const { title, alignment } = req.body;

    let headerImg = existing.headerImg;
    let footerImg = existing.footerImg;
    let frontPageLastImg = existing.frontPageLastImg;
    let lastPageImg = existing.lastPageImg;

    if (req.files?.headerImg) {
      if (headerImg) await deleteFromS3(headerImg);
      headerImg = await uploadToS3(req.files.headerImg[0], "headers");
    }

    if (req.files?.footerImg) {
      if (footerImg) await deleteFromS3(footerImg);
      footerImg = await uploadToS3(req.files.footerImg[0], "footers");
    }

    if (req.files?.frontPageLastImg) {
      if (frontPageLastImg) await deleteFromS3(frontPageLastImg);
      frontPageLastImg = await uploadToS3(
        req.files.frontPageLastImg[0],
        "front-page"
      );
    }

    if (req.files?.lastPageImg) {
      if (lastPageImg) await deleteFromS3(lastPageImg);
      lastPageImg = await uploadToS3(
        req.files.lastPageImg[0],
        "last-page"
      );
    }

    const updated = await prisma.reportLayout.update({
      where: { id: existing.id },
      data: {
        title,
        alignment,
        headerImg,
        footerImg,
        frontPageLastImg,
        lastPageImg,
      },
    });

    res.json({ success: true, updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update report layout" });
  }
};

/* =====================================================
   DELETE LAYOUT (OPTIONAL / ADMIN ONLY)
===================================================== */
export const deleteLayout = async (req, res) => {
  try {
    const existing = await prisma.reportLayout.findFirst();

    if (!existing) {
      return res.status(404).json({ error: "Report layout not found" });
    }

    if (existing.headerImg) await deleteFromS3(existing.headerImg);
    if (existing.footerImg) await deleteFromS3(existing.footerImg);
    if (existing.frontPageLastImg)
      await deleteFromS3(existing.frontPageLastImg);
    if (existing.lastPageImg)
      await deleteFromS3(existing.lastPageImg);

    await prisma.reportLayout.delete({
      where: { id: existing.id },
    });

    res.json({ success: true, message: "Report layout deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete report layout" });
  }
};
