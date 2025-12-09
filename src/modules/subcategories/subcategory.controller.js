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
    const { id } = req.params;

    const existingSubCategory = await prisma.subCategory.findUnique({
      where: { id: Number(id) },
    });

    if (!existingSubCategory) return res.status(404).json({ error: "Subcategory not found" });

    if (existingSubCategory.imgUrl) {
      await deleteFromS3(existingSubCategory.imgUrl);
    }

    await prisma.subCategory.delete({
      where: { id: Number(id) },
    });

    res.json({ message: "Subcategory deleted successfully" });
  } catch (error) {
    console.error("Error deleting subcategory:", error);
    res.status(500).json({ error: "Failed to delete subcategory" });
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
