/**
 * ageToKeyFromDob.js
 *
 * Given a patient's date-of-birth, compute their exact age (in days / months / years)
 * and return the best-matching reference range label from the master list.
 *
 * Strategy:
 *  1. Compute exact age in days from DOB → now.
 *  2. Parse every label in the master list into a numeric range [minDays, maxDays].
 *  3. Find all labels whose range contains the patient's age.
 *  4. Among those, return the MOST SPECIFIC one (narrowest range width).
 *  5. Fall back to "Any" if nothing matches.
 */

import { REFERENCE_RANGES } from './referenceRanges.js';

const DAY = 1;
const WEEK = 7;
const MONTH = 30.4375;       // average days per month
const YEAR = 365.25;

/**
 * Parse a human-readable time token like "3 days", "6 months", "2 years",
 * "1 day", "20 weeks" → number of days (float).
 * Returns null if unparseable.
 */
function parseDays(amount, unit) {
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return null;
  const u = String(unit || "").toLowerCase().trim();

  if (u.startsWith("day")) return n * DAY;
  if (u.startsWith("week")) return n * WEEK;
  if (u.startsWith("month")) return n * MONTH;
  if (u.startsWith("year") || u === "yr" || u === "yrs") return n * YEAR;
  return null;
}

/**
 * Try to extract a single time value from a phrase like:
 *   "3 days", "6 months", "2 years", "20 weeks", "1 year", "10 month"
 * Returns days (float) or null.
 */
function extractSingle(phrase) {
  const m = phrase.match(/(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?|yr|yrs)/i);
  if (!m) return null;
  return parseDays(m[1], m[2]);
}

/**
 * Parse a label string into { minDays, maxDays } inclusive range in days.
 * Returns null if the label cannot be parsed into a numeric age range.
 */
function parseLabel(label) {
  const raw = String(label || "").trim();
  const lo = raw.toLowerCase();

  // ── Special / non-numeric labels ───────────────────────────────────
  if (lo === "any") return { minDays: 0, maxDays: Infinity };
  if (lo === "premature born") return { minDays: 0, maxDays: 0 }; // handled separately
  if (lo === "2 weeks") return { minDays: 14, maxDays: 21 };
  if (lo === "post menopausal") return null;   // gender-only, skip age matching
  if (lo === "pregnant female") return null;
  if (lo === "non pregnant female") return null;

  // ── "Adolescents (13-20yrs)" ───────────────────────────────────────
  {
    const m = lo.match(/adolescents?\s*[\(\[]?\s*(\d+)\s*[-–to]+\s*(\d+)\s*yrs?/i);
    if (m) return { minDays: Number(m[1]) * YEAR, maxDays: Number(m[2]) * YEAR };
  }

  // ── "above X years / months / days" ───────────────────────────────
  {
    const m = lo.match(/above\s+(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?|yr|yrs?)/i);
    if (m) {
      const d = parseDays(m[1], m[2]);
      if (d !== null) return { minDays: d, maxDays: Infinity };
    }
  }

  // ── "upto / Upto / up to X" ────────────────────────────────────────
  {
    const m = lo.match(/upto?\s+(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?|yr|yrs?)/i);
    if (m) {
      const d = parseDays(m[1], m[2]);
      if (d !== null) return { minDays: 0, maxDays: d };
    }
  }

  // ── "6 months and above" ───────────────────────────────────────────
  {
    const m = lo.match(/(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?)\s+and\s+above/i);
    if (m) {
      const d = parseDays(m[1], m[2]);
      if (d !== null) return { minDays: d, maxDays: Infinity };
    }
  }

  // ── "Above 2 years" (capital) → handled by above regex already ─────
  // ── "X months" / "X days" / "X year" (single value) ──────────────
  // Only match if there is NO range separator
  if (!/[-–]|to\s|\bto\b/.test(lo)) {
    const single = extractSingle(lo);
    if (single !== null) {
      // treat as a point: ±10% tolerance
      return { minDays: single * 0.9, maxDays: single * 1.1 };
    }
  }

  // ── Range patterns: "X to Y", "X - Y" ─────────────────────────────
  // Separator: " to ", " - ", "–", " to\n"
  const SEP = /\s+to\s+|\s*[-–]\s*/i;

  // Try splitting on separator
  const parts = lo.split(SEP);
  if (parts.length >= 2) {
    const left = parts[0].trim();
    const right = parts[parts.length - 1].trim();

    // If right has no unit, borrow unit from left
    const rightHasUnit = /(days?|weeks?|months?|years?|yr|yrs?)/i.test(right);
    const leftUnit = left.match(/(days?|weeks?|months?|years?|yr|yrs?)/i)?.[0] || "";

    let minDays = extractSingle(left);
    let maxDays = rightHasUnit
      ? extractSingle(right)
      : parseDays(right.match(/(\d+(?:\.\d+)?)/)?.[1], leftUnit);

    if (minDays !== null && maxDays !== null) {
      return { minDays, maxDays };
    }

    // Fallback: both sides using leftUnit for right
    const leftNum = left.match(/^(\d+(?:\.\d+)?)/)?.[1];
    const rightNum = right.match(/^(\d+(?:\.\d+)?)/)?.[1];
    if (leftNum && rightNum && leftUnit) {
      minDays = parseDays(leftNum, leftUnit);
      maxDays = parseDays(rightNum, leftUnit);
      if (minDays !== null && maxDays !== null) {
        return { minDays, maxDays };
      }
    }
  }

  return null; // unparseable
}

/* ------------------------------------------------------------------ */
/* 2. Build parsed table once (module-level cache)                      */
/* ------------------------------------------------------------------ */

/**
 * Lazily built cache of parsed ranges for REFERENCE_RANGES
 */
let _parsed = null;

function getParsed() {
  if (_parsed) return _parsed;
  _parsed = REFERENCE_RANGES.map((label) => {
    const range = parseLabel(label);
    return { label, range };
  });
  return _parsed;
}

/* ------------------------------------------------------------------ */
/* 3. Main function                                                      */
/* ------------------------------------------------------------------ */

/**
 * Given a patient's DOB string (ISO or any Date-parseable),
 * return the best-matching reference range label from the master list.
 *
 * @param {string|Date|null} dob
 * @returns {string} - the matching label, e.g. "1 year to 5 years", or "Any"
 */
export function ageToKeyFromDob(dob) {
  try {
    if (!dob) return "Any";

    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return "Any";

    const now = new Date();
    if (now < d) return "Any";

    const patientDays = (now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000);

    const parsed = getParsed();

    // Filter to ranges that contain the patient's age
    const candidates = parsed.filter(({ range }) => {
      if (!range) return false;
      return patientDays >= range.minDays && patientDays <= range.maxDays;
    });

    if (!candidates.length) return "Any";

    // Among candidates, find the most specific (narrowest width wins)
    candidates.sort((a, b) => {
      const widthA = a.range.maxDays - a.range.minDays;
      const widthB = b.range.maxDays - b.range.minDays;
      return widthA - widthB; // ascending: narrowest first
    });

    // Return the narrowest match (prefer non-"Any" if possible)
    const best = candidates.find((c) => c.label.toLowerCase() !== "any") || candidates[0];
    return best.label;
  } catch (err) {
    console.error("ageToKeyFromDob error:", err);
    return "Any";
  }
}