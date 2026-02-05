import { StringUtils } from "../utils/stringUtils.js";

export class SignatureSection {
  static generate(signatures) {
    const { left, center, right } = signatures || {};

    const slots = [
      { pos: "left", sig: left },
      { pos: "center", sig: center },
      { pos: "right", sig: right },
    ];

    const active = slots.filter(x => x.sig && StringUtils.safeTrim(x.sig.name));
    const cols = Math.max(active.length, 1); // 1,2,3

    // Render only active signatures (so no empty columns)
    const html = active.map(x => this.renderSignatureCell(x.sig, x.pos)).join("");

    return `
      <div class="sig-row cols-${cols}">
        ${html || ""}
      </div>
    `;
  }

  static renderSignatureCell(signature, position) {
    if (!signature) return "";

    const name = StringUtils.safeTrim(signature.name);
    if (!name) return "";

    const designation =
      StringUtils.safeTrim(signature.designation) ||
      StringUtils.safeTrim(signature.qualification) ||
      "";

    const img = signature?.signatureImg
      ? `<img class="sig-img" src="${signature.signatureImg}" alt="signature" />`
      : `<div class="sig-placeholder"></div>`;

    return `
      <div class="sig-cell ${position}">
        <div class="sig-img-wrap">${img}</div>
        <div class="sig-name">${StringUtils.escapeHtml(name)}</div>
        ${designation ? `<div class="sig-desig">${StringUtils.escapeHtml(designation)}</div>` : ``}
      </div>
    `;
  }
}
