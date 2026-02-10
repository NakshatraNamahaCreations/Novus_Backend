export function safeTrim(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}
