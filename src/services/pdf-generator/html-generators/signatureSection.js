// html-generators/signatureSection.js
import { StringUtils } from "../utils/stringUtils.js";

export class SignatureSection {
  static generate(signatures) {
    const { left, center, right } = signatures || {};
    
    return `
      <div class="sig-row">
        ${this.renderSignatureCell(left, "left")}
        ${this.renderSignatureCell(center, "center")}
        ${this.renderSignatureCell(right, "right")}
      </div>
    `;
  }

  static renderSignatureCell(signature, position) {
    // Always return a cell with center-aligned content
    const cellClass = `sig-cell center`; // Force center alignment for all cells
    
    if (!signature) {
      return `<div class="${cellClass}"></div>`;
    }
    
    const name = StringUtils.safeTrim(signature.name);
    const designation = StringUtils.safeTrim(signature.designation) || 
                       StringUtils.safeTrim(signature.qualification);
    
    // If no name, return empty cell
    if (!name) {
      return `<div class="${cellClass}"></div>`;
    }
    
    const img = signature?.signatureImg
      ? `<img class="sig-img" src="${signature.signatureImg}" alt="signature" />`
      : '<div class="sig-placeholder"></div>';

    // Build content
    let content = `
      <div class="sig-img-wrap">${img}</div>
    `;
    
    // Add name
    content += `<div class="sig-name">${StringUtils.escapeHtml(name)}</div>`;
    
    // Add designation if exists
    if (designation) {
      content += `<div class="sig-desig">${StringUtils.escapeHtml(designation)}</div>`;
    }
    
    return `
      <div class="${cellClass}">
        <div class="sig-content">
          ${content}
        </div>
      </div>
    `;
  }
}