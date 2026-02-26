import { PrismaClient } from "@prisma/client";
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

/* --------------------------
  helpers
-------------------------- */
 export const parseIdsArray = (value) => {
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

 export const parseBoolean = (val, fallback = false) => {
  if (val === undefined || val === null) return fallback;
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val === "true";
  return fallback;
};

export const parseJsonIfString = (v) => {
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

export const parseDiscountInput = (raw) => {
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

  if (!row.name?.trim()) errors.push(`${rowLabel}: 'name' is required`);
  if (!row.testType?.trim()) errors.push(`${rowLabel}: 'testType' is required`);
  if (!row.categoryId) errors.push(`${rowLabel}: 'categoryId' is required`);
  if (row.actualPrice === "" || row.actualPrice === undefined)
    errors.push(`${rowLabel}: 'actualPrice' is required`);
  if (row.reportWithin === "" || row.reportWithin === undefined)
    errors.push(`${rowLabel}: 'reportWithin' is required`);
  if (!row.reportUnit?.trim())
    errors.push(`${rowLabel}: 'reportUnit' is required`);

  return errors;
}