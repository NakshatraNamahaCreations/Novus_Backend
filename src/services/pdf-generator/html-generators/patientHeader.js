// html-generators/patientHeader.js
import { safeTrim, escapeHtml } from "../utils/stringUtils.js";
import { calculateAge, formatDateTime } from "../utils/dateUtils.js";
import { PatientService } from "../services/patientService.js";

export class PatientHeader {
  static generate(options = {}) {
    const {
      order,
      patient,
      refBy,
      partner = "-",
    } = options;

    // Get identifiers using the service methods
    const patientIdentifier = PatientService.getPatientIdentifier(patient, order);
    const reportRefId = PatientService.getReportRefId(order);
    
    // Get date information
    const dates = PatientService.getOrderDates(order);
    const collectedAt = dates.collectedAt;
    const receivedAt = dates.receivedAt;
    const reportedAt = dates.reportedAt;

    // Calculate age from DOB
    const patientAge = patient.dob ? calculateAge(patient.dob) : patient.age || "N/A";
    
    // Format gender properly
    const gender = patient.gender ? patient.gender.toUpperCase() : "N/A";

    return `
      <div class="ps-wrap">
        <!-- COLUMN 1: Patient Info (Less width) -->
        <div class="ps-col ps-left">
          <div class="ps-patient-main">
            <div class="ps-name-large">${escapeHtml(patient.fullName || "N/A")}</div>
            <div class="ps-age-gender-large">
              <span class="ps-age">${escapeHtml(String(patientAge))} Year(s)</span>
              <span class="ps-separator"> | </span>
              <span class="ps-gender">${escapeHtml(gender)}</span>
            </div>
          </div>
          
          <div class="ps-reference-info">
            <div class="ps-kv">
              <span class="ps-k">Ref. by :</span>
              <span class="ps-v">${escapeHtml(refBy)}</span>
            </div>
          </div>
        </div>

        <!-- COLUMN 2: Report IDs & Partner (More width) -->
        <div class="ps-col ps-mid">
          <div class="ps-id-section">
            <div class="ps-row">
              <span class="ps-k">Report Ref. ID :</span>
              <span class="ps-v highlight">${escapeHtml(reportRefId)}</span>
            </div>
            <div class="ps-row">
              <span class="ps-k">Patient ID :</span>
              <span class="ps-v highlight">${escapeHtml(patientIdentifier)}</span>
            </div>
            <div class="ps-row">
              <span class="ps-k">Partner :</span>
              <span class="ps-v">${escapeHtml(partner)}</span>
            </div>
          </div>
        </div>

        <!-- COLUMN 3: Date Details (More width) -->
        <div class="ps-col ps-right">
          <div class="ps-date-section">
            <div class="ps-row">
              <span class="ps-k">Collected :</span>
              <span class="ps-v">${escapeHtml(formatDateTime(collectedAt))}</span>
            </div>
            <div class="ps-row">
              <span class="ps-k">Received :</span>
              <span class="ps-v">${escapeHtml(formatDateTime(receivedAt))}</span>
            </div>
            <div class="ps-row">
              <span class="ps-k">Reported :</span>
              <span class="ps-v ">${escapeHtml(formatDateTime(reportedAt))}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate simplified patient info for header
   */
  static generateSimplePatientInfo(patient, order = null) {
    const patientIdentifier = PatientService.getPatientIdentifier(patient, order);
    const age = patient.dob ? calculateAge(patient.dob) : patient.age || "N/A";
    const gender = patient.gender ? patient.gender.toUpperCase() : "N/A";
    
    return `
      <div class="simple-patient-info">
        <div class="patient-name">${escapeHtml(patient.fullName || "N/A")}</div>
        <div class="patient-details">
          <span class="age">${escapeHtml(String(age))} Y</span>
          <span class="separator"> | </span>
          <span class="gender">${escapeHtml(gender)}</span>
          <span class="separator"> | </span>
          <span class="patient-id">ID: ${escapeHtml(patient?.id)}</span>
        </div>
      </div>
    `;
  }
}