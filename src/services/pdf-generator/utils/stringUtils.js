// utils/stringUtils.js
export function safeTrim(value) {
  if (value == null) return "";
  return String(value).trim();
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isHtmlPresent(html) {
  return safeTrim(html) !== "";
}

export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < (array?.length || 0); i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function getFlagKind(flag) {
  const flagStr = safeTrim(flag).toLowerCase();
  if (!flagStr || flagStr === "normal") return "normal";
  if (flagStr.includes("high")) return "high";
  if (flagStr.includes("low")) return "low";
  if (flagStr.includes("critical")) {
    if (flagStr.includes("high")) return "high";
    if (flagStr.includes("low")) return "low";
    return "high";
  }
  return "normal";
}

export function formatValueWithUnit(value, unit) {
  const valueStr = value == null || String(value).trim() === "" ? "—" : String(value);
  const unitStr = safeTrim(unit);
  if (!unitStr || valueStr === "—") return valueStr;
  return `${valueStr} ${unitStr}`;
}

export function formatValueWithoutUnit(value) {
  const valueStr = value == null || String(value).trim() === "" ? "—" : String(value);
  const match = valueStr.match(/^([\d.]+)/);
  return match ? match[1] : valueStr;
}

export function getRefDoctorDisplay(order) {
  const doctor = order?.doctor;
  if (!doctor) return "N/A";
  if (typeof doctor === "string") return safeTrim(doctor) || "N/A";
  
  return safeTrim(
    doctor.name || 
    doctor.fullName || 
    doctor.doctorName || 
    doctor.displayName || 
    doctor.title || 
    ""
  ) || "N/A";
}

// For backward compatibility with existing code
export const StringUtils = {
  safeTrim,
  escapeHtml,
  isHtmlPresent,
  chunkArray,
  getFlagKind,
  formatValueWithUnit,
  formatValueWithoutUnit,
  getRefDoctorDisplay,
};