// processors/pageProcessor.js
import { safeTrim, isHtmlPresent, chunkArray, escapeHtml } from "../utils/stringUtils.js";
import { CONFIG } from "../config/constants.js";
import { RadiologyContent } from "../html-generators/radiologyContent.js";

export class PageProcessor {
  /**
   * Process test results into page chunks
   * ✅ Each radiology report is split into multiple pages
   * ✅ Each page knows if it's the last chunk of that test
   */
  static processResults(results, mode = "standard") {
    const pages = [];
    const isFull = mode === "full";
    
    for (const result of results) {
      const testId = result.testId ?? result.test?.id;
      const testName = safeTrim(result.test?.name) || "Test";

      // ✅ Handle radiology reports
      if (isHtmlPresent(result.reportHtml)) {
        // Split content into pages
        const parts = RadiologyContent.splitIntoPages(result.reportHtml, {
          pageHeight: 1123, // A4 at 96 DPI = 297mm = 1123px
          headerHeight: CONFIG.DIMENSIONS.headerHeight,
          footerHeight: CONFIG.DIMENSIONS.footerHeight,
          signatureHeight: CONFIG.DIMENSIONS.signatureHeight,
          patientStripHeight: 60,
          topMargin: 15,
          bottomMargin: 10,
          averageLineHeight: 18,
        });
        
        console.log(`Radiology test "${testName}" split into ${parts.length} pages`);
        
        // ✅ Create a page object for each chunk
        parts.forEach((part, index) => {
          const isLastChunk = index === parts.length - 1;
          
          pages.push({
            result,                      // Full result object (includes signatures)
            isRadiology: true,           // Flag: this is radiology content
            reportChunk: part,           // The HTML content for THIS page
            chunkIndex: index,           // Current page index (0, 1, 2...)
            chunkCount: parts.length,    // Total pages for this test
            testName,                    // Test name
            testId,                      // Test ID
            isLastRadiologyChunk: isLastChunk, // ✅ TRUE only on last page
          });
        });
        continue;
      }

      // ✅ Handle pathology tests
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

    console.log(`Total pages created: ${pages.length}`);
    return pages;
  }

  /**
   * Generate test title with part indicator for multi-page tests
   */
  static generateTestTitle(testName, chunkIndex, chunkCount) {
    if (chunkCount > 1) {
      return `${escapeHtml(testName)} (Part ${chunkIndex + 1}/${chunkCount})`;
    }
    return `${escapeHtml(testName)}`;
  }
}