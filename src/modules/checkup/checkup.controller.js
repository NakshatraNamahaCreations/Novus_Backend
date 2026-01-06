import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

const prisma = new PrismaClient();

/* -------------------------------------------
   🔵 Helper: Parse selected tests safely
-------------------------------------------- */
function parseTestIds(value) {
  if (!value) return [];

  // Case 1: Already array
  if (Array.isArray(value)) {
    return value.map((id) => Number(id));
  }

  // Case 2: String input
  if (typeof value === "string") {
    // "6,7,8"
    if (value.includes(",")) {
      return value.split(",").map((id) => Number(id.trim()));
    }

    // "[6,7,8]"
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      // "6"
      return [Number(value)];
    }
  }

  return [];
}


const calculateOfferPrice = (actual, discount, offerPrice) => {
  if (offerPrice) return parseFloat(offerPrice); // Manual overrides
  if (discount && discount > 0) return actual - (actual * discount) / 100;
  return actual;
};

const roundLabPrice = (price) => {
  const amt = parseFloat(price);
  if (isNaN(amt) || amt <= 0) return 0;
  return Math.round(amt / 50) * 50;
};

/* -------------------------------------------
   🟢 CREATE HEALTH PACKAGE
-------------------------------------------- */
export const addHealthPackage = async (req, res) => {
  try {
    const {
      name,
      description,
      actualPrice,
      discount,
      offerPrice,
      showIn,
      selectedTests,
      reportWithin,
      reportUnit,
      noOfParameter,
      categoryId,
      alsoKnowAs,
      spotlight,
      features
    } = req.body;

    if (!name || !actualPrice) {
      return res.status(400).json({ error: "Name and actualPrice are required" });
    }

    // Optional image upload
    let imgUrl = req.file ? await uploadToS3(req.file, "health-packages") : null;

    const actual = Number(actualPrice);
    const disc = discount ? Number(discount) : 0;

    // ⭐ Calculate and round final offer price
    const rawOffer = calculateOfferPrice(actual, disc, offerPrice);
    const finalOfferPrice = roundLabPrice(rawOffer);


    let finalSpotlight = false;
    if (spotlight !== undefined) {
      if (typeof spotlight === "boolean") {
        finalSpotlight = spotlight;
      } else if (typeof spotlight === "string") {
        finalSpotlight = spotlight === "true";
      }
    }
    const healthPackage = await prisma.healthPackage.create({
      data: {
        name,
            createdById: req.user.id,
        description,
        imgUrl,
        actualPrice: actual,
        offerPrice: finalOfferPrice,
        discount: disc,
        showIn,
        reportWithin: Number(reportWithin),
        reportUnit,
        noOfParameter,
        categoryId: categoryId ? Number(categoryId) : null,
        alsoKnowAs,
           spotlight: finalSpotlight,
           features
      }
    });

    // Link tests
    const testIds = parseTestIds(selectedTests);
    if (testIds.length > 0) {
      await prisma.checkupPackage.createMany({
        data: testIds.map((tid) => ({
          checkupId: healthPackage.id,
          testId: tid
        }))
      });
    }

    const result = await prisma.healthPackage.findUnique({
      where: { id: healthPackage.id },
      include: { checkupPackages: { include: { test: true } } }
    });

    res.status(201).json(result);

  } catch (error) {
    console.error("Error creating health package:", error);
    res.status(500).json({ error: "Failed to create health package" });
  }
};



/* -------------------------------------------
   🟠 UPDATE HEALTH PACKAGE (SMART VERSION)
-------------------------------------------- */
export const updateHealthPackage = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      description,
      actualPrice,
      discount,
      offerPrice,
      showIn,
      selectedTests,
      reportWithin,
      reportUnit,
      spotlight,
      categoryId,
      alsoKnowAs,
      features
    } = req.body;

    console.log("features",features)

    // Fetch existing package
    const existing = await prisma.healthPackage.findUnique({
      where: { id: Number(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: "HealthPackage not found" });
    }

    /* -------------------------------------------
       IMAGE REPLACEMENT
    -------------------------------------------- */
    let imgUrl = existing.imgUrl;

    if (req.file) {
      if (imgUrl) await deleteFromS3(imgUrl); // delete old image
      imgUrl = await uploadToS3(req.file, "health-packages");
    }

    /* -------------------------------------------
       PRICE CALCULATION
    -------------------------------------------- */
    const actual = actualPrice ? Number(actualPrice) : existing.actualPrice;
    const disc = discount ? Number(discount) : existing.discount;

    const rawOffer = calculateOfferPrice(actual, disc, offerPrice);
    const finalOfferPrice = roundLabPrice(rawOffer);

    /* -------------------------------------------
       UPDATE PACKAGE DATA
    -------------------------------------------- */
// --- SPOTLIGHT NORMALIZATION ---
let finalSpotlight = existing.spotlight;

if (spotlight !== undefined) {
  if (typeof spotlight === "boolean") {
    finalSpotlight = spotlight;
  } else if (typeof spotlight === "string") {
    finalSpotlight = spotlight === "true";
  }
}


    const updated = await prisma.healthPackage.update({
      where: { id: Number(id) },
      data: {
        name: name ?? existing.name,
        description: description ?? existing.description,
        imgUrl,
        actualPrice: actual,
        discount: disc,
        offerPrice: finalOfferPrice,
        showIn: showIn ?? existing.showIn,
        reportWithin: reportWithin
          ? Number(reportWithin)
          : existing.reportWithin,
        reportUnit: reportUnit ?? existing.reportUnit,
        
        categoryId: categoryId ? Number(categoryId) : existing.categoryId,
        alsoKnowAs:alsoKnowAs ?? existing.alsoKnowAs,
        spotlight: finalSpotlight,
        features:features

      }
    });

    /* -------------------------------------------
       ⭐ SMART SYNC TEST RELATIONS
    -------------------------------------------- */
    if (selectedTests !== undefined) {
      const newTestIds = parseTestIds(selectedTests);

      // Get old test relations
      const existingTests = await prisma.checkupPackage.findMany({
        where: { checkupId: Number(id) },
        select: { testId: true }
      });

      const oldTestIds = existingTests.map(t => t.testId);

      // To delete: in old, not in new
      const testsToDelete = oldTestIds.filter(id => !newTestIds.includes(id));

      // To add: in new, not in old
      const testsToAdd = newTestIds.filter(id => !oldTestIds.includes(id));

      // Remove unwanted tests
      if (testsToDelete.length > 0) {
        await prisma.checkupPackage.deleteMany({
          where: {
            checkupId: Number(id),
            testId: { in: testsToDelete }
          }
        });
      }

      // Add new tests
      if (testsToAdd.length > 0) {
        await prisma.checkupPackage.createMany({
          data: testsToAdd.map(tid => ({
            checkupId: Number(id),
            testId: tid
          }))
        });
      }
    }

    /* -------------------------------------------
       FETCH FULL UPDATED PACKAGE
    -------------------------------------------- */
    const fullData = await prisma.healthPackage.findUnique({
      where: { id: updated.id },
      include: { checkupPackages: { include: { test: true } } }
    });

    return res.json(fullData);

  } catch (error) {
    console.error("Error updating health package:", error);
    return res.status(500).json({ error: "Failed to update health package" });
  }
};


/* -------------------------------------------
   🟡 GET ALL PACKAGES (SEARCH + PAGINATION)
-------------------------------------------- */
export const getAllHealthPackages = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;

    const currentPage = Number(page) || 1;
    const pageSize = Number(limit) || 10;

   const searchText = String(search || "").trim();

const whereCondition = searchText
  ? {
      OR: [
        { name: { contains: searchText, mode: "insensitive" } },
        { alsoKnowAs: { contains: searchText, mode: "insensitive" } },
        {
          category: {
            is: {
              name: { contains: searchText, mode: "insensitive" },
            },
          },
        },
      ],
    }
  : {};
    /* -------------------------------------------
       1️⃣ COUNT TOTAL RESULTS
    -------------------------------------------- */
    const totalCount = await prisma.healthPackage.count({
      where: whereCondition,
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    /* -------------------------------------------
       2️⃣ FETCH PAGINATED DATA
    -------------------------------------------- */
    const rawData = await prisma.healthPackage.findMany({
      where: whereCondition,
      skip: (currentPage - 1) * pageSize,
      take: pageSize,

      include: {
        category: { select: { id: true, name: true } },

        checkupPackages: {
          include: {
            test: {
              include: {
                _count: { select: { parameters: true } },
              },
            },
          },
        },
      },

      orderBy: { id: "desc" }, // Latest first
    });

    /* -------------------------------------------
       3️⃣ FORMAT RESPONSE DATA
    -------------------------------------------- */
    const data = rawData.map((pkg) => {
      const tests = pkg.checkupPackages.map((cp) => ({
        id: cp.test.id,
        name: cp.test.name,
        parametersCount: cp.test._count.parameters,
      }));

      const totalParameters = tests.reduce(
        (sum, t) => sum + t.parametersCount,
        0
      );

      return {
        id: pkg.id,
        name: pkg.name,
        imgUrl: pkg.imgUrl,
        description: pkg.description,
        actualPrice: pkg.actualPrice,
        offerPrice: pkg.offerPrice,
        reportWithin: pkg.reportWithin,
        reportUnit: pkg.reportUnit,
        discount: pkg.discount,
        categoryId:pkg.categoryId,
        category: pkg.category,
        alsoKnowAs:pkg.alsoKnowAs,
        testType:"PATHOLOGY",
        tests,
        testCount: tests.length,
        parameterCount: totalParameters,
        features:pkg.features
      };
    });

    /* -------------------------------------------
       4️⃣ SEND PAGINATED RESPONSE
    -------------------------------------------- */
    return res.json({
      success: true,
      pagination: {
        total: totalCount,
        page: currentPage,
        limit: pageSize,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
      data,
    });

  } catch (error) {
    console.error("Error fetching packages:", error);
    return res.status(500).json({ error: "Failed to fetch health packages" });
  }
};

export const getSpotlightHealthPackages = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;

    const currentPage = Number(page) || 1;
    const pageSize = Number(limit) || 10;

    /* -------------------------------------------
       WHERE CONDITION (SPOTLIGHT + SEARCH)
    -------------------------------------------- */
    const whereCondition = {
      spotlight: true, // ⭐ ONLY SPOTLIGHT PACKAGES
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { category: { name: { contains: search, mode: "insensitive" } } }
        ]
      })
    };

    /* -------------------------------------------
       1️⃣ COUNT TOTAL RESULTS
    -------------------------------------------- */
    const totalCount = await prisma.healthPackage.count({
      where: whereCondition
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    /* -------------------------------------------
       2️⃣ FETCH DATA
    -------------------------------------------- */
    const rawData = await prisma.healthPackage.findMany({
      where: whereCondition,
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      orderBy: { id: "desc" },

      include: {
        category: { select: { id: true, name: true } },
        checkupPackages: {
          include: {
            test: {
              include: {
                _count: { select: { parameters: true } }
              }
            }
          }
        }
      }
    });

    /* -------------------------------------------
       3️⃣ FORMAT RESPONSE
    -------------------------------------------- */
    const data = rawData.map((pkg) => {
      const tests = pkg.checkupPackages.map((cp) => ({
        id: cp.test.id,
        name: cp.test.name,
        parametersCount: cp.test._count.parameters
      }));

      const totalParameters = tests.reduce(
        (sum, t) => sum + t.parametersCount,
        0
      );

      return {
        id: pkg.id,
        name: pkg.name,
        imgUrl: pkg.imgUrl,
        description: pkg.description,
        actualPrice: pkg.actualPrice,
        offerPrice: pkg.offerPrice,
        discount: pkg.discount,
        reportWithin: pkg.reportWithin,
        reportUnit: pkg.reportUnit,
        categoryId: pkg.categoryId,
        category: pkg.category,
        alsoKnowAs: pkg.alsoKnowAs,
        spotlight: true,
        testType: "PATHOLOGY",
        tests,
        testCount: tests.length,
        parameterCount: totalParameters
      };
    });

    /* -------------------------------------------
       4️⃣ RESPONSE
    -------------------------------------------- */
    return res.json({
      success: true,
      pagination: {
        total: totalCount,
        page: currentPage,
        limit: pageSize,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1
      },
      data
    });

  } catch (error) {
    console.error("Error fetching spotlight packages:", error);
    return res.status(500).json({ error: "Failed to fetch spotlight packages" });
  }
};


/* --------------------------------------------
   GET HEALTH PACKAGES BY CATEGORY
--------------------------------------------- */
export const getHealthPackagesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { search = "", page = 1, limit = 100 } = req.query;

    const currentPage = Number(page) || 1;
    const pageSize = Number(limit) || 10;

    if (!categoryId) {
      return res.status(400).json({ error: "Category ID is required" });
    }

    /* -------------------------------------------
       1️⃣ WHERE CONDITION (category + search)
    -------------------------------------------- */
    const whereCondition = {
      categoryId: Number(categoryId),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { category: { name: { contains: search, mode: "insensitive" } } }
            ],
          }
        : {}),
    };

    /* -------------------------------------------
       2️⃣ COUNT TOTAL PACKAGES
    -------------------------------------------- */
    const totalCount = await prisma.healthPackage.count({
      where: whereCondition,
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    /* -------------------------------------------
       3️⃣ FETCH DATA
    -------------------------------------------- */
    const rawData = await prisma.healthPackage.findMany({
      where: whereCondition,
      skip: (currentPage - 1) * pageSize,
      take: pageSize,

      include: {
        category: { select: { id: true, name: true } },
        checkupPackages: {
          include: {
            test: {
              include: {
                _count: { select: { parameters: true } },
              },
            },
          },
        },
      },

      orderBy: { id: "desc" },
    });

    /* -------------------------------------------
       4️⃣ FORMAT RESPONSE
    -------------------------------------------- */
    const data = rawData.map((pkg) => {
      const tests = pkg.checkupPackages.map((cp) => ({
        id: cp.test.id,
        name: cp.test.name,
        parametersCount: cp.test._count.parameters,
      }));

      const totalParameters = tests.reduce(
        (sum, t) => sum + t.parametersCount,
        0
      );

      return {
        id: pkg.id,
        name: pkg.name,
        imgUrl: pkg.imgUrl,
        description: pkg.description,
        actualPrice: pkg.actualPrice,
        offerPrice: pkg.offerPrice,
        reportWithin: pkg.reportWithin,
        reportUnit: pkg.reportUnit,
        discount: pkg.discount,
        category: pkg.category,
        testType: "PATHOLOGY",
        tests,
        testCount: tests.length,
        parameterCount: totalParameters,
      };
    });

    /* -------------------------------------------
       5️⃣ SEND RESPONSE
    -------------------------------------------- */
    return res.json({
      success: true,
      pagination: {
        total: totalCount,
        page: currentPage,
        limit: pageSize,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
      data,
    });

  } catch (error) {
    console.error("Error fetching category packages:", error);
    return res.status(500).json({ error: "Failed to fetch category packages" });
  }
};



export const getHealthPackageById = async (req, res) => {
  try {
    const { id } = req.params;

    const rawData = await prisma.healthPackage.findUnique({
      where: { id: Number(id) },
      include: {
        category: { select: { id: true, name: true } },
        checkupPackages: {
          include: {
            test: {
              include: {
                parameters: {
                  select: {
                    id: true,
                    name: true,
                    unit: true,
                    notes: true,
                    type: true,
                    order: true
                  }
                },
                _count: {
                  select: { parameters: true }
                }
              }
            }
          }
        }
      }
    });

    if (!rawData) {
      return res.status(404).json({ error: "HealthPackage not found" });
    }

    const tests = rawData.checkupPackages.map((cp) => ({
      id: cp.test.id,
      name: cp.test.name,
      parametersCount: cp.test._count.parameters,
      parameters: cp.test.parameters || []
    }));

    const totalParameters = tests.reduce(
      (sum, t) => sum + t.parametersCount,
      0
    );

    const finalData = {
      id: rawData.id,
      name: rawData.name,
      description: rawData.description,
      actualPrice: rawData.actualPrice,
      imgUrl: rawData.imgUrl,
      discount: rawData.discount,
      offerPrice: rawData.offerPrice,
      testType: "PATHOLOGY",
      category: rawData.category,
      tests,
      testCount: tests.length,
      parameterCount: totalParameters
    };

    return res.json({
      success: true,
      data: finalData
    });

  } catch (error) {
    console.error("Error fetching health package:", error);
    return res.status(500).json({ error: "Failed to fetch health package" });
  }
};



/* -------------------------------------------
   🔴 DELETE PACKAGE
-------------------------------------------- */
export const deleteHealthPackage = async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await prisma.healthPackage.findUnique({
      where: { id: Number(id) }
    });

    if (!pkg) {
      return res.status(404).json({ error: "HealthPackage not found" });
    }

    if (pkg.imgUrl) await deleteFromS3(pkg.imgUrl);

    await prisma.checkupPackage.deleteMany({
      where: { checkupId: Number(id) }
    });

    await prisma.healthPackage.delete({
      where: { id: Number(id) }
    });

    res.json({ message: "HealthPackage deleted successfully" });

  } catch (error) {
    console.error("Error deleting health package:", error);
    res.status(500).json({ error: "Failed to delete health package" });
  }
};
