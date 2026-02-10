import { safeTrim } from "../../utils/stringUtils.js";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-IN");
}

export function patientStripHtml({ order, patient, derived }) {
  const name = safeTrim(patient?.fullName) || "—";
  const age = patient?.age ?? "—";
  const gender = safeTrim(patient?.gender) || "—";
  const contact = safeTrim(patient?.contactNo) || "—";

  const pid = derived?.patientIdentifier || "—";
  const refId = derived?.reportRefId || "—";
  const doctor = derived?.refDoctorInfo || "—";
  const partner = derived?.partnerInfo || "—";

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

        <div><b>Report Ref:</b> ${esc(refId)}</div>
        <div><b>Referred By:</b> ${esc(doctor)}</div>


        <div><b>Center:</b> ${esc(order?.center?.name || "—")}</div>
    

        <div><b>Collected:</b> ${esc(collectedAt)}</div>
        <div><b>Received:</b> ${esc(receivedAt)}</div>
        <div><b>Reported:</b> ${esc(reportedAt)}</div>
      </div>
      
     
    </div>
  `;
}