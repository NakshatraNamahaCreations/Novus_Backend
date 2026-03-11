import { safeTrim } from "../../utils/stringUtils.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d) {
  try {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day:      "2-digit",
      month:    "2-digit",
      year:     "numeric",
    }).formatToParts(dt);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${get("day")}/${get("month")}/${get("year")}`;
  } catch {
    return "—";
  }
}

function fmtAge(raw) {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (typeof raw === "string" && /[a-zA-Z]/.test(raw)) return raw;
  if (typeof raw === "string" && (raw.includes("T") || /^\d{4}-\d{2}/.test(raw))) {
    try {
      const dob = new Date(raw);
      if (Number.isNaN(dob.getTime())) return String(raw);
      return formatAgeFromYears((Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    } catch { return String(raw); }
  }
  const num = parseFloat(raw);
  if (Number.isNaN(num)) return String(raw);
  return formatAgeFromYears(num);
}

function formatAgeFromYears(y) {
  if (y < 0) return "—";
  const totalDays = Math.floor(y * 365.25);
  const years     = Math.floor(totalDays / 365);
  const months    = Math.floor((totalDays % 365) / 30);
  const days      = (totalDays % 365) % 30;

  if (years === 0 && months === 0) return `${days} Day${days !== 1 ? "s" : ""}`;
  if (years === 0) return days > 0
    ? `${months} Mo${months !== 1 ? "s" : ""} ${days} Day${days !== 1 ? "s" : ""}`
    : `${months} Mo${months !== 1 ? "s" : ""}`;
  if (years < 18) return months > 0
    ? `${years} Yrs ${months} Mo${months !== 1 ? "s" : ""}`
    : `${years} Yrs`;
  return `${years} Years`;
}

function row(label, value) {
  return `
    <div class="ps3-row">
      <span class="ps3-label">${esc(label)}</span>
      <span class="ps3-colon">:</span>
      <span class="ps3-value">${value}</span>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
export function patientStripHtml({ order, patient, derived, qrDataUrl, logoDataUrl }) {
  const name      = safeTrim(patient?.fullName) || "—";
  const age       = fmtAge(patient?.age ?? patient?.dob ?? null);
  const gender    = safeTrim(patient?.gender) || "—";
  const doctor    = derived?.refDoctorInfo || "N/A";
  const partner   = derived?.partnerInfo || order?.partner?.name || order?.center?.code || "-";

  const refId     = String(order?.refId   || order?.id        || "—");
  const patientId = String(patient?.externalId || patient?.id || "—");

  const dates     = derived?.orderDates || {};
  const collected = fmtDate(dates.collectedAt);

  const reported  = fmtDate(dates.reportedAt);

  // "412 / 52"
  const regValue = `<strong>${esc(refId)} / ${esc(patientId)}</strong>`;

  const logoBlock = logoDataUrl
    ? `<div class="ps3-right-logo-wrap">
         <img class="ps3-logo-img" src="${esc(logoDataUrl)}" alt="Lab Stamp" />
       </div>`
    : "";

  const qrBlock = qrDataUrl
    ? `<img class="ps3-qr-img" src="${esc(qrDataUrl)}" alt="Report QR" />`
    : "";

  return `
    <div class="ps3">

      <!-- COL 1 — Patient info -->
      <div class="ps3-col ps3-col-left">
        <div class="ps3-name">${esc(name)}</div>
        <div class="ps3-age-gender">${esc(age)}/${esc(gender)}</div>
        <div class="ps3-spacer"></div>
        ${row("Ref. by", esc(doctor))}
        ${row("Partner", esc(partner))}
      </div>

      <div class="ps3-divider"></div>

      <!-- COL 2 — IDs and dates (short labels) -->
      <div class="ps3-col ps3-col-mid">
        ${row("REG",       regValue)}
        ${row("Collected", esc(collected))}
       
        ${row("Reported",  esc(reported))}
      </div>

      <div class="ps3-divider"></div>

      <!-- COL 3 — Logo + QR -->
      <div class="ps3-col ps3-col-right">
        ${logoBlock}
        ${qrBlock}
      </div>

    </div>
  `;
}