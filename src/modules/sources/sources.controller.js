import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Create source
export const createSource = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name)
      return res.status(400).json({ success: false, message: "Source name is required" });

    const source = await prisma.sources.create({
      data: { name },
    });

    res.status(201).json({ success: true, data: source });
  } catch (error) {
    console.error("Error creating source:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get all sources (formerly cities)
export const getCities = async (req, res) => {
  try {
    const sources = await prisma.sources.findMany({
      orderBy: { name: "asc" },
    });

    res.json({ success: true, data: sources });
  } catch (error) {
    console.error("Error fetching sources:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get single source by ID
export const getSourceById = async (req, res) => {
  try {
    const { id } = req.params;

    const source = await prisma.sources.findUnique({
      where: { id: Number(id) },
    });

    if (!source)
      return res.status(404).json({ success: false, message: "Source not found" });

    res.json({ success: true, data: source });
  } catch (error) {
    console.error("Error fetching source:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update source
export const updateSource = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updatedSource = await prisma.sources.update({
      where: { id: Number(id) },
      data: { name },
    });

    res.json({ success: true, data: updatedSource });
  } catch (error) {
    console.error("Error updating source:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete source
export const deleteSource = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.sources.delete({
      where: { id: Number(id) },
    });

    res.json({ success: true, message: "Source deleted successfully" });
  } catch (error) {
    console.error("Error deleting source:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
