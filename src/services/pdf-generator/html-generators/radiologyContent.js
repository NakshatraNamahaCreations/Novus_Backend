// html-generators/radiologyContent.js
import { StringUtils } from "../utils/stringUtils.js";

export class RadiologyContent {
  /**
   * Split HTML content into A4-sized pages with accurate height calculation
   * Uses a simpler, more predictable approach
   */
  static splitIntoPages(reportHtml, options = {}) {
    const {
      pageHeight = 1123,           // A4 height in pixels at 96dpi
      headerHeight = 110,
      footerHeight = 65,
      signatureHeight = 100,
      patientStripHeight = 60,
      testNameHeight = 30,
      topMargin = 15,
      bottomMargin = 10,
    } = options;

    let html = StringUtils.safeTrim(reportHtml);
    if (!html) return [""];

    // Calculate available heights
    const commonOverhead = headerHeight + footerHeight + patientStripHeight + 
                          testNameHeight + topMargin + bottomMargin;
    
    // First page - full content area available
    const firstPageAvailable = pageHeight - commonOverhead;
    
    // Middle pages - same as first (patient strip on every page)
    const middlePageAvailable = pageHeight - commonOverhead;
    
    // Last page - reserve space for signatures + conditions
    const lastPageAvailable = pageHeight - commonOverhead - signatureHeight - 100;

    console.log('Page heights:', {
      firstPageAvailable,
      middlePageAvailable,
      lastPageAvailable,
      pageHeight,
      commonOverhead
    });

    // Protect images from splitting
    const imgTokens = [];
    html = html.replace(/<img\b[^>]*>/gi, (tag) => {
      const token = `__IMG_TOKEN_${imgTokens.length}__`;
      imgTokens.push({ token, tag });
      return token;
    });

    // Clean up stray base64 data
    html = html.replace(
      /data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=\s]{200,}/g,
      ""
    );

    // Extract blocks
    const blocks = this.extractBlocks(html);
    console.log(`Extracted ${blocks.length} content blocks`);

    // Distribute blocks with better logic
    const pages = this.distributeBlocksSimple(blocks, {
      firstPageHeight: firstPageAvailable,
      middlePageHeight: middlePageAvailable,
      lastPageHeight: lastPageAvailable,
    });

    console.log(`Split into ${pages.length} pages`);

    // Restore images
    const restored = pages.map((pageContent) => {
      let content = pageContent;
      for (const { token, tag } of imgTokens) {
        content = content.replaceAll(token, tag);
      }
      return content;
    });

    return restored.length ? restored : [reportHtml];
  }

  /**
   * Extract block-level elements
   */
  static extractBlocks(html) {
    const normalized = html
      .replace(/\r/g, "")
      .replace(/<br\s*\/?>/gi, "<br/>")
      .replace(/>\s+</g, "><");

    const blockTags = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'pre'];
    const blockPattern = new RegExp(`<\\/(${blockTags.join('|')})>`, 'gi');
    
    const blocks = [];
    let lastIndex = 0;
    let match;

    while ((match = blockPattern.exec(normalized)) !== null) {
      const endIndex = match.index + match[0].length;
      const block = normalized.substring(lastIndex, endIndex).trim();
      if (block) {
        blocks.push(block);
      }
      lastIndex = endIndex;
    }

    const remaining = normalized.substring(lastIndex).trim();
    if (remaining) {
      blocks.push(remaining);
    }

    return blocks.length ? blocks : [html];
  }

  /**
   * Simplified distribution - more conservative and predictable
   */
  static distributeBlocksSimple(blocks, options) {
    const { firstPageHeight, middlePageHeight, lastPageHeight } = options;
    
    const pages = [];
    let currentPage = [];
    let currentHeight = 0;
    let pageIndex = 0;

    // Conservative line height estimate (increased for larger font)
    const LINE_HEIGHT = 22; // ✅ Increased from 20
    const CHARS_PER_LINE = 90; // ✅ Adjusted for larger font

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const blockHeight = this.estimateBlockHeightSimple(block, LINE_HEIGHT, CHARS_PER_LINE);
      
      // Determine available space
      let availableHeight;
      if (pageIndex === 0) {
        availableHeight = firstPageHeight;
      } else {
        // Check if this might be the last page
        const remainingBlocks = blocks.slice(i);
        const estimatedRemaining = remainingBlocks.reduce(
          (sum, b) => sum + this.estimateBlockHeightSimple(b, LINE_HEIGHT, CHARS_PER_LINE), 
          0
        );
        
        availableHeight = estimatedRemaining < lastPageHeight ? lastPageHeight : middlePageHeight;
      }

      // Force oversized blocks onto their own page
      if (blockHeight > middlePageHeight * 1.2) {
        if (currentPage.length > 0) {
          pages.push(currentPage.join("\n"));
          currentPage = [];
          currentHeight = 0;
          pageIndex++;
        }
        pages.push(block);
        pageIndex++;
        continue;
      }

      // Check if we need a new page
      if (currentHeight + blockHeight > availableHeight && currentPage.length > 0) {
        pages.push(currentPage.join("\n"));
        currentPage = [block];
        currentHeight = blockHeight;
        pageIndex++;
      } else {
        currentPage.push(block);
        currentHeight += blockHeight;
      }
    }

    // Add final page
    if (currentPage.length > 0) {
      pages.push(currentPage.join("\n"));
    }

    return pages.length ? pages : [""];
  }

  /**
   * Simple, conservative height estimation
   */
  static estimateBlockHeightSimple(block, lineHeight, charsPerLine) {
    // Special cases
    if (block.includes("<img")) return 200;
    
    if (block.includes("<table")) {
      const rows = (block.match(/<tr/g) || []).length;
      return Math.max(rows * 35, 100);
    }
    
    if (block.match(/<h[1-6]/)) {
      return lineHeight * 2;
    }
    
    if (block.includes("<ul") || block.includes("<ol")) {
      const items = (block.match(/<li/g) || []).length;
      return items * lineHeight * 1.5;
    }

    // Default: estimate from text content
    const textContent = block.replace(/<[^>]+>/g, " ").trim();
    const charCount = textContent.length;
    const estimatedLines = Math.ceil(charCount / charsPerLine);
    
    return Math.max(estimatedLines * lineHeight, lineHeight);
  }

  /**
   * Generate radiology content wrapper
   */
  static generateContent(reportHtml) {
    return `
      <div class="radiology-wrap">
        ${reportHtml || ""}
      </div>
    `;
  }
}