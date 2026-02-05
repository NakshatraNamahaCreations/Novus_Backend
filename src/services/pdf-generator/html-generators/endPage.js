import { ConditionsSection } from "./conditionsSection.js";
import { SignatureSection } from "./signatureSection.js";

export class EndPage {
  static generate({ signaturesByTest = [] }) {
    // signaturesByTest: array of { left, center, right }
    // We’ll show the LAST non-empty signature set
    const last = [...signaturesByTest].reverse().find(s => s?.left || s?.center || s?.right) || null;

    const signaturesHtml = last ? SignatureSection.generate(last) : "";

    return `
      <div class="end-page">
        ${signaturesHtml}
        ${ConditionsSection.generate()}
      </div>
    `;
  }
}
