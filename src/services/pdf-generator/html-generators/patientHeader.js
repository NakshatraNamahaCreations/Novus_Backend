// html-generators/patientHeader.js - SIMPLIFIED
import { escapeHtml } from "../utils/stringUtils.js";
import { calculateAge, formatDateTime } from "../utils/dateUtils.js";
import { PatientService } from "../services/patientService.js";

export class PatientHeader {
  static generate(options = {}) {
    const { order, patient, refBy, partner = "-" } = options;

    const reportRefId = PatientService.getReportRefId(order);
    const dates = PatientService.getOrderDates(order);
    
    const patientAge = patient.dob ? calculateAge(patient.dob) : patient.age || "N/A";
    const gender = patient.gender ? patient.gender.toUpperCase() : "N/A";

    return `
      <div class="ps-wrap">
        <div class="ps-col ps-left">
          <div class="ps-name">${escapeHtml(patient.fullName || patient.name || "N/A")}</div>
          <div class="ps-subline">
            <span>${escapeHtml(String(patientAge))} Year(s)</span>
            <span class="ps-dot">•</span>
            <span>${escapeHtml(gender)}</span>
          </div>
          <div class="ps-kv">
            <span class="ps-k">Ref. by</span>
            <span class="ps-v">${escapeHtml(refBy || "N/A")}</span>
          </div>
        </div>

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
            <span class="ps-v">${escapeHtml(partner || "—")}</span>
          </div>
        </div>

        <div class="ps-col ps-right">
          <div class="ps-kv">
            <span class="ps-k">Collected</span>
            <span class="ps-v">${escapeHtml(formatDateTime(dates.collectedAt) || "—")}</span>
          </div>
          <div class="ps-kv">
            <span class="ps-k">Received</span>
            <span class="ps-v">${escapeHtml(formatDateTime(dates.receivedAt) || "—")}</span>
          </div>
          <div class="ps-kv">
            <span class="ps-k">Reported</span>
            <span class="ps-v">${escapeHtml(formatDateTime(dates.reportedAt) || "—")}</span>
          </div>
        </div>
      </div>
    `;
  }
}