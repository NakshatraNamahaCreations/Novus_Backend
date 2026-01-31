// processors/pageProcessor.js
import { safeTrim, isHtmlPresent, chunkArray, escapeHtml } from "../utils/stringUtils.js";
import { CONFIG } from "../config/constants.js";
import { RadiologyContent } from "../html-generators/radiologyContent.js";

export class PageProcessor {
  static processResults(results, mode = "standard") {
    const pages = [];
    const isFull = mode === "full";
    
    for (const result of results) {
      const testId = result.testId ?? result.test?.id;
      const testName = safeTrim(result.test?.name) || "Test";

      // Handle radiology reports
      if (isHtmlPresent(result.reportHtml)) {
        const parts = RadiologyContent.splitIntoPages(
          result.reportHtml, 
          CONFIG.LIMITS.radiologyMaxChars, 
          CONFIG.LIMITS.radiologyMinChars
        );
        
        parts.forEach((part, index) => {
          pages.push({
            result,
            isRadiology: true,
            reportChunk: part,
            chunkIndex: index,
            chunkCount: parts.length,
            testName,
            testId,
          });
        });
        continue;
      }

      // Handle pathology tests
      const parameterResults = result.parameterResults || [];
      
      if (!parameterResults.length) {
        pages.push({
          result,
          isRadiology: false,
          chunk: [],
          chunkIndex: 0,
          chunkCount: 1,
          testName,
          testId,
        });
        continue;
      }

      const perPage = isFull ? CONFIG.LIMITS.rowsPerPageFull : CONFIG.LIMITS.rowsPerPageStandard;
      const chunks = chunkArray(parameterResults, perPage);
      const chunkCount = chunks.length;

      chunks.forEach((chunk, index) => {
        pages.push({
          result,
          isRadiology: false,
          chunk,
          chunkIndex: index,
          chunkCount,
          testName,
          testId,
        });
      });
    }

    return pages;
  }

  static generateTestTitle(testName, chunkIndex, chunkCount) {
    if (chunkCount > 1) {
      return `${escapeHtml(testName)} (Part ${chunkIndex + 1}/${chunkCount})`;
    }
    return `${escapeHtml(testName)}`;
  }
}