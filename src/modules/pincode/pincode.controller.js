import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// CREATE PINCODE
export const createPincode = async (req, res) => {
  try {
    const { pincode, city, state, area } = req.body;

    if (!pincode) {
      return res.status(400).json({ error: "Pincode is required" });
    }

    const exists = await prisma.pincode.findUnique({
      where: { pincode },
    });

    if (exists) {
      return res.status(409).json({ error: "Pincode already exists" });
    }

    const newPincode = await prisma.pincode.create({
      data: { pincode, city, state, area },
    });

    res.status(201).json({ success: true, data: newPincode });
  } catch (error) {
    console.error("Create Pincode Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// GET ALL PINCODES
export const getPincodes = async (req, res) => {
  try {
    const pincodes = await prisma.pincode.findMany({
      orderBy: { id: "desc" },
    });

    res.json({ success: true, data: pincodes });
  } catch (error) {
    console.error("Get Pincodes Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// GET ONE PINCODE BY ID
export const getPincodeById = async (req, res) => {
  try {
    const { id } = req.params;

    const pincode = await prisma.pincode.findUnique({
      where: { id: Number(id) },
    });

    if (!pincode) {
      return res.status(404).json({ error: "Pincode not found" });
    }

    res.json({ success: true, data: pincode });
  } catch (error) {
    console.error("Get Pincode Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// SEARCH PINCODE OR AREA
export const searchPincodes = async (req, res) => {
  try {
    const { query } = req.params;

    const list = await prisma.pincode.findMany({
      where: {
        OR: [
          { pincode: { contains: query } },
          { city: { contains: query, mode: "insensitive" } },
          { area: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { pincode: "asc" },
    });

    res.json({ success: true, data: list });
  } catch (error) {
    console.error("Search Pincodes Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// UPDATE PINCODE
export const updatePincode = async (req, res) => {
  try {
    const { id } = req.params;
    const { pincode, city, state, area } = req.body;

    const exists = await prisma.pincode.findUnique({
      where: { id: Number(id) },
    });

    if (!exists) {
      return res.status(404).json({ error: "Pincode not found" });
    }

    const updated = await prisma.pincode.update({
      where: { id: Number(id) },
      data: { pincode, city, state, area },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update Pincode Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// DELETE PINCODE
export const deletePincode = async (req, res) => {
  try {
    const { id } = req.params;

    const exists = await prisma.pincode.findUnique({
      where: { id: Number(id) },
    });

    if (!exists) {
      return res.status(404).json({ error: "Pincode not found" });
    }

    await prisma.pincode.delete({
      where: { id: Number(id) },
    });

    res.json({ success: true, message: "Pincode deleted successfully" });
  } catch (error) {
    console.error("Delete Pincode Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
