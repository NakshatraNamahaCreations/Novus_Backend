// html-generators/patientHeader.js
import { escapeHtml } from "../utils/stringUtils.js";
import { calculateAge, formatDateTime } from "../utils/dateUtils.js";
import { PatientService } from "../services/patientService.js";

export class PatientHeader {
  static generate(options = {}) {
    const { order, patient, refBy, partner = "-" } = options;

    const reportRefId = PatientService.getReportRefId(order);

    const dates = PatientService.getOrderDates(order);
    const collectedAt = dates.collectedAt;
    const receivedAt = dates.receivedAt;
    const reportedAt = dates.reportedAt;

    const patientAge = patient.dob ? calculateAge(patient.dob) : patient.age || "N/A";
    const gender = patient.gender ? patient.gender.toUpperCase() : "N/A";

    return `
      <div class="ps-wrap ps-pro">
        <!-- LEFT -->
        <div class="ps-col ps-left">
          <div class="ps-name">${escapeHtml(patient.fullName || "N/A")}</div>
          <div class="ps-subline">
            <span>${escapeHtml(String(patientAge))} Year(s)</span>
            <span class="ps-dot">•</span>
            <span>${escapeHtml(gender)}</span>
          </div>

          <div class="ps-kv ps-kv-compact">
            <span class="ps-k">Ref. by</span>
            <span class="ps-v">${escapeHtml(refBy || "N/A")}</span>
          </div>
        </div>

        <!-- MIDDLE -->
        <div class="ps-col ps-mid">
          <div class="ps-kv">
            <span class="ps-k">Report Ref. ID</span>
            <span class="ps-v ps-mono">${escapeHtml(reportRefId || "—")}</span>
          </div>
          <div class="ps-kv">
            <span class="ps-k">Patient ID</span>
            <span class="ps-v ps-mono">${escapeHtml(String(patient?.id ?? "—"))}</span>
          </div>
          <div class="ps-kv">
            <span class="ps-k">Partner</span>
            <span class="ps-v ps-wraptext">${escapeHtml(partner || "—")}</span>
          </div>
        </div>

        <!-- RIGHT -->
        <div class="ps-col ps-right">
          <div class="ps-kv">
            <span class="ps-k">Collected</span>
            <span class="ps-v">${escapeHtml(formatDateTime(collectedAt) || "—")}</span>
          </div>
          <div class="ps-kv">
            <span class="ps-k">Received</span>
            <span class="ps-v">${escapeHtml(formatDateTime(receivedAt) || "—")}</span>
          </div>
          <div class="ps-kv">
            <span class="ps-k">Reported</span>
            <span class="ps-v">${escapeHtml(formatDateTime(reportedAt) || "—")}</span>
          </div>
        </div>
      </div>
    `;
  }
}
