import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
// Create City
export const createCity = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name)
      return res.status(400).json({ success: false, message: "City name required" });

    const city = await prisma.city.create({
      data: { name }
    });

    res.status(201).json({ success: true, data: city });
  } catch (error) {
    console.error("Create City Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get All Cities
export const getCities = async (req, res) => {
  try {
    const cities = await prisma.city.findMany({
      orderBy: { name: "asc" }
    });

    res.json({ success: true, data: cities });
  } catch (error) {
    console.error("Get Cities Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get Single City
export const getCityById = async (req, res) => {
  try {
    const { id } = req.params;

    const city = await prisma.city.findUnique({
      where: { id: Number(id) }
    });

    if (!city)
      return res.status(404).json({ success: false, message: "City not found" });

    res.json({ success: true, data: city });
  } catch (error) {
    console.error("Get City Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update City
export const updateCity = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const updated = await prisma.city.update({
      where: { id: Number(id) },
      data: { name }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update City Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete City
export const deleteCity = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.city.delete({
      where: { id: Number(id) }
    });

    res.json({ success: true, message: "City deleted successfully" });
  } catch (error) {
    console.error("Delete City Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
