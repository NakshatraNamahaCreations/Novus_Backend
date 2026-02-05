import { StringUtils } from "../utils/stringUtils.js";
import { CONFIG } from "../config/constants.js";

export class RadiologyContent {
static splitIntoPages(reportHtml, maxChars = 1800, minChars = 900) {
  let html = StringUtils.safeTrim(reportHtml);
  if (!html) return [""];

  // 1) ✅ Protect base64 images (avoid splitting inside <img ...>)
  const imgTokens = [];
  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const m = tag.match(/src\s*=\s*["']([^"']+)["']/i);
    const src = m?.[1] || "";
    // if it's a data:image base64 OR even normal images, protect it
    const token = `__IMG_TOKEN_${imgTokens.length}__`;
    imgTokens.push({ token, tag });
    return token;
  });

  // 2) ✅ Remove any stray base64 that is not inside <img>
  html = html.replace(/data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=\s]+/g, (m) =>
    m.length > 200 ? "" : m
  );

  // 3) Normalize only on block boundaries (safe)
  const normalized = html
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "<br/>\n")
    .replace(/<\/p>/gi, "</p>\n")
    .replace(/<\/div>/gi, "</div>\n")
    .replace(/<\/li>/gi, "</li>\n")
    .replace(/<\/tr>/gi, "</tr>\n")
    .replace(/<\/h[1-6]>/gi, (m) => m + "\n");

  const sections = normalized
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const pages = [];
  let currentPage = "";
  let currentLength = 0;

  for (const section of sections) {
    const len = section.length;

    if (len > maxChars) {
      if (currentPage) {
        pages.push(currentPage);
        currentPage = "";
        currentLength = 0;
      }
      const words = section.split(/\s+/);
      let chunk = "";
      for (const w of words) {
        if ((chunk + " " + w).length > maxChars) {
          if (chunk) pages.push(chunk);
          chunk = w;
        } else {
          chunk = chunk ? chunk + " " + w : w;
        }
      }
      if (chunk) pages.push(chunk);
      continue;
    }

    if (currentLength + len + 1 > maxChars && currentPage) {
      pages.push(currentPage);
      currentPage = section;
      currentLength = len;
    } else {
      currentPage = currentPage ? currentPage + "\n" + section : section;
      currentLength += len + 1;
    }
  }

  if (currentPage) pages.push(currentPage);

  const merged = this.mergeShortPages(pages, minChars, maxChars);

  // 4) ✅ Restore <img> tags back
  const restored = merged.map((p) => {
    let out = p;
    for (const { token, tag } of imgTokens) {
      out = out.replaceAll(token, tag);
    }
    return out;
  });

  return restored.length ? restored : [reportHtml];
}


  static mergeShortPages(pages, minChars, maxChars) {
    const merged = [];

    for (let i = 0; i < pages.length; i++) {
      const current = pages[i];
      const next = pages[i + 1];

      if (
        current.length < minChars &&
        next &&
        current.length + next.length < maxChars * 1.3
      ) {
        pages[i + 1] = current + "\n" + next;
        continue;
      }

      merged.push(current);
    }

    // Handle last page if too short
    if (merged.length >= 2) {
      const last = merged[merged.length - 1];
      const secondLast = merged[merged.length - 2];

      if (
        last.length < minChars &&
        secondLast.length + last.length < maxChars * 1.3
      ) {
        merged[merged.length - 2] = secondLast + "\n" + last;
        merged.pop();
      }
    }

    return merged.length ? merged : [html];
  }

  static generateContent(reportHtml) {
    return `
      <div class="radiology-wrap">
        ${reportHtml || ""}
      </div>
    `;
  }
}
