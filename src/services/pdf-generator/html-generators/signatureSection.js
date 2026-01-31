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
    const name = signature ? StringUtils.safeTrim(signature.name) : "";
    const designation = signature 
      ? StringUtils.safeTrim(signature.designation) || StringUtils.safeTrim(signature.qualification)
      : "";
    
    const img = signature?.signatureImg
      ? `<img class="sig-img" src="${signature.signatureImg}" alt="signature" />`
      : "";

    return `
      <div class="sig-cell ${position}">
        <div class="sig-img-wrap">${img || '<div class="sig-placeholder"></div>'}</div>
        <div class="sig-name">${StringUtils.escapeHtml(name || "")}</div>
        <div class="sig-desig">${StringUtils.escapeHtml(designation || "")}</div>
      </div>
    `;
  }
}