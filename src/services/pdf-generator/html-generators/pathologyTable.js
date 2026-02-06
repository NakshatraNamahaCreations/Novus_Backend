// html-generators/pathologyTable.js
import {
  safeTrim,
  escapeHtml,
  getFlagKind,
  formatValueWithoutUnit,
} from "../utils/stringUtils.js";
import { PatientService } from "../services/patientService.js";

export class PathologyTable {
  /**
   * Generate pathology table using CSS classes (no inline styles)
   * Matches the structure used in radiology content
   */
  static generate(parameterResults, options = {}) {
    const { showTrends = false, trendData = null } = options;

    if (!parameterResults || parameterResults.length === 0) {
      return '<div class="no-data">No parameters to display</div>';
    }

    const rows = parameterResults.map((pr) => this.generateRow(pr, trendData));

    return `
      <table class="pathology-table">
        <thead>
          <tr>
            <th class="col-parameter">PARAMETER / METHOD</th>
            <th class="col-result">RESULT</th>
            <th class="col-range">BIO REF. INTERVAL</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    `;
  }

  /**
   * Generate a single parameter row
   */
  static generateRow(parameterResult, trendData = null) {
    const valueRaw =
      parameterResult.valueNumber ?? parameterResult.valueText ?? "—";
    const unit = parameterResult.unit || parameterResult.parameter?.unit || "";
    const method =
      parameterResult.method || parameterResult.parameter?.method || "";

    // Get reference range using the service method
    const rangeText = PatientService.getReferenceRangeText(parameterResult);
    const rangeCell = this.formatRangeForDisplay(rangeText, unit);

    // Parameter name
    const parameterName = escapeHtml(
      parameterResult.parameter?.name || 
      parameterResult.parameterName || 
      "—"
    );

    return `
      <tr>
        <td class="col-parameter">
          <div class="parameter-name">${parameterName}</div>
          ${method ? `<div class="method">${escapeHtml(method)}</div>` : ''}
        </td>
        <td class="col-result result-cell">
          ${this.renderResultWithColoredArrow(valueRaw, parameterResult.flag)}
        </td>
        <td class="col-range range-cell">
          ${escapeHtml(rangeCell || "—")}
        </td>
      </tr>
    `;
  }

  /**
   * Format reference range for display
   */
  static formatRangeForDisplay(rangeText, unit) {
    const rt = safeTrim(rangeText);
    const u = safeTrim(unit);

    if (!rt) return "—";
    if (!u) return rt;
    
    // Check if unit is already included in range text
    if (rt.toLowerCase().includes(u.toLowerCase())) {
      return rt;
    }

    return `${rt} ${u}`;
  }

  /**
   * Render result value with colored arrow for abnormal values
   */
  static renderResultWithColoredArrow(valueText, flag) {
    const kind = getFlagKind(flag);
    const numericValue = formatValueWithoutUnit(valueText);

    let colorClass = "";
    if (kind === "high") {
      colorClass = "result-high";
    } else if (kind === "low") {
      colorClass = "result-low";
    }

    const arrow = kind === "high" ? "↑" : kind === "low" ? "↓" : "";

    return `
      <span class="result-value ${colorClass}">
        ${escapeHtml(numericValue)}
        ${arrow ? `<span class="arrow">${arrow}</span>` : ""}
      </span>
    `;
  }
}