import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

// Helper: calculate offer price
const calculateOfferPrice = (actual, discount, offerPrice) => {
  if (offerPrice) return parseFloat(offerPrice);
  if (discount && discount > 0) return actual - (actual * discount) / 100;
  return actual;
};



export const addTest = async (req, res) => {
  try {
    const {
      name,
      actualPrice,
      offerPrice,
      discount,
      cityWisePrice,
      gender,
      description,
      contains,
      numberOfTests,
      preparations,
      sampleRequired,
      testType,
      categoryId,
      subCategoryId,
      reportWithin,
      reportUnit,
      showIn,
      title,
      subtitle
    } = req.body;

    // Upload image (optional)
    let imgUrl = null;
    if (req.file) {
      imgUrl = await uploadToS3(req.file, "tests");
    }

    // Parse numeric values
    const actual = parseFloat(actualPrice);
    const finalDiscount = discount ? parseFloat(discount) : 0;
    const finalOfferPrice = calculateOfferPrice(actual, finalDiscount, offerPrice);

    // Parse cityWisePrice
    let parsedCityWisePrice = null;
    if (cityWisePrice) {
      parsedCityWisePrice = typeof cityWisePrice === "string"
        ? JSON.parse(cityWisePrice)
        : cityWisePrice;
    }

    // Validate category
    const category = await prisma.category.findUnique({
      where: { id: Number(categoryId) },
    });
    if (!category) {
      return res.status(400).json({ error: "Invalid categoryId" });
    }

    // Validate subcategory
    let subCategory = null;
    if (subCategoryId) {
      subCategory = await prisma.subCategory.findUnique({
        where: { id: Number(subCategoryId) },
      });
      if (!subCategory) {
        return res.status(400).json({ error: "Invalid subCategoryId" });
      }
    }

    // Create Test
    const test = await prisma.test.create({
      data: {
        name,
        actualPrice: actual,
        offerPrice: finalOfferPrice,
        discount: finalDiscount,
        cityWisePrice: parsedCityWisePrice,
        gender,
        imgUrl,
        description,
        contains,
        numberOfTests: numberOfTests ? Number(numberOfTests) : null,
        preparations,
        sampleRequired,
        testType,
        categoryId: category.id,
        subCategoryId: subCategory ? subCategory.id : null,
        reportWithin: Number(reportWithin),
        reportUnit,
        showIn,
        title,
        subtitle
      },
    });

    res.status(201).json(test);
  } catch (error) {
    console.error("Error creating test:", error);
    res.status(500).json({ error: "Failed to create test" });
  }
};

export const getAllTests = async (req, res) => {
  try {
    const tests = await prisma.test.findMany({
      include: {
        category: true,
        subCategory: true,
      },
    });

    res.json(tests);
  } catch (error) {
    console.error("Error fetching tests:", error);
    res.status(500).json({ error: "Failed to fetch tests" });
  }
};

export const searchTestsGrouped = async (req, res) => {
  try {
    const { search } = req.query;

    const tests = await prisma.test.findMany({
      where: search
        ? {
            name: {
              contains: search,
              mode: "insensitive",
            },
          }
        : {},
      select: {
        id: true,
        name: true,
        actualPrice: true,
        discount: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Calculate final price
    const formattedTests = tests.map((t) => ({
      id: t.id,
      name: t.name,
      actualPrice: t.actualPrice,
      discount: t.discount,
      finalPrice: t.discount
        ? t.actualPrice - (t.actualPrice * t.discount) / 100
        : t.actualPrice,
      categoryName: t.category?.name || "Uncategorized",
    }));

    // Group by category
    const grouped = {};

    formattedTests.forEach((t) => {
      const cat = t.categoryName;

      if (!grouped[cat]) grouped[cat] = [];

      grouped[cat].push({
        id: t.id,
        name: t.name,
        actualPrice: t.actualPrice,
        discount: t.discount,
        finalPrice: t.finalPrice,
      });
    });

    return res.json(grouped);

  } catch (error) {
    console.error("Error grouping tests:", error);
    res.status(500).json({ error: "Failed to group tests" });
  }
};



export const getTestById = async (req, res) => {
  try {
    const { id } = req.params;

    const test = await prisma.test.findUnique({
      where: { id: Number(id) },
      include: { category: true, subCategory: true },
    });

    if (!test) return res.status(404).json({ error: "Test not found" });

    res.json(test);
  } catch (error) {
    console.error("Error fetching test:", error);
    res.status(500).json({ error: "Failed to fetch test" });
  }
};


export const updateTest = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      actualPrice,
      offerPrice,
      discount,
      cityWisePrice,
      gender,
      description,
      contains,
      numberOfTests,
      preparations,
      sampleRequired,
      testType,
      categoryId,
      subCategoryId,
      showIn,
      title,
      subtitle,
       passportNo,
      aadharNo,
      address,
      initial
    } = req.body;

    const existing = await prisma.test.findUnique({
      where: { id: Number(id) },
    });

    if (!existing) return res.status(404).json({ error: "Test not found" });

    let imgUrl = existing.imgUrl;

    if (req.file) {
      if (existing.imgUrl) {
        await deleteFromS3(existing.imgUrl);
      }
      imgUrl = await uploadToS3(req.file, "tests");
    }

    // Parse values
    const actual = actualPrice ? parseFloat(actualPrice) : existing.actualPrice;
    const finalDiscount = discount ? parseFloat(discount) : existing.discount;
    const finalOfferPrice = calculateOfferPrice(actual, finalDiscount, offerPrice);

    let parsedCityWisePrice = existing.cityWisePrice;
    if (cityWisePrice) {
      parsedCityWisePrice = typeof cityWisePrice === "string"
        ? JSON.parse(cityWisePrice)
        : cityWisePrice;
    }

    // Validate category
    let finalCategoryId = existing.categoryId;
    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: Number(categoryId) },
      });
      if (!category) return res.status(400).json({ error: "Invalid categoryId" });
      finalCategoryId = category.id;
    }

    // Validate subcategory
    let finalSubCategoryId = existing.subCategoryId;
    if (subCategoryId) {
      const subCategory = await prisma.subCategory.findUnique({
        where: { id: Number(subCategoryId) },
      });
      if (!subCategory) return res.status(400).json({ error: "Invalid subCategoryId" });
      finalSubCategoryId = subCategory.id;
    }

    // Update Test
    const updated = await prisma.test.update({
      where: { id: Number(id) },
      data: {
        name: name || existing.name,
        actualPrice: actual,
        offerPrice: finalOfferPrice,
        discount: finalDiscount,
        cityWisePrice: parsedCityWisePrice,
        gender: gender || existing.gender,
        imgUrl,
        description: description || existing.description,
        contains: contains || existing.contains,
        numberOfTests: numberOfTests ? Number(numberOfTests) : existing.numberOfTests,
        preparations: preparations || existing.preparations,
        sampleRequired: sampleRequired || existing.sampleRequired,
        testType: testType || existing.testType,
        showIn: showIn || existing.showIn,
        title: title || existing.title,
        subtitle: subtitle || existing.subtitle,
        categoryId: finalCategoryId,
        subCategoryId: finalSubCategoryId,
         passportNo,
      aadharNo,
      address,
      initial
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating test:", error);
    res.status(500).json({ error: "Failed to update test" });
  }
};


export const deleteTest = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.test.findUnique({
      where: { id: Number(id) },
    });

    if (!existing)
      return res.status(404).json({ error: "Test not found" });

    if (existing.imgUrl) {
      await deleteFromS3(existing.imgUrl);
    }

    await prisma.test.delete({
      where: { id: Number(id) },
    });

    res.json({ message: "Test deleted successfully" });
  } catch (error) {
    console.error("Error deleting test:", error);
    res.status(500).json({ error: "Failed to delete test" });
  }
};


export const getTestsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const tests = await prisma.test.findMany({
      where: { categoryId: Number(categoryId) },
      include: { category: true, subCategory: true },
    });

    res.json(tests);
  } catch (error) {
    console.error("Error fetching tests by category:", error);
    res.status(500).json({ error: "Failed to fetch tests by category" });
  }
};



export const getTestsBySubCategory = async (req, res) => {
  try {
    const { subCategoryId } = req.params;

    const tests = await prisma.test.findMany({
      where: { subCategoryId: Number(subCategoryId) },
      include: { category: true, subCategory: true },
    });

    res.json(tests);
  } catch (error) {
    console.error("Error fetching tests by subcategory:", error);
    res.status(500).json({ error: "Failed to fetch tests by subcategory" });
  }
};



export const getTestsByTestType = async (req, res) => {
  try {
    const { testType } = req.params;

    const tests = await prisma.test.findMany({
      where: { testType: { equals: testType, mode: "insensitive" } },
      include: { category: true, subCategory: true },
    });

    res.json(tests);
  } catch (error) {
    console.error("Error fetching tests by testType:", error);
    res.status(500).json({ error: "Failed to fetch tests by testType" });
  }
};
