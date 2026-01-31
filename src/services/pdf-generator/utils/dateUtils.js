// utils/dateUtils.js
export function calculateAge(dob) {
  if (!dob) return "N/A";
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function formatShortDate(date) {
  if (!date) return "";
  try {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return "";
  }
}

export function formatDateTime(date) {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

export function getDateArrayFromTrends(trendData, maxItems = 3) {
  const dates = [];
  for (let i = 0; i < maxItems; i++) {
    const date = trendData[i]?.date;
    dates.push(date ? formatShortDate(date) : `Date ${i + 1}`);
  }
  return dates;
}

// For backward compatibility
export const DateUtils = {
  calculateAge,
  formatShortDate,
  formatDateTime,
  getDateArrayFromTrends,
};