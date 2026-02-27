/* ---------------- AGE KEY FROM DOB ---------------- */
export const ageToKeyFromDob = (dob) => {

  console.log("dob",dob)
  try {
    if (!dob) return "any";

    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return "any";

    const now = new Date();
    if (now < d) return "any";

    const diffMs = now.getTime() - d.getTime();
    const days = diffMs / (24 * 60 * 60 * 1000);

    console.log("days",days)

    // 🔹 0–30 days
    if (days < 31) return "newborn_upto_1_month";

    // 🔹 1 month – 1 year
    if (days < 365.25) return "1_month_to_1_year";

    const years = days / 365.25;
    console.log("dob",dob, "years", years)

    if (years < 2) return "1_year_to_2_years";
    if (years < 10) return "2_years_to_10_years";
    if (years < 18) return "10_years_to_17_years";

    return "any";
  } catch (err) {
    console.error("ageToKeyFromDob error:", err);
    return "any";
  }
};