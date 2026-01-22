import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

// CREATE
export const addSubCategory = async (req, res) => {
  try {
    const { name, catId, order } = req.body;
    let imgUrl = null;

    if (req.file) {
      imgUrl = await uploadToS3(req.file, "subcategories");
    }

    const subCategory = await prisma.subCategory.create({
      data: {
        name,
        order: order ? Number(order) : null,
        catId: Number(catId),
        imgUrl,
      },
    });

    res.status(201).json(subCategory);
  } catch (error) {
    console.error("Error creating subcategory:", error);
    res.status(500).json({ error: "Failed to create subcategory" });
  }
};

// READ ALLj
export const getAllSubCategories = async (req, res) => {
  try {
    const subCategories = await prisma.subCategory.findMany({
      include: { 
        category: true
      },
    });

    res.json(subCategories);
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    res.status(500).json({ error: "Failed to fetch subcategories" });
  }
};


// READ ONE
export const getSubCategoryById = async (req, res) => {
  try {
    const subCategory = await prisma.subCategory.findUnique({
      where: { id: Number(req.params.id) },
      include: { 
        category: true
       
      },
    });

    if (!subCategory)
      return res.status(404).json({ error: "Subcategory not found" });

    res.json(subCategory);
  } catch (error) {
    console.error("Error fetching subcategory:", error);
    res.status(500).json({ error: "Failed to fetch subcategory" });
  }
};


// UPDATE
export const updateSubCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, order, catId } = req.body;

    const existingSubCategory = await prisma.subCategory.findUnique({
      where: { id: Number(id) },
    });

    if (!existingSubCategory) return res.status(404).json({ error: "Subcategory not found" });

    let imgUrl = existingSubCategory.imgUrl;

    if (req.file) {
      if (existingSubCategory.imgUrl) {
        await deleteFromS3(existingSubCategory.imgUrl);
      }
      imgUrl = await uploadToS3(req.file, "subcategories");
    }

    const updatedSubCategory = await prisma.subCategory.update({
      where: { id: Number(id) },
      data: {
        name: name || existingSubCategory.name,
        order: order ? Number(order) : existingSubCategory.order,
        catId: catId ? Number(catId) : existingSubCategory.catId,
        imgUrl,
      },
    });

    res.json(updatedSubCategory);
  } catch (error) {
    console.error("Error updating subcategory:", error);
    res.status(500).json({ error: "Failed to update subcategory" });
  }
};

// DELETE
export const deleteSubCategory = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: "Invalid subcategory id" });
    }

    // 1) fetch subcategory + usage counts
    const existingSubCategory = await prisma.subCategory.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        imgUrl: true,
        _count: {
          select: {
            tests: true, // ✅ relation exists: SubCategory.tests
          },
        },
      },
    });

    if (!existingSubCategory) {
      return res.status(404).json({ success: false, message: "Subcategory not found" });
    }

    const usage = [
      { key: "tests", label: "Tests", count: existingSubCategory._count.tests },
    ].filter((x) => x.count > 0);

    // 2) block if used
    if (usage.length > 0) {
      const details = usage.map((u) => `${u.label} (${u.count})`).join(", ");
      return res.status(409).json({
        success: false,
        code: "SUBCATEGORY_IN_USE",
        message: `Cannot delete "${existingSubCategory.name}". It is already used in: ${details}.`,
        usage,
      });
    }

    // 3) delete DB first
    await prisma.subCategory.delete({ where: { id } });

    // 4) delete S3 best-effort
    try {
      if (existingSubCategory.imgUrl) {
        await deleteFromS3(existingSubCategory.imgUrl);
      }
    } catch (s3Err) {
      console.error("S3 delete failed (ignored):", s3Err);
    }

    return res.json({ success: true, message: "Subcategory deleted successfully" });
  } catch (error) {
    console.error("Error deleting subcategory:", error);

    // FK fallback (if anything else references it)
    if (error?.code === "P2003") {
      return res.status(409).json({
        success: false,
        code: "SUBCATEGORY_IN_USE",
        message: "Cannot delete subcategory because it is referenced in other records.",
        meta: error.meta,
      });
    }

    return res.status(500).json({ success: false, message: "Failed to delete subcategory" });
  }
};



export const getSubCategoriesByCategoryId = async (req, res) => {
  try {
    const { catId } = req.params;

    const subCategories = await prisma.subCategory.findMany({
      where: { catId: Number(catId) },
      include: {
        category: true
      }
    });

    if (subCategories.length === 0) {
      return res.status(404).json({ error: "No subcategories found" });
    }

    res.json(subCategories);
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    res.status(500).json({ error: "Failed to fetch subcategories by category" });
  }
};


