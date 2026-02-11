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
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,          // ✅ 12-hour format
    }).formatToParts(dt);

    const get = (type) => parts.find((p) => p.type === type)?.value || "";

    // hour might come as "03", day/month already "11" etc.
    const dateStr = `${get("day")}/${get("month")}/${get("year")}`;

    // Some locales return dayPeriod as "pm"/"am" → make it "PM"/"AM"
    const ampm = (get("dayPeriod") || "").toUpperCase();

    return `${dateStr} ${get("hour")}:${get("minute")} ${ampm}`;
  } catch (e) {
    return "—";
  }
}


export function patientStripHtml({ order, patient, derived }) {

  const name = safeTrim(patient?.fullName) || "—";
  const age = patient?.age ?? "—";
  const gender = safeTrim(patient?.gender) || "—";


  const pid = patient?.id || "—";
  const refId = order?.id || "—";
  const doctor = derived?.refDoctorInfo || "—";


  const dates = derived?.orderDates || {};

 
  const collectedAt = fmtDate(dates.collectedAt);
  const receivedAt = fmtDate(dates.receivedAt);
  const reportedAt = fmtDate(dates.reportedAt);


  return `
    <div class="patient-strip">
      <div class="ps-title">Patient Details</div>

      <div class="ps-grid">
        <div><b>Name:</b> ${esc(name)}</div>
        <div><b>Age/Gender:</b> ${esc(age)} / ${esc(gender)}</div>
        <div><b>Patient ID:</b> ${esc(pid)}</div>

        <div><b>Report Ref:</b>ORD-${esc(refId)}</div>
        <div><b>Referred By:</b> ${esc(doctor)}</div>
        <div><b>Center:</b> ${esc(order?.center?.name || "—")}</div>

        <div><b>Collected:</b> ${esc(collectedAt)}</div>
        <div><b>Received:</b> ${esc(receivedAt)}</div>
        <div><b>Reported:</b> ${esc(reportedAt)}</div>
      </div>
    </div>
  `;
}