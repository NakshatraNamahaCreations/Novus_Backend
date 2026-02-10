function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sigCard(sig) {
  // If no signature, return empty block (keeps layout)
  if (!sig) {
    return `<div class="sig-card"></div>`;
  }

  return `
    <div class="sig-card">
      ${
        sig.signatureImg
          ? `<img class="sig-img" src="${sig.signatureImg}" alt="signature" />`
          : ``
      }
      <div class="sig-name">${esc(sig.name || "")}</div>
      <div class="sig-sub">${esc(sig.qualification || "")}${sig.qualification && sig.designation ? ", " : ""}${esc(sig.designation || "")}</div>
    </div>
  `;
}

export function signaturesHtml({ signatures }) {
  return `
    <div class="sig-wrap keep-together">
      ${sigCard(signatures?.left)}
      ${sigCard(signatures?.center)}
      ${sigCard(signatures?.right)}
    </div>
  `;
}
