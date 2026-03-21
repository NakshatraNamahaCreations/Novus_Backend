
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";
import * as XLSX from "xlsx";
import prisma from '../../lib/prisma.js';

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


const resolveDepartmentItemId = async ({ departmentItemId, categoryId }) => {
  // 1) manual override
  if (
    departmentItemId !== undefined &&
    departmentItemId !== null &&
    departmentItemId !== ""
  ) {
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

function parseFile(buffer, mimetype) {
  if (mimetype === "text/csv" || mimetype === "application/csv") {
    const text = buffer.toString("utf-8");
    return parse(text, { columns: true, skip_empty_lines: true, trim: true });
  }
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}


function toNullableFloat(val) {
  if (val === "" || val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function toFloat(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(val) {
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function toBoolean(val) {
  if (typeof val === "boolean") return val;
  return String(val).toLowerCase() === "true" || val === "1";
}


function validateRow(row, index) {
  const errors = [];
  const rowLabel = `Row ${index + 2}`;

  if (!String(row.name ?? "").trim()) errors.push(`${rowLabel}: 'name' is required`);
  if (!String(row.testType ?? "").trim()) errors.push(`${rowLabel}: 'testType' is required`);
  if (!row.categoryId) errors.push(`${rowLabel}: 'categoryId' is required`);
  if (row.actualPrice === "" || row.actualPrice === undefined || row.actualPrice === null)
    errors.push(`${rowLabel}: 'actualPrice' is required`);
  if (row.reportWithin === "" || row.reportWithin === undefined || row.reportWithin === null)
    errors.push(`${rowLabel}: 'reportWithin' is required`);
  if (!String(row.reportUnit ?? "").trim()) errors.push(`${rowLabel}: 'reportUnit' is required`);

  return errors;
}

// ─── DOWNLOAD TEMPLATE ───────────────────────────────────────────────────────

export const downloadBulkTemplate = (req, res) => {
  const headers = [
    "id", // ✅ Leave blank for CREATE, fill with exported ID for UPDATE
    "name",
    "actualPrice",
    "offerPrice",
    "discount",
    "gender",
    "description",
    "alsoKnowAs",
    "preparations",
    "sampleRequired",
    "features",
    "testType",
    "categoryId",
    "subCategoryId",
    "reportWithin",
    "reportUnit",
    "showIn",
    "spotlight", // true / false
    "sortOrder",
    "departmentItemId",
    "otherCategoryIds", // comma-separated e.g. "3,5,7"
  ];

  const sampleRow = [
    "", // id — leave blank to CREATE, put existing ID to UPDATE
    "Complete Blood Count",
    299,
    249,
    16.72,
    "Both",
    "A complete blood count test",
    "CBC",
    "Fasting not required",
    "Blood",
    "Results in 24 hours",
    "PATHOLOGY",
    1,
    "",
    24,
    "hours",
    "TEST",
    "false", // spotlight — "true" or "false"
    0,
    "",
    "",
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);

  ws["!cols"] = headers.map(() => ({ wch: 20 }));

  XLSX.utils.book_append_sheet(wb, ws, "Tests");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader(
    "Content-Disposition",
    'attachment; filename="tests_bulk_template.xlsx"',
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.send(buffer);
};
// ─── BULK UPLOAD ─────────────────────────────────────────────────────────────


export const bulkUploadTests = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const allowedTypes = [
      "text/csv",
      "application/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res
        .status(400)
        .json({ error: "Only CSV or Excel files are accepted" });
    }

    // ── Parse file ────────────────────────────────────────────────────────
    let rows;
    try {
      rows = parseFile(req.file.buffer, req.file.mimetype);
    } catch (e) {
      return res
        .status(400)
        .json({ error: "Failed to parse file: " + e.message });
    }

    if (!rows.length) {
      return res
        .status(400)
        .json({ error: "File is empty or has no data rows" });
    }

    // ── Validate all rows first ───────────────────────────────────────────
    const allErrors = [];
    rows.forEach((row, i) => {
      const errs = validateRow(row, i);
      allErrors.push(...errs);
    });

    if (allErrors.length) {
      return res
        .status(422)
        .json({ error: "Validation failed", issues: allErrors });
    }

    // ── Prefetch valid IDs in bulk ────────────────────────────────────────

    // Existing test IDs (for rows that want to UPDATE)
    const incomingIds = rows
      .map((r) => parseInt(r.id, 10))
      .filter((n) => !isNaN(n) && n > 0);

    const existingTests = incomingIds.length
      ? await prisma.test.findMany({
          where: { id: { in: incomingIds } },
          select: { id: true },
        })
      : [];
    const existingIdSet = new Set(existingTests.map((t) => t.id));

    // Categories
    const categoryIds = [
      ...new Set(rows.map((r) => Number(r.categoryId)).filter(Boolean)),
    ];
    const validCategories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true },
    });
    const validCategoryIdSet = new Set(validCategories.map((c) => c.id));

    // SubCategories
    const subCategoryIds = [
      ...new Set(rows.map((r) => Number(r.subCategoryId)).filter(Boolean)),
    ];
    const validSubCategories = subCategoryIds.length
      ? await prisma.subCategory.findMany({
          where: { id: { in: subCategoryIds } },
          select: { id: true },
        })
      : [];
    const validSubCategoryIdSet = new Set(validSubCategories.map((s) => s.id));

    // Department items
    const deptIds = [
      ...new Set(rows.map((r) => Number(r.departmentItemId)).filter(Boolean)),
    ];
    const validDeptItems = deptIds.length
      ? await prisma.departmentItem.findMany({
          where: { id: { in: deptIds } },
          select: { id: true },
        })
      : [];
    const validDeptIdSet = new Set(validDeptItems.map((d) => d.id));

    // ── Process rows ──────────────────────────────────────────────────────
    const results = { created: 0, updated: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowLabel = `Row ${i + 2}`;

      try {
        // ── Resolve & validate foreign keys ──────────────────────────────
        const categoryId = Number(row.categoryId);
        if (!validCategoryIdSet.has(categoryId)) {
          results.failed++;
          results.errors.push(
            `${rowLabel}: categoryId ${categoryId} does not exist`,
          );
          continue;
        }

        const subCategoryId = row.subCategoryId
          ? Number(row.subCategoryId)
          : null;
        if (subCategoryId && !validSubCategoryIdSet.has(subCategoryId)) {
          results.failed++;
          results.errors.push(
            `${rowLabel}: subCategoryId ${subCategoryId} does not exist`,
          );
          continue;
        }

        const departmentItemId = row.departmentItemId
          ? Number(row.departmentItemId)
          : null;
        if (departmentItemId && !validDeptIdSet.has(departmentItemId)) {
          results.failed++;
          results.errors.push(
            `${rowLabel}: departmentItemId ${departmentItemId} does not exist`,
          );
          continue;
        }

        const otherIds = row.otherCategoryIds
          ? String(row.otherCategoryIds)
              .split(",")
              .map((s) => parseInt(s.trim(), 10))
              .filter((n) => !isNaN(n) && n !== categoryId)
          : [];

        // ── Shared scalar fields (no relation fields) ─────────────────────
        // All values wrapped in String() to handle XLSX numeric cell types
        const baseData = {
          name: String(row.name ?? "").trim(),
          actualPrice: toFloat(row.actualPrice),
          offerPrice: toNullableFloat(row.offerPrice),
          discount: toFloat(row.discount, 0),
          gender: row.gender ? String(row.gender).trim() : null,
          description: row.description ? String(row.description).trim() : null,
          alsoKnowAs: row.alsoKnowAs ? String(row.alsoKnowAs).trim() : null,
          preparations: row.preparations ? String(row.preparations).trim() : null,
          sampleRequired: row.sampleRequired ? String(row.sampleRequired).trim() : null,
          features: row.features ? String(row.features).trim() : null,
          testType: String(row.testType ?? "").trim(),
          reportWithin: toInt(row.reportWithin),
          reportUnit: String(row.reportUnit ?? "hours").trim() || "hours",
          showIn: row.showIn ? String(row.showIn).trim() : null,
          spotlight: toBoolean(row.spotlight),
          sortOrder: toInt(row.sortOrder) ?? 0,
        };

        // ── Decide: UPDATE or CREATE ──────────────────────────────────────
        const incomingId = parseInt(row.id, 10);
        const isUpdate = !isNaN(incomingId) && incomingId > 0;

        if (isUpdate) {
          // ── Row has an ID ─────────────────────────────────────────────
          if (!existingIdSet.has(incomingId)) {
            results.failed++;
            results.errors.push(
              `${rowLabel}: ID ${incomingId} not found — skipped. Remove the ID column value to create a new test instead.`,
            );
            continue;
          }

          // UPDATE: use nested connect/disconnect syntax for relations
          await prisma.test.update({
            where: { id: incomingId },
            data: {
              ...baseData,
              // Required relation — always connect
              category: { connect: { id: categoryId } },
              // Optional relations — connect if present, disconnect if null
              subCategory: subCategoryId
                ? { connect: { id: subCategoryId } }
                : { disconnect: true },
              departmentItem: departmentItemId
                ? { connect: { id: departmentItemId } }
                : { disconnect: true },
              // Replace otherCategories only if provided
              ...(otherIds.length > 0 && {
                otherCategories: {
                  deleteMany: {},
                  create: otherIds.map((cid) => ({ categoryId: cid })),
                },
              }),
            },
          });

          results.updated++;
        } else {
          // CREATE: connect for required, omit optional if null (no disconnect)
          await prisma.test.create({
            data: {
              ...baseData,
              createdById: req.user?.id ?? null,
              // Required relation — always connect
              category: { connect: { id: categoryId } },
              // Optional relations — connect only if present, omit entirely if null
              ...(subCategoryId && {
                subCategory: { connect: { id: subCategoryId } },
              }),
              ...(departmentItemId && {
                departmentItem: { connect: { id: departmentItemId } },
              }),
              ...(otherIds.length > 0 && {
                otherCategories: {
                  create: otherIds.map((cid) => ({ categoryId: cid })),
                },
              }),
            },
          });

          results.created++;
        }
      } catch (err) {
        results.failed++;
        results.errors.push(`${rowLabel}: ${err.message}`);
      }
    }

    return res.status(200).json({
      message: `Done. ${results.created} created, ${results.updated} updated, ${results.failed} failed.`,
      ...results,
    });
  } catch (error) {
    console.error("Bulk upload error:", error);
    return res.status(500).json({ error: "Bulk upload failed" });
  }
};

// Add to package.controller.js

export const exportTests = async (req, res) => {
  try {
    const { search, categoryId, subCategoryId, testType, departmentItemId } =
      req.query;

    // ── Build same filters as getAllTests ──────────────────────────────────
    const where = {};

    if (search?.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { description: { contains: search.trim(), mode: "insensitive" } },
        { testType: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    if (categoryId) where.categoryId = parseInt(categoryId, 10);
    if (subCategoryId) where.subCategoryId = parseInt(subCategoryId, 10);
    if (testType) where.testType = testType;
    if (departmentItemId)
      where.departmentItemId = parseInt(departmentItemId, 10);

    // ── Fetch ALL matching (no pagination) ────────────────────────────────
    const tests = await prisma.test.findMany({
      where,
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: {
        category: { select: { name: true } },
        subCategory: { select: { name: true } },
        departmentItem: { select: { name: true, type: true } },
        otherCategories: { select: { categoryId: true } },
      },
    });

    if (!tests.length) {
      return res
        .status(404)
        .json({ error: "No tests found for the selected filters." });
    }

    const rows = tests.map((t) => ({
      id: t.id, // ✅ for UPDATE
      name: t.name,
      actualPrice: t.actualPrice,
      offerPrice: t.offerPrice ?? "",
      discount: t.discount ?? 0,
      gender: t.gender ?? "",
      description: t.description ?? "",
      alsoKnowAs: t.alsoKnowAs ?? "",
      preparations: t.preparations ?? "",
      sampleRequired: t.sampleRequired ?? "",
      features: t.features ?? "",
      testType: t.testType ?? "",
      categoryId: t.categoryId,
      subCategoryId: t.subCategoryId ?? "",
      reportWithin: t.reportWithin,
      reportUnit: t.reportUnit,
      showIn: t.showIn ?? "",
      spotlight: t.spotlight ? "true" : "false",
      sortOrder: t.sortOrder ?? 0,
      departmentItemId: t.departmentItemId ?? "",
      otherCategoryIds: (t.otherCategories ?? [])
        .map((o) => o.categoryId)
        .join(","),
    }));

    // ── Build XLSX ────────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto column widths
    const colWidths = Object.keys(rows[0]).map((key) => ({
      wch:
        Math.max(key.length, ...rows.map((r) => String(r[key] ?? "").length)) +
        2,
    }));
    ws["!cols"] = colWidths;

    // Freeze header row
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, "Tests");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // ── Send file ─────────────────────────────────────────────────────────
    const filename = `tests_export_${new Date().toISOString().split("T")[0]}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (error) {
    console.error("Export tests error:", error);
    return res.status(500).json({ error: "Failed to export tests" });
  }
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

    if (!name?.trim())
      return res.status(400).json({ error: "Name is required" });
    if (!categoryId)
      return res.status(400).json({ error: "categoryId is required" });
    if (!testType)
      return res.status(400).json({ error: "testType is required" });
    if (
      reportWithin === undefined ||
      reportWithin === null ||
      reportWithin === ""
    )
      return res.status(400).json({ error: "reportWithin is required" });
    if (!reportUnit)
      return res.status(400).json({ error: "reportUnit is required" });

    // Upload image (optional)
    let imgUrl = null;
    if (req.file) imgUrl = await uploadToS3(req.file, "tests");

    // Parse numeric values
    const actual = Number(actualPrice);
    if (!Number.isFinite(actual))
      return res.status(400).json({ error: "Invalid actualPrice" });

    const finalOffer =
      offerPrice !== undefined && offerPrice !== null && offerPrice !== ""
        ? Number(offerPrice)
        : null;

    const finalDiscount =
      discount !== undefined && discount !== null && discount !== ""
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
      if (!subCategory)
        return res.status(400).json({ error: "Invalid subCategoryId" });
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
      (id) => id !== Number(category.id),
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

        sortOrder:
          sortOrder !== undefined && sortOrder !== null && sortOrder !== ""
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
    // Support both ?q=... (EditOrderModal) and ?search=... (other callers)
    const searchTerm = (req.query.q || req.query.search || "").trim();

    const tests = await prisma.test.findMany({
      where: searchTerm
        ? { name: { contains: searchTerm, mode: "insensitive" } }
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
    return res
      .status(500)
      .json({ success: false, message: "Failed to group tests" });
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
      if (!category)
        return res.status(400).json({ error: "Invalid categoryId" });
      finalCategoryId = category.id;
    }

    // subcategory validate
    let finalSubCategoryId = existing.subCategoryId;
    if (
      subCategoryId !== undefined &&
      subCategoryId !== null &&
      subCategoryId !== ""
    ) {
      const subCategory = await prisma.subCategory.findUnique({
        where: { id: Number(subCategoryId) },
        select: { id: true },
      });
      if (!subCategory)
        return res.status(400).json({ error: "Invalid subCategoryId" });
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

    const finalSpotlight =
      spotlight !== undefined
        ? parseBoolean(spotlight, existing.spotlight)
        : existing.spotlight;

    // cityWisePrice
    const parsedCityWisePrice =
      cityWisePrice !== undefined &&
      cityWisePrice !== null &&
      cityWisePrice !== ""
        ? parseJsonIfString(cityWisePrice)
        : existing.cityWisePrice;

    // other categories replace
    const otherIds = parseIdsArray(otherCategoryIds).filter(
      (cid) => cid !== Number(finalCategoryId),
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

    if (
      reportWithin !== undefined &&
      reportWithin !== null &&
      reportWithin !== ""
    ) {
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
          error:
            "You can’t delete this test because patient results are already created for it.",
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

    if (!catId)
      return res.status(400).json({ error: "Valid Category ID is required" });

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
          select: {
            categoryId: true,
            category: { select: { id: true, name: true } },
          },
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
    return res
      .status(500)
      .json({ error: "Failed to fetch tests by subcategory" });
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

    if (
      departmentItemId !== undefined &&
      departmentItemId !== null &&
      departmentItemId !== ""
    ) {
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

    if (
      testType !== undefined &&
      testType !== null &&
      String(testType).trim() !== ""
    ) {
      where.testType = String(testType).trim();
    }

    // Optional safety: require at least one filter
    if (!where.departmentItemId && !where.categoryId && !where.testType) {
      return res.status(400).json({
        message:
          "Please select at least one filter: departmentItemId or categoryId or testType",
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
          discount: fields.discount, // ✅ percent always
          offerPrice: fields.offerPrice, // ✅ computed final price
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
