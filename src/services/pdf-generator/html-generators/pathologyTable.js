// html-generators/pathologyTable.js
import { 
  safeTrim, 
  escapeHtml, 
  getFlagKind, 
  formatValueWithoutUnit 
} from "../utils/stringUtils.js";
import { PatientService } from "../services/patientService.js";

export class PathologyTable {
  static generate(parameterResults, options = {}) {
    const { showTrends = false, trendData = null } = options;
    
    const rows = parameterResults.map(pr => this.generateRow(pr, trendData));
    
    return `
      <table>
        <thead>
          <tr>
            <th style="width:45%">PARAMETER / METHOD</th>
            <th style="width:20%">RESULT</th>
            <th style="width:35%">BIO REF. INTERVAL</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    `;
  }

  static generateRow(parameterResult, trendData = null) {
    const valueRaw = parameterResult.valueNumber ?? parameterResult.valueText ?? "—";
    const unit = parameterResult.unit || parameterResult.parameter?.unit || "";
    const method = parameterResult.method || parameterResult.parameter?.method || "";
   
    
    // Use the service method to get reference range
    const rangeText = PatientService.getReferenceRangeText(parameterResult);
    const rangeCell = this.formatRangeForDisplay(rangeText, unit);
    
  


    return `
      <tr>
        <td style="width:45%">
          <div class="parameter-name">
            <strong>${escapeHtml(parameterResult.parameter?.name || "—")}</strong>
           
          </div>
          <div class="method">${escapeHtml(method || "-")}</div>
        </td>
        <td style="width:20%" class="result-cell">
          ${this.renderResultWithColoredArrow(valueRaw, parameterResult.flag)}
        </td>
        <td style="width:35%" class="range-cell">
          ${escapeHtml(rangeCell || "—")}
        </td>
      </tr>
    `;
  }

  static formatRangeForDisplay(rangeText, unit) {
    const rt = safeTrim(rangeText);
    const u = safeTrim(unit);
    
    if (!rt) return "—";
    if (!u) return rt;
    if (rt.toLowerCase().includes(u.toLowerCase())) return rt;
    
    return `${rt} ${u}`;
  }

  static renderResultWithColoredArrow(valueText, flag) {
    const kind = getFlagKind(flag);
    const numericValue = formatValueWithoutUnit(valueText);
    
    let colorClass = "";
    if (kind === "high") colorClass = "result-high";
    else if (kind === "low") colorClass = "result-low";

    const arrow = kind === "high" ? "↑" : kind === "low" ? "↓" : "";

    return `
      <span class="result-value ${colorClass}">
        ${escapeHtml(numericValue)}
        ${arrow ? `<span class="arrow">${arrow}</span>` : ""}
      </span>
    `;
  }
}