import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";
import csv from "csv-parser";
import { Readable } from "stream";

const prisma = new PrismaClient();

/* --------------------------
  helpers
-------------------------- */
const parseIdsArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((x) => Number(x)).filter(Boolean);

  if (typeof value === "string") {
    if (value.includes(",")) {
      return value
        .split(",")
        .map((x) => Number(x.trim()))
        .filter(Boolean);
    }

    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(Number).filter(Boolean);
    } catch {}

    const n = Number(value);
    return Number.isFinite(n) ? [n] : [];
  }

  return [];
};

const parseBoolean = (val, fallback = false) => {
  if (val === undefined || val === null) return fallback;
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val === "true";
  return fallback;
};

const parseJsonIfString = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v;
};

/* =========================
   helpers (same as yours)
========================= */
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const round2 = (n) => +Number(n || 0).toFixed(2);

const parseDiscountInput = (raw) => {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  if (text.endsWith("%")) {
    const num = Number(text.slice(0, -1).trim());
    if (!Number.isFinite(num)) return null;
    return { mode: "PERCENT", value: num };
  }

  const num = Number(text);
  if (!Number.isFinite(num)) return null;
  return { mode: "AMOUNT", value: num };
};

const computeDiscountFields = (actualPrice, discountInput) => {
  const actual = Number(actualPrice || 0);
  if (!Number.isFinite(actual) || actual <= 0) {
    return { discount: 0, offerPrice: round2(actual) };
  }

  const parsed = parseDiscountInput(discountInput);
  if (!parsed) {
    return { discount: 0, offerPrice: round2(actual) };
  }

  let discountAmount = 0;
  let percent = 0;

  if (parsed.mode === "PERCENT") {
    percent = clamp(parsed.value, 0, 100);
    discountAmount = round2(actual * (percent / 100));
  } else {
    discountAmount = clamp(round2(parsed.value), 0, round2(actual));
    percent = round2((discountAmount / actual) * 100);
  }

  return {
    discount: percent,
    offerPrice: round2(actual - discountAmount),
  };
};


/**
 * ✅ Resolve departmentItemId for a test
 * Priority:
 *  1) req.body.departmentItemId (if provided)
 *  2) Category.departmentItemId (auto)
 */
const resolveDepartmentItemId = async ({ departmentItemId, categoryId }) => {
  // 1) manual override
  if (departmentItemId !== undefined && departmentItemId !== null && departmentItemId !== "") {
    const depId = Number(departmentItemId);
    if (!depId) throw new Error("Invalid departmentItemId");

    const dep = await prisma.departmentItem.findUnique({
      where: { id: depId },
      select: { id: true, isActive: true },
    });

    if (!dep) throw new Error("Invalid departmentItemId");
    if (dep.isActive === false) throw new Error("Department is inactive");

    return dep.id;
  }

  // 2) auto from category
  if (!categoryId) return null;

  const cat = await prisma.category.findUnique({
    where: { id: Number(categoryId) },
    select: { id: true, departmentItemId: true },
  });

  if (!cat) throw new Error("Invalid categoryId");

  return cat.departmentItemId ? Number(cat.departmentItemId) : null;
};

/* =========================================================
   ADD TEST  ✅ now stores departmentItemId
========================================================= */
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

      // ✅ NEW
      departmentItemId, // optional, else auto from category

      // ✅ existing (multi-category)
      otherCategoryIds,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    if (!categoryId) return res.status(400).json({ error: "categoryId is required" });
    if (!testType) return res.status(400).json({ error: "testType is required" });
    if (reportWithin === undefined || reportWithin === null || reportWithin === "")
      return res.status(400).json({ error: "reportWithin is required" });
    if (!reportUnit) return res.status(400).json({ error: "reportUnit is required" });

    // Upload image (optional)
    let imgUrl = null;
    if (req.file) imgUrl = await uploadToS3(req.file, "tests");

    // Parse numeric values
    const actual = Number(actualPrice);
    if (!Number.isFinite(actual)) return res.status(400).json({ error: "Invalid actualPrice" });

    const finalOffer = offerPrice !== undefined && offerPrice !== null && offerPrice !== ""
      ? Number(offerPrice)
      : null;

    const finalDiscount = discount !== undefined && discount !== null && discount !== ""
      ? Number(discount)
      : 0;

    const parsedCityWisePrice = parseJsonIfString(cityWisePrice);
    const finalSpotlight = parseBoolean(spotlight, false);

    // Validate category
    const category = await prisma.category.findUnique({
      where: { id: Number(categoryId) },
      select: { id: true },
    });
    if (!category) return res.status(400).json({ error: "Invalid categoryId" });

    // Validate subcategory (optional)
    let subCategory = null;
    if (subCategoryId) {
      subCategory = await prisma.subCategory.findUnique({
        where: { id: Number(subCategoryId) },
        select: { id: true },
      });
      if (!subCategory) return res.status(400).json({ error: "Invalid subCategoryId" });
    }

    // ✅ Resolve departmentItemId
    let finalDepartmentItemId = null;
    try {
      finalDepartmentItemId = await resolveDepartmentItemId({
        departmentItemId,
        categoryId: category.id,
      });
    } catch (e) {
      return res.status(400).json({ error: e.message || "Invalid department" });
    }

    // ✅ Parse other categories
    const otherIds = parseIdsArray(otherCategoryIds).filter(
      (id) => id !== Number(category.id)
    );

    const test = await prisma.test.create({
      data: {
        name: name.trim(),
        createdById: req.user?.id ?? null,

        actualPrice: actual,
        offerPrice: finalOffer,
        discount: finalDiscount,
        cityWisePrice: parsedCityWisePrice,

        gender: gender ?? null,
        imgUrl,
        description: description ?? null,
        contains: contains ?? null,
        preparations: preparations ?? null,
        sampleRequired: sampleRequired ?? null,

        testType,
        categoryId: category.id,
        subCategoryId: subCategory ? subCategory.id : null,

        // ✅ NEW
        departmentItemId: finalDepartmentItemId,

        reportWithin: Number(reportWithin),
        reportUnit: String(reportUnit),
        showIn: showIn ?? null,
        alsoKnowAs: alsoKnowAs ?? null,
        spotlight: finalSpotlight,
        features: features ?? null,

        sortOrder: sortOrder !== undefined && sortOrder !== null && sortOrder !== ""
          ? Number(sortOrder)
          : 0,

        otherCategories: otherIds.length
          ? {
              create: otherIds.map((cid) => ({ categoryId: Number(cid) })),
            }
          : undefined,
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
        subCategory: true,
        departmentItem: { select: { id: true, name: true, type: true } }, // ✅
        otherCategories: { select: { categoryId: true } },
      },
    });

    return res.status(201).json(test);
  } catch (error) {
    console.error("Error creating test:", error);
    return res.status(500).json({ error: "Failed to create test" });
  }
};

/* =========================================================
   GET ALL TESTS  ✅ include department
========================================================= */
export const getAllTests = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      categoryId,
      subCategoryId,
      testType,
      departmentItemId, // ✅ NEW filter
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
    if (testType) where.testType = String(testType);
    if (departmentItemId) where.departmentItemId = Number(departmentItemId);

    const total = await prisma.test.count({ where });

    const tests = await prisma.test.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, type: true } },
        subCategory: true,
        departmentItem: { select: { id: true, name: true, type: true } }, // ✅
        otherCategories: true,
        parameters: { select: { id: true, name: true } },
        _count: { select: { parameters: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ createdAt: "desc" }],
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
        departmentItem: { select: { id: true, name: true, type: true } }, // ✅
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return res.json({ data: tests });
  } catch (error) {
    console.error("Error fetching tests:", error);
    return res.status(500).json({ error: "Failed to fetch tests" });
  }
};

/* =========================================================
   GET SPOTLIGHT TESTS ✅ include department
========================================================= */
export const getSpotlightTests = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      categoryId,
      subCategoryId,
      testType,
      departmentItemId, // ✅ NEW filter
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    const filter = { spotlight: true };

    if (search.trim() !== "") {
      filter.name = { contains: search, mode: "insensitive" };
    }

    if (categoryId) filter.categoryId = Number(categoryId);
    if (subCategoryId) filter.subCategoryId = Number(subCategoryId);
    if (testType) filter.testType = String(testType);
    if (departmentItemId) filter.departmentItemId = Number(departmentItemId);

    const total = await prisma.test.count({ where: filter });

    const tests = await prisma.test.findMany({
      where: filter,
      include: {
        category: { select: { id: true, name: true, type: true } },
        subCategory: true,
        departmentItem: { select: { id: true, name: true, type: true } }, // ✅
        _count: { select: { parameters: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

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

/* =========================================================
   SEARCH GROUPED (by category) ✅ unchanged but safe
========================================================= */
export const searchTestsGrouped = async (req, res) => {
  try {
    const { search } = req.query;

    const tests = await prisma.test.findMany({
      where: search
        ? { name: { contains: String(search).trim(), mode: "insensitive" } }
        : {},
      select: {
        id: true,
        name: true,
        actualPrice: true,
        discount: true,
        offerPrice: true,
        category: { select: { id: true, name: true } },
      },
    });

    const formattedTests = tests.map((t) => ({
      id: t.id,
      name: t.name,
      actualPrice: t.actualPrice,
      discount: t.discount,
      finalPrice: t.offerPrice,
      categoryName: t.category?.name || "Uncategorized",
    }));

    const grouped = formattedTests.reduce((acc, test) => {
      if (!acc[test.categoryName]) acc[test.categoryName] = [];
      acc[test.categoryName].push({
        id: test.id,
        name: test.name,
        actualPrice: test.actualPrice,
        discount: test.discount,
        finalPrice: test.finalPrice,
      });
      return acc;
    }, {});

    return res.json({ success: true, data: grouped });
  } catch (error) {
    console.error("Error grouping tests:", error);
    return res.status(500).json({ success: false, message: "Failed to group tests" });
  }
};

/* =========================================================
   SEARCH TESTS + CHECKUPS ✅ include department for tests
========================================================= */
export const searchTestsAndCheckups = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();

    if (!search || search.length < 2) {
      return res.json({ success: true, data: { tests: [], checkups: [] } });
    }

    const [tests, checkups] = await Promise.all([
      prisma.test.findMany({
        where: {
          status: "active",
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { alsoKnowAs: { contains: search, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          actualPrice: true,
          offerPrice: true,
          discount: true,
          category: { select: { name: true } },
          departmentItem: { select: { id: true, name: true, type: true } }, // ✅
        },
        take: 25,
        orderBy: { createdAt: "desc" },
      }),

      prisma.healthPackage.findMany({
        where: {
          status: "active",
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { alsoKnowAs: { contains: search, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          name: true,
          actualPrice: true,
          offerPrice: true,
          discount: true,
          category: { select: { name: true } },
        },
        take: 25,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const normalizedTests = tests.map((t) => ({
      ...t,
      finalPrice: Number(t.offerPrice ?? t.actualPrice ?? 0),
      categoryName: t.category?.name || "Tests",
      type: "test",
    }));

    const normalizedCheckups = checkups.map((p) => ({
      ...p,
      finalPrice: Number(p.offerPrice ?? p.actualPrice ?? 0),
      categoryName: p.category?.name || "Checkups",
      type: "package",
    }));

    return res.json({
      success: true,
      data: { tests: normalizedTests, checkups: normalizedCheckups },
    });
  } catch (err) {
    console.error("SEARCH TESTS+CHECKUPS ERROR:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =========================================================
   GET TEST BY ID ✅ include department
========================================================= */
export const getTestById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Test ID is required" });

    const test = await prisma.test.findUnique({
      where: { id: Number(id) },
      include: {
        category: { select: { name: true } },
        subCategory: true,
        departmentItem: { select: { id: true, name: true, type: true } }, // ✅
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
        _count: { select: { parameters: true } },
      },
    });

    if (!test) return res.status(404).json({ error: "Test not found" });
    return res.json(test);
  } catch (error) {
    console.error("Error fetching test:", error);
    return res.status(500).json({ error: "Failed to fetch test" });
  }
};

/* =========================================================
   UPDATE TEST ✅ now updates departmentItemId (auto or manual)
========================================================= */
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
      otherCategoryIds,
      reportWithin,
      reportUnit,

      // ✅ NEW
      departmentItemId, // optional override
    } = req.body;

    const existing = await prisma.test.findUnique({
      where: { id: Number(id) },
      select: {
        id: true,
        imgUrl: true,
        actualPrice: true,
        offerPrice: true,
        discount: true,
        cityWisePrice: true,
        gender: true,
        description: true,
        contains: true,
        spotlight: true,
        preparations: true,
        sampleRequired: true,
        testType: true,
        categoryId: true,
        subCategoryId: true,
        showIn: true,
        alsoKnowAs: true,
        features: true,
        sortOrder: true,
        reportWithin: true,
        reportUnit: true,
        departmentItemId: true,
        name: true,
      },
    });

    if (!existing) return res.status(404).json({ error: "Test not found" });

    // Image
    let imgUrl = existing.imgUrl;
    if (req.file) {
      if (existing.imgUrl) await deleteFromS3(existing.imgUrl);
      imgUrl = await uploadToS3(req.file, "tests");
    }

    // category validate + finalCategoryId
    let finalCategoryId = existing.categoryId;
    if (categoryId !== undefined && categoryId !== null && categoryId !== "") {
      const category = await prisma.category.findUnique({
        where: { id: Number(categoryId) },
        select: { id: true },
      });
      if (!category) return res.status(400).json({ error: "Invalid categoryId" });
      finalCategoryId = category.id;
    }

    // subcategory validate
    let finalSubCategoryId = existing.subCategoryId;
    if (subCategoryId !== undefined && subCategoryId !== null && subCategoryId !== "") {
      const subCategory = await prisma.subCategory.findUnique({
        where: { id: Number(subCategoryId) },
        select: { id: true },
      });
      if (!subCategory) return res.status(400).json({ error: "Invalid subCategoryId" });
      finalSubCategoryId = subCategory.id;
    }

    // ✅ resolve departmentItemId (manual OR auto from finalCategoryId)
    let finalDepartmentItemId = existing.departmentItemId ?? null;
    try {
      // if user changed category or sent departmentItemId, re-resolve
      const shouldResolve =
        (departmentItemId !== undefined && departmentItemId !== null) ||
        (categoryId !== undefined && categoryId !== null && categoryId !== "");

      if (shouldResolve) {
        finalDepartmentItemId = await resolveDepartmentItemId({
          departmentItemId,
          categoryId: finalCategoryId,
        });
      }
    } catch (e) {
      return res.status(400).json({ error: e.message || "Invalid department" });
    }

    // prices
    const actual =
      actualPrice !== undefined && actualPrice !== null && actualPrice !== ""
        ? Number(actualPrice)
        : existing.actualPrice;

    const finalDiscount =
      discount !== undefined && discount !== null && discount !== ""
        ? Number(discount)
        : existing.discount;

    const finalOfferPrice =
      offerPrice !== undefined && offerPrice !== null && offerPrice !== ""
        ? Number(offerPrice)
        : existing.offerPrice;

    const finalSpotlight = spotlight !== undefined ? parseBoolean(spotlight, existing.spotlight) : existing.spotlight;

    // cityWisePrice
    const parsedCityWisePrice =
      cityWisePrice !== undefined && cityWisePrice !== null && cityWisePrice !== ""
        ? parseJsonIfString(cityWisePrice)
        : existing.cityWisePrice;

    // other categories replace
    const otherIds = parseIdsArray(otherCategoryIds).filter(
      (cid) => cid !== Number(finalCategoryId)
    );

    const data = {
      name: name ?? existing.name,
      actualPrice: actual,
      offerPrice: finalOfferPrice,
      discount: finalDiscount,
      cityWisePrice: parsedCityWisePrice,
      gender: gender ?? existing.gender,
      imgUrl,
      description: description ?? existing.description,
      contains: contains ?? existing.contains,
      preparations: preparations ?? existing.preparations,
      sampleRequired: sampleRequired ?? existing.sampleRequired,
      testType: testType ?? existing.testType,
      showIn: showIn ?? existing.showIn,
      alsoKnowAs: alsoKnowAs ?? existing.alsoKnowAs,
      spotlight: finalSpotlight,
      categoryId: finalCategoryId,
      subCategoryId: finalSubCategoryId,

      // ✅ NEW
      departmentItemId: finalDepartmentItemId,

      sortOrder:
        sortOrder !== undefined && sortOrder !== null && sortOrder !== ""
          ? Number(sortOrder)
          : (existing.sortOrder ?? 0),

      otherCategories: {
        deleteMany: {},
        create: otherIds.map((cid) => ({ categoryId: Number(cid) })),
      },
    };

    if (features !== undefined) data.features = features;

    if (reportWithin !== undefined && reportWithin !== null && reportWithin !== "") {
      data.reportWithin = Number(reportWithin);
    }

    if (reportUnit !== undefined && reportUnit !== null && reportUnit !== "") {
      data.reportUnit = String(reportUnit);
    } else {
      data.reportUnit = existing.reportUnit; // keep safe
    }

    const updated = await prisma.test.update({
      where: { id: Number(id) },
      data,
      include: {
        category: { select: { id: true, name: true, type: true } },
        subCategory: true,
        departmentItem: { select: { id: true, name: true, type: true } }, // ✅
        otherCategories: { select: { categoryId: true } },
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error("Error updating test:", error);
    return res.status(500).json({ error: "Failed to update test" });
  }
};

/* =========================================================
   DELETE TEST (same)
========================================================= */
export const deleteTest = async (req, res) => {
  try {
    const { id } = req.params;
    const testId = Number(id);

    const existing = await prisma.test.findUnique({
      where: { id: testId },
      select: { id: true, imgUrl: true },
    });

    if (!existing) return res.status(404).json({ error: "Test not found" });

    await prisma.test.delete({ where: { id: testId } });

    if (existing.imgUrl) {
      try {
        await deleteFromS3(existing.imgUrl);
      } catch (e) {
        console.warn("S3 delete failed (ignored):", e?.message || e);
      }
    }

    return res.json({ message: "Test deleted successfully" });
  } catch (error) {
    console.error("Error deleting test:", error);

    if (error?.code === "P2003") {
      if (error?.meta?.constraint === "PatientTestResult_testId_fkey") {
        return res.status(409).json({
          error: "You can’t delete this test because patient results are already created for it.",
          code: "TEST_IN_USE",
        });
      }
      return res.status(409).json({
        error: "You can’t delete this test because it is used elsewhere.",
        code: "FK_CONSTRAINT",
      });
    }

    return res.status(500).json({ error: "Failed to delete test" });
  }
};

/* =========================================================
   GET TESTS BY CATEGORY ✅ include department
========================================================= */
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
        OR: [
          { categoryId: catId },
          { otherCategories: { some: { categoryId: catId } } },
        ],
      },
      include: {
        subCategory: true,
        departmentItem: { select: { id: true, name: true, type: true } }, // ✅
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

/* =========================================================
   GET TESTS BY SUBCATEGORY (optional add department)
========================================================= */
export const getTestsBySubCategory = async (req, res) => {
  try {
    const { subCategoryId } = req.params;

    const tests = await prisma.test.findMany({
      where: { subCategoryId: Number(subCategoryId) },
      include: {
        category: true,
        subCategory: true,
        departmentItem: { select: { id: true, name: true, type: true } }, // ✅
      },
    });

    return res.json(tests);
  } catch (error) {
    console.error("Error fetching tests by subcategory:", error);
    return res.status(500).json({ error: "Failed to fetch tests by subcategory" });
  }
};

export const getTestsByTestType = async (req, res) => {
  try {
    const { testType } = req.params;

    const tests = await prisma.test.findMany({
      where: { testType: { equals: testType, mode: "insensitive" } },
      include: {
        category: true,
        subCategory: true,
        departmentItem: { select: { id: true, name: true, type: true } }, // ✅
      },
    });

    return res.json(tests);
  } catch (error) {
    console.error("Error fetching tests by testType:", error);
    return res.status(500).json({ error: "Failed to fetch tests by testType" });
  }
};

export const getHomeMostBooked = async (req, res) => {
  try {
    const tests = await prisma.test.findMany({
      include: {
        departmentItem: { select: { id: true, name: true, type: true } }, // ✅
        _count: {
          select: { orderMemberPackages: true, parameters: true },
        },
      },
      orderBy: {
        orderMemberPackages: { _count: "desc" },
      },
      take: 10,
    });

    return res.json({ success: true, data: tests });
  } catch (err) {
    console.error("Error fetching most booked tests:", err);
    return res.status(500).json({ error: "Failed to load most booked tests" });
  }
};




// ✅ BULK DISCOUNT (Postgres + Prisma) — updates discount% + offerPrice only
export const bulkDiscount = async (req, res) => {
  try {
    const { departmentItemId, categoryId, testType, discountInput } = req.body;

    if (!discountInput || !String(discountInput).trim()) {
      return res
        .status(400)
        .json({ message: 'discountInput required. Example: "10%" or "150"' });
    }

    // Build WHERE (any combination)
    const where = {};

    if (departmentItemId !== undefined && departmentItemId !== null && departmentItemId !== "") {
      const depId = Number(departmentItemId);
      if (!Number.isFinite(depId)) {
        return res.status(400).json({ message: "Invalid departmentItemId" });
      }
      where.departmentItemId = depId;
    }

    if (categoryId !== undefined && categoryId !== null && categoryId !== "") {
      const catId = Number(categoryId);
      if (!Number.isFinite(catId)) {
        return res.status(400).json({ message: "Invalid categoryId" });
      }
      where.categoryId = catId;
    }

    if (testType !== undefined && testType !== null && String(testType).trim() !== "") {
      where.testType = String(testType).trim();
    }

    // Optional safety: require at least one filter
    if (!where.departmentItemId && !where.categoryId && !where.testType) {
      return res.status(400).json({
        message: "Please select at least one filter: departmentItemId or categoryId or testType",
      });
    }

    // Fetch matching tests
    const tests = await prisma.test.findMany({
      where,
      select: { id: true, actualPrice: true },
    });

    if (!tests.length) {
      return res.json({ message: "No tests found", updated: 0 });
    }

    // Compute and update per test (offerPrice depends on each actualPrice)
    const updates = tests.map((t) => {
      const fields = computeDiscountFields(t.actualPrice, discountInput);
      return prisma.test.update({
        where: { id: t.id },
        data: {
          discount: fields.discount,      // ✅ percent always
          offerPrice: fields.offerPrice,  // ✅ computed final price
        },
      });
    });

    await prisma.$transaction(updates);

    return res.json({
      message: "Discount applied successfully",
      updated: tests.length,
    });
  } catch (e) {
    console.error("bulkDiscount error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};
