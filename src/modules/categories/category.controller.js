import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

// ✅ CREATE
export const addCategory = async (req, res) => {
  try {
    const { name,type } = req.body;

    let imgUrl = null;

    if (req.file) {
      imgUrl = await uploadToS3(req.file, "categories");
    }

    const category = await prisma.category.create({
      data: { name, imgUrl,type },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
};

// ✅ READ ALL
export const getAllCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      // include: { subCategories: true },
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
    const { name ,type} = req.body;

    const existingCategory = await prisma.category.findUnique({
      where: { id: Number(id) },
    });

    if (!existingCategory) return res.status(404).json({ error: "Category not found" });

    let imgUrl = existingCategory.imgUrl;

    if (req.file) {
      if (existingCategory.imgUrl) {
        await deleteFromS3(existingCategory.imgUrl);
      }
      imgUrl = await uploadToS3(req.file, "categories");
    }

    const updatedCategory = await prisma.category.update({
      where: { id: Number(id) },
      data: { name: name || existingCategory.name, type:type ||existingCategory.type, imgUrl },
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

    if (!existingCategory) return res.status(404).json({ error: "Category not found" });

    if (existingCategory.imgUrl) {
      await deleteFromS3(existingCategory.imgUrl);
    }

    await prisma.category.delete({
      where: { id: Number(id) },
    });

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Failed to delete category" });
  }
};
