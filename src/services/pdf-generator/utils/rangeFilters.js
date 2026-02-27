// utils/rangeFilters.js (or keep inside controller/service)
export const normalizeGender = (g) => {
  const x = String(g || "").trim().toUpperCase();

  if (!x) return "BOTH";
  if (x === "M" || x === "MALE") return "Male";
  if (x === "F" || x === "FEMALE") return "Female";
  if (x === "K" || x === "KIDS" || x === "KID") return "Kids";
  if (x === "B" || x === "BOTH") return "BOTH";

  // if someone sends "Both" or weird case
  if (x === "BOTH") return "BOTH";
  return "BOTH";
};

export const genderWhere = (gender) => {
  const g = normalizeGender(gender);

  // if Kids requested, allow Kids + Both
  if (g === "Kids") {
    return { OR: [{ gender: "Kids" }, { gender: "KIDS" }, { gender: "Both" }, { gender: "BOTH" }] };
  }

  // Male/Female/BOTH
  return { OR: [{ gender: "Both" }, { gender: "BOTH" }, { gender: g }] };
};

// ✅ age from query can be: "2", 2, "2_years_to_10_years", "any"
// ✅ Return: ageKey string OR null (adult/out-of-range/unknown)  <-- IMPORTANT
export const ageToKeyFromQuery = (ageInput) => {
  const s = String(ageInput ?? "").trim();
  if (!s) return null;

  const lower = s.toLowerCase();

  // if query explicitly says any -> treat as adult/unknown => null (so only "any" ranges show)
  if (lower === "any") return null;

  // if frontend already sends the key
  const allowedKeys = new Set([
    "newborn_upto_1_month",
    "1_month_to_1_year",
    "1_year_to_2_years",
    "2_years_to_10_years",
    "10_years_to_17_years",
  ]);
  if (allowedKeys.has(lower)) return lower;

  // try years number
  const years = Number(s);
  if (!Number.isFinite(years) || years < 0) return null;

  if (years < 1 / 12) return "newborn_upto_1_month";
  if (years < 1) return "1_month_to_1_year";
  if (years < 2) return "1_year_to_2_years";
  if (years < 10) return "2_years_to_10_years";
  if (years < 18) return "10_years_to_17_years";

  // adult / out of supported pediatric ranges
  return null;
};

export const rangesWhere = (gender, ageKey) => {
  const gWhere = genderWhere(gender);

  const ageFilter = ageKey
    ? { referenceRange: { in: [ageKey, "any", "Any"] } }
    : { referenceRange: { in: ["any", "Any"] } };

  return { AND: [gWhere, ageFilter] };
};