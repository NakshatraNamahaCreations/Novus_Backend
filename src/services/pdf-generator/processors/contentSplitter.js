// processors/contentSplitter.js
import { StringUtils } from "../utils/stringUtils.js";

export class ContentSplitter {
  static splitRadiologyHtml(html, maxChars = 1800, minChars = 900) {
    const normalized = html
      .replace(/\r/g, "")
      .replace(/<br\s*\/?>/gi, "<br/>\n")
      .replace(/<\/p>/gi, "</p>\n")
      .replace(/<\/div>/gi, "</div>\n")
      .replace(/<\/li>/gi, "</li>\n")
      .replace(/<\/tr>/gi, "</tr>\n")
      .replace(/<\/h[1-6]>/gi, match => match + "\n")
      .replace(/<strong>/gi, "\n<strong>")
      .replace(/<b>/gi, "\n<b>");

    const sections = normalized
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    const pages = [];
    let currentPage = "";
    let currentLength = 0;

    for (const section of sections) {
      const sectionLength = section.length;

      if (sectionLength > maxChars) {
        if (currentPage) {
          pages.push(currentPage);
          currentPage = "";
          currentLength = 0;
        }

        const words = section.split(/\s+/);
        let chunk = "";

        for (const word of words) {
          if ((chunk + " " + word).length > maxChars) {
            if (chunk) pages.push(chunk);
            chunk = word;
          } else {
            chunk = chunk ? chunk + " " + word : word;
          }
        }
        
        if (chunk) pages.push(chunk);
        continue;
      }

      if (currentLength + sectionLength + 1 > maxChars && currentPage) {
        pages.push(currentPage);
        currentPage = section;
        currentLength = sectionLength;
      } else {
        currentPage = currentPage ? currentPage + "\n" + section : section;
        currentLength += sectionLength + 1;
      }
    }

    if (currentPage) pages.push(currentPage);

    return this.mergeShortPages(pages, minChars, maxChars);
  }

  static mergeShortPages(pages, minChars, maxChars) {
    const merged = [];
    
    for (let i = 0; i < pages.length; i++) {
      const current = pages[i];
      const next = pages[i + 1];

      if (current.length < minChars && next && current.length + next.length < maxChars * 1.3) {
        pages[i + 1] = current + "\n" + next;
        continue;
      }

      merged.push(current);
    }

    if (merged.length >= 2) {
      const last = merged[merged.length - 1];
      const secondLast = merged[merged.length - 2];

      if (last.length < minChars && secondLast.length + last.length < maxChars * 1.3) {
        merged[merged.length - 2] = secondLast + "\n" + last;
        merged.pop();
      }
    }

    return merged.length ? merged : pages;
  }
}