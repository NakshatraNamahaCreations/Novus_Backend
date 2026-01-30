import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";
import csv from "csv-parser";
import { Readable } from "stream";

const prisma = new PrismaClient();

const parseIdsArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((x) => Number(x)).filter(Boolean);

  if (typeof value === "string") {
    // "1,2,3"
    if (value.includes(",")) {
      return value
        .split(",")
        .map((x) => Number(x.trim()))
        .filter(Boolean);
    }

    // "[1,2,3]"
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(Number).filter(Boolean);
    } catch {}

    // "1"
    const n = Number(value);
    return Number.isFinite(n) ? [n] : [];
  }

  return [];
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

      preparations,
      sampleRequired,
      testType,
      categoryId,
      subCategoryId,
      reportWithin,
      reportUnit,
      showIn,
      alsoKnowAs,
      spotlight,
      features,
      sortOrder,
            // ✅ NEW (multi-category)
      otherCategoryIds, 
    } = req.body;

    // Upload image (optional)
    let imgUrl = null;
    if (req.file) {
      imgUrl = await uploadToS3(req.file, "tests");
    }

    // Parse numeric values
    const actual = parseFloat(actualPrice);
    const finalDiscount = discount ? parseFloat(discount) : 0;



    // Parse cityWisePrice (optional)
    let parsedCityWisePrice = null;
    if (cityWisePrice) {
      parsedCityWisePrice =
        typeof cityWisePrice === "string"
          ? JSON.parse(cityWisePrice)
          : cityWisePrice;
    }

    // Validate category
    const category = await prisma.category.findUnique({
      where: { id: Number(categoryId) },
    });
    if (!category) return res.status(400).json({ error: "Invalid categoryId" });

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

    // --- SPOTLIGHT NORMALIZATION ---
    let finalSpotlight = false; // default

    if (spotlight !== undefined) {
      if (typeof spotlight === "boolean") {
        finalSpotlight = spotlight;
      } else if (typeof spotlight === "string") {
        finalSpotlight = spotlight === "true";
      }
    }
      // ✅ Parse otherCategoryIds
    const otherIds = parseIdsArray(otherCategoryIds)
      .filter((id) => id !== Number(categoryId)); // avoid duplicate with primary

    // Create Test
    const test = await prisma.test.create({
      data: {
        name,
        createdById: req.user.id,
        actualPrice: actual,
        offerPrice: Number(offerPrice), // 👈 FINAL PRICE AFTER ROUNDING
        discount: finalDiscount,
        cityWisePrice: parsedCityWisePrice,
        gender,
        imgUrl,
        description,
        contains,

        preparations,
        sampleRequired,
        testType,
        categoryId: category.id,
        subCategoryId: subCategory ? subCategory.id : null,
        reportWithin: Number(reportWithin),
        reportUnit,
        showIn,
        alsoKnowAs,
        spotlight: finalSpotlight,
        features,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0, 
         // ✅ connect other categories
        otherCategories: otherIds.length
          ? {
              create: otherIds.map((cid) => ({
                categoryId: Number(cid),
              })),
            }
          : undefined,
      },
      include: {
        otherCategories: { select: { categoryId: true } },
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
    let {
      page = 1,
      limit = 10,
      search = "",
      categoryId,
      subCategoryId,
      testType,
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    const where = {};

    if (search.trim() !== "") {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { alsoKnowAs: { contains: search, mode: "insensitive" } },
      ];
    }

    if (categoryId) where.categoryId = Number(categoryId);
    if (subCategoryId) where.subCategoryId = Number(subCategoryId);
    if (testType) where.testType = testType;

    const total = await prisma.test.count({ where });

    const tests = await prisma.test.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, type: true } },
        subCategory: true,
        otherCategories:true,
        parameters: {
          select: { id: true, name: true },
        
        },
        _count: { select: { parameters: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [
        { createdAt: "desc" }, 
      ],
    });

 
    const data = tests.map((t) => ({
      ...t,
      parameterCount: t._count?.parameters ?? 0,
      parameterNames: (t.parameters || []).map((p) => p.name),
    }));

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data,
    });
  } catch (error) {
    console.error("Error fetching tests:", error);
    return res.status(500).json({ error: "Failed to fetch tests" });
  }
};

export const getAllTestsnames = async (req, res) => {
  try {
    const tests = await prisma.test.findMany({
      select: {
        id: true,
        name: true,
        offerPrice: true,
        actualPrice: true,
      },
      orderBy: [
        { sortOrder: "asc" }, // ✅ MAIN
        { createdAt: "desc" }, // ✅ tie-breaker
      ],
    });

    return res.json({
      data: tests,
    });
  } catch (error) {
    console.error("Error fetching tests:", error);
    return res.status(500).json({ error: "Failed to fetch tests" });
  }
};

export const getSpotlightTests = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      categoryId,
      subCategoryId,
      testType,
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    /* -------------------------------------------
       BUILD FILTER (SPOTLIGHT ONLY)
    -------------------------------------------- */
    const filter = {
      spotlight: true, // ⭐ IMPORTANT
    };

    if (search.trim() !== "") {
      filter.name = {
        contains: search,
        mode: "insensitive",
      };
    }

    if (categoryId) filter.categoryId = Number(categoryId);
    if (subCategoryId) filter.subCategoryId = Number(subCategoryId);
    if (testType) filter.testType = testType;

    /* -------------------------------------------
       TOTAL COUNT
    -------------------------------------------- */
    const total = await prisma.test.count({
      where: filter,
    });

    /* -------------------------------------------
       FETCH DATA
    -------------------------------------------- */
    const tests = await prisma.test.findMany({
      where: filter,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        subCategory: true,
        _count: {
          select: {
            parameters: true,
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
    });

    /* -------------------------------------------
       RESPONSE
    -------------------------------------------- */
    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: tests,
    });
  } catch (error) {
    console.error("Error fetching spotlight tests:", error);
    return res.status(500).json({ error: "Failed to fetch spotlight tests" });
  }
};

export const searchTestsGrouped = async (req, res) => {
  try {
    const { search } = req.query;

    // Fetch tests (filtered if search provided)
    const tests = await prisma.test.findMany({
      where: search
        ? {
            name: {
              contains: search.trim(),
              mode: "insensitive",
            },
          }
        : {},
      select: {
        id: true,
        name: true,
        actualPrice: true,
        discount: true,
        offerPrice: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Format tests
    const formattedTests = tests.map((t) => ({
      id: t.id,
      name: t.name,
      actualPrice: t.actualPrice,
      discount: t.discount,
      finalPrice: t.offerPrice,
      categoryName: t.category?.name || "Uncategorized",
    }));

    // Group by category using reduce()
    const grouped = formattedTests.reduce((acc, test) => {
      if (!acc[test.categoryName]) {
        acc[test.categoryName] = [];
      }
      acc[test.categoryName].push({
        id: test.id,
        name: test.name,
        actualPrice: test.actualPrice,
        discount: test.discount,
        finalPrice: test.finalPrice,
      });
      return acc;
    }, {});

    return res.json({
      success: true,
      data: grouped,
    });
  } catch (error) {
    console.error("Error grouping tests:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to group tests",
    });
  }
};

export const getTestById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Test ID is required" });
    }

    const test = await prisma.test.findUnique({
      where: { id: Number(id) },

      include: {
        category: {
          select: {
            name: true,
          },
        },
        subCategory: true,

        // ⭐ INCLUDE PARAMETERS
        parameters: {
          orderBy: { order: "asc" },
          include: {
            ranges: {
              select: {
                id: true,
                lowerLimit: true,
                upperLimit: true,
                criticalLow: true,
                criticalHigh: true,

                referenceRange: true,
                gender: true,
                normalValueHtml: true,
                specialConditionHtml: true,
              },
            },
          },
        },
        _count: {
          select: {
            parameters: true, // returns how many parameters the test has
          },
        },
      },
    });

    if (!test) {
      return res.status(404).json({ error: "Test not found" });
    }

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
      spotlight,
      preparations,
      sampleRequired,
      testType,
      categoryId,
      subCategoryId,
      showIn,
      alsoKnowAs,
      features,
      sortOrder,
        // ✅ NEW
      otherCategoryIds,
    } = req.body;

    const existing = await prisma.test.findUnique({
      where: { id: Number(id) },
    });

    if (!existing) return res.status(404).json({ error: "Test not found" });

    // --- IMAGE HANDLING ---
    let imgUrl = existing.imgUrl;

    if (req.file) {
      if (existing.imgUrl) {
        await deleteFromS3(existing.imgUrl);
      }
      imgUrl = await uploadToS3(req.file, "tests");
    }

    // --- PRICE CALCULATIONS ---
    const actual = actualPrice ? parseFloat(actualPrice) : existing.actualPrice;
    const finalDiscount = discount ? parseFloat(discount) : existing.discount;



    // --- CITY WISE PRICE ---
    let parsedCityWisePrice = existing.cityWisePrice;
    if (cityWisePrice) {
      parsedCityWisePrice =
        typeof cityWisePrice === "string"
          ? JSON.parse(cityWisePrice)
          : cityWisePrice;
    }

    // --- CATEGORY VALIDATION ---
    let finalCategoryId = existing.categoryId;
    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: Number(categoryId) },
      });
      if (!category)
        return res.status(400).json({ error: "Invalid categoryId" });
      finalCategoryId = category.id;
    }

    // --- SUBCATEGORY VALIDATION ---
    let finalSubCategoryId = existing.subCategoryId;
    if (subCategoryId) {
      const subCategory = await prisma.subCategory.findUnique({
        where: { id: Number(subCategoryId) },
      });
      if (!subCategory)
        return res.status(400).json({ error: "Invalid subCategoryId" });
      finalSubCategoryId = subCategory.id;
    }

    // --- SPOTLIGHT NORMALIZATION ---
    let finalSpotlight = existing.spotlight;

    if (spotlight !== undefined) {
      if (typeof spotlight === "boolean") {
        finalSpotlight = spotlight;
      } else if (typeof spotlight === "string") {
        finalSpotlight = spotlight === "true";
      }
    }

    // ✅ Parse otherCategoryIds (replace all)
    const otherIds = parseIdsArray(otherCategoryIds)
      .filter((cid) => cid !== Number(finalCategoryId));

    // --- UPDATE TEST ---
    const updated = await prisma.test.update({
      where: { id: Number(id) },
      data: {
        name: name || existing.name,
        actualPrice: actual,
        offerPrice: Number(offerPrice), // ← final rounded price
        discount: finalDiscount,
        cityWisePrice: parsedCityWisePrice,
        gender: gender || existing.gender,
        imgUrl,
        description: description || existing.description,
        contains: contains || existing.contains,

        preparations: preparations || existing.preparations,
        sampleRequired: sampleRequired || existing.sampleRequired,
        testType: testType || existing.testType,
        showIn: showIn || existing.showIn,
        alsoKnowAs: alsoKnowAs || existing.alsoKnowAs,
        spotlight: finalSpotlight,
        features: features,

        categoryId: finalCategoryId,
        subCategoryId: finalSubCategoryId,
        sortOrder:
          sortOrder !== undefined
            ? Number(sortOrder)
            : (existing.sortOrder ?? 0), // ✅ NEW

             // ✅ Replace other categories
        otherCategories: {
          deleteMany: {}, // remove old
          create: otherIds.map((cid) => ({ categoryId: Number(cid) })),
        },
      },
      include: {
        otherCategories: { select: { categoryId: true } },
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

    if (!existing) return res.status(404).json({ error: "Test not found" });

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
    const catId = Number(categoryId);

    if (!catId) return res.status(400).json({ error: "Valid Category ID is required" });

    const category = await prisma.category.findUnique({
      where: { id: catId },
      select: { id: true, name: true, type: true, bannerUrl: true },
    });
    if (!category) return res.status(404).json({ error: "Category not found" });

    const rawTests = await prisma.test.findMany({
      where: {
        OR: [{ categoryId: catId }, { otherCategories: { some: { categoryId: catId } } }],
      },
      include: {
        subCategory: true,
        otherCategories: {
          select: { categoryId: true, category: { select: { id: true, name: true } } },
        },
        _count: { select: { parameters: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return res.json({
      success: true,
      category,
      tests: rawTests,
      total: rawTests.length,
    });
  } catch (error) {
    console.error("Error fetching tests by category:", error);
    return res.status(500).json({ error: "Failed to fetch tests by category" });
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

// Download template
export const downloadTemplate = async (req, res) => {
  try {
    // Create CSV template content
    const templateData = `name,description,actualPrice,offerPrice,discount,reportWithin,reportUnit,testType,categoryId,subCategoryId,gender,sampleRequired,preparations,contains,title,subtitle,status,imgUrl
Thyroid Function Test,Complete thyroid panel test,1200,1000,17,24,hours,Pathology,16,,both,Blood sample,Fasting not required,TSH, T3, T4,Thyroid Profile,Essential thyroid screening,active,
Complete Blood Count,Complete blood count test,800,600,25,6,hours,Pathology,15,,both,Blood sample,No fasting required,25 parameters,CBC Test,Blood analysis,active,
Liver Function Test,Liver function test panel,1500,1200,20,24,hours,Pathology,17,,both,Blood sample,Fasting required,10 parameters,Liver Profile,Liver health check,active,
Kidney Function Test,Kidney function tests,1000,800,20,24,hours,Pathology,18,,both,Blood sample,Fasting required,8 parameters,Kidney Profile,Kidney health check,active,`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=test_bulk_upload_template.csv",
    );
    res.send(templateData);
  } catch (error) {
    console.error("Error generating template:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate template",
      message: error.message,
    });
  }
};

// Bulk upload tests
export const bulkUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    const results = [];
    const errors = [];
    let successCount = 0;
    let failedCount = 0;

    // Create readable stream from file buffer
    const stream = Readable.from(req.file.buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on("data", async (row) => {
          try {
            // Validate required fields
            if (
              !row.name ||
              !row.actualPrice ||
              !row.testType ||
              !row.categoryId
            ) {
              errors.push({
                row,
                error:
                  "Missing required fields: name, actualPrice, testType, or categoryId",
              });
              failedCount++;
              return;
            }

            // Parse and validate data
            const actualPrice = parseFloat(row.actualPrice);
            if (isNaN(actualPrice) || actualPrice <= 0) {
              errors.push({
                row,
                error: "Invalid actualPrice",
              });
              failedCount++;
              return;
            }

            const categoryId = parseInt(row.categoryId);
            if (isNaN(categoryId) || categoryId <= 0) {
              errors.push({
                row,
                error: "Invalid categoryId",
              });
              failedCount++;
              return;
            }

            // Check if category exists
            const categoryExists = await prisma.category.findUnique({
              where: { id: categoryId },
            });

            if (!categoryExists) {
              errors.push({
                row,
                error: `Category with ID ${categoryId} does not exist`,
              });
              failedCount++;
              return;
            }

            // Prepare test data
            const testData = {
              name: row.name.trim(),
              description: row.description?.trim() || null,
              actualPrice: actualPrice,
              offerPrice: row.offerPrice ? parseFloat(row.offerPrice) : null,
              discount: row.discount ? parseFloat(row.discount) : null,
              reportWithin: parseInt(row.reportWithin) || 24,
              reportUnit: row.reportUnit || "hours",
              testType: row.testType,
              categoryId: categoryId,
              subCategoryId: row.subCategoryId
                ? parseInt(row.subCategoryId)
                : null,
              gender: row.gender || "both",
              sampleRequired: row.sampleRequired || null,
              preparations: row.preparations || null,
              contains: row.contains || null,
              title: row.title || null,
              subtitle: row.subtitle || null,
              status: row.status || "active",
              imgUrl: row.imgUrl || null,
            };

            // Check if test already exists by name and category
            const existingTest = await prisma.test.findFirst({
              where: {
                name: testData.name,
                categoryId: testData.categoryId,
              },
            });

            let savedTest;
            if (existingTest) {
              // Update existing test
              savedTest = await prisma.test.update({
                where: { id: existingTest.id },
                data: testData,
              });
              results.push({
                id: savedTest.id,
                name: savedTest.name,
                action: "updated",
                status: "success",
              });
            } else {
              // Create new test
              savedTest = await prisma.test.create({
                data: testData,
              });
              results.push({
                id: savedTest.id,
                name: savedTest.name,
                action: "created",
                status: "success",
              });
            }
            successCount++;
          } catch (error) {
            console.error("Error processing row:", error);
            errors.push({
              row,
              error: error.message,
            });
            failedCount++;
          }
        })
        .on("end", () => {
          resolve();
        })
        .on("error", (error) => {
          reject(error);
        });
    });

    res.json({
      success: true,
      message: `Bulk upload completed. Success: ${successCount}, Failed: ${failedCount}`,
      successCount,
      failedCount,
      total: successCount + failedCount,
      results: results.slice(0, 50), // Limit results to 50
      errors: errors.slice(0, 50), // Limit errors to 50
    });
  } catch (error) {
    console.error("Bulk upload error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process bulk upload",
      message: error.message,
    });
  }
};

// Alternative: Simple bulk upload for quick implementation
export const simpleBulkUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    const fileContent = req.file.buffer.toString();
    const lines = fileContent.split("\n").filter((line) => line.trim() !== "");

    // Skip header row
    const dataRows = lines.slice(1);

    const results = [];
    const errors = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < dataRows.length; i++) {
      try {
        const row = dataRows[i];
        const columns = row.split(",").map((col) => col.trim());

        // Skip empty rows
        if (columns.length < 3 || !columns[0]) continue;

        // Extract data (adjust indices based on your CSV format)
        const testData = {
          name: columns[0] || "Unnamed Test",
          description: columns[1] || null,
          actualPrice: parseFloat(columns[2]) || 0,
          offerPrice: columns[3] ? parseFloat(columns[3]) : null,
          discount: columns[4] ? parseFloat(columns[4]) : null,
          reportWithin: parseInt(columns[5]) || 24,
          reportUnit: columns[6] || "hours",
          testType: columns[7] || "Pathology",
          categoryId: columns[8] ? parseInt(columns[8]) : null,
          subCategoryId: columns[9] ? parseInt(columns[9]) : null,
          gender: columns[10] || "both",
          sampleRequired: columns[11] || null,
          preparations: columns[12] || null,
          contains: columns[13] || null,
          title: columns[14] || null,
          subtitle: columns[15] || null,
          status: columns[16] || "active",
          imgUrl: columns[17] || null,
        };

        // Validate required fields
        if (
          !testData.name ||
          !testData.actualPrice ||
          !testData.testType ||
          !testData.categoryId
        ) {
          errors.push({
            row: i + 2,
            error: "Missing required fields",
            data: testData,
          });
          failedCount++;
          continue;
        }

        // Check if category exists
        if (testData.categoryId) {
          const categoryExists = await prisma.category.findUnique({
            where: { id: testData.categoryId },
          });

          if (!categoryExists) {
            errors.push({
              row: i + 2,
              error: `Category ID ${testData.categoryId} not found`,
              data: testData,
            });
            failedCount++;
            continue;
          }
        }

        // Check if test exists
        const existingTest = await prisma.test.findFirst({
          where: {
            name: testData.name,
            categoryId: testData.categoryId,
          },
        });

        let savedTest;
        if (existingTest) {
          // Update existing
          savedTest = await prisma.test.update({
            where: { id: existingTest.id },
            data: testData,
          });
        } else {
          // Create new
          savedTest = await prisma.test.create({
            data: testData,
          });
        }

        results.push({
          id: savedTest.id,
          name: savedTest.name,
          status: "success",
        });
        successCount++;
      } catch (error) {
        errors.push({
          row: i + 2,
          error: error.message,
          rawData: dataRows[i],
        });
        failedCount++;
      }
    }

    res.json({
      success: true,
      message: `Processed ${dataRows.length} rows. Success: ${successCount}, Failed: ${failedCount}`,
      successCount,
      failedCount,
      total: dataRows.length,
      results: results.slice(0, 20),
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error("Simple bulk upload error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process file",
      message: error.message,
    });
  }
};

// Get categories for template
export const getCategoriesForTemplate = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        type: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch categories",
    });
  }
};

// Validate CSV before upload
export const validateBulkUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    const fileContent = req.file.buffer.toString();
    const lines = fileContent.split("\n");

    const validationResults = {
      totalRows: lines.length - 1, // Exclude header
      validRows: 0,
      invalidRows: 0,
      errors: [],
      sampleData: [],
    };

    // Validate header
    const header = lines[0]?.split(",") || [];
    const requiredHeaders = ["name", "actualPrice", "testType", "categoryId"];
    const missingHeaders = requiredHeaders.filter((h) => !header.includes(h));

    if (missingHeaders.length > 0) {
      validationResults.errors.push({
        type: "header",
        message: `Missing required headers: ${missingHeaders.join(", ")}`,
      });
    }

    // Check first few rows for sample data
    for (let i = 1; i < Math.min(5, lines.length); i++) {
      if (lines[i].trim()) {
        const columns = lines[i].split(",").map((col) => col.trim());
        validationResults.sampleData.push({
          row: i + 1,
          data: columns,
        });
      }
    }

    res.json({
      success: true,
      data: validationResults,
    });
  } catch (error) {
    console.error("Validation error:", error);
    res.status(500).json({
      success: false,
      error: "Validation failed",
      message: error.message,
    });
  }
};

export const getHomeMostBooked = async (req, res) => {
  try {
    const tests = await prisma.test.findMany({
      include: {
        // include category + subcategory if needed later
        _count: {
          select: {
            orderMemberPackages: true,
            parameters: true,
          },
        },
      },

      orderBy: {
        orderMemberPackages: {
          _count: "desc",
        },
      },

      take: 10,
    });

    res.json({ success: true, data: tests });
  } catch (err) {
    console.error("Error fetching most booked tests:", err);
    res.status(500).json({ error: "Failed to load most booked tests" });
  }
};
