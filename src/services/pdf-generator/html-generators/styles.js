// html-generators/styles.js
import { CONFIG } from "../config/constants.js";

export class Styles {
  static generate(options = {}) {
    const {
      headerH = CONFIG.DIMENSIONS.headerHeight,
      footerH = CONFIG.DIMENSIONS.footerHeight,
      sigH = CONFIG.DIMENSIONS.signatureHeight,
      fontPx = CONFIG.FONT_SIZES.base,
      debug = false,
    } = options;

    return `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
      
      @page { 
        size: A4; 
        margin: 0;
      }
      
      :root {
        --header-h: ${headerH}px;
        --footer-h: ${footerH}px;
        --sig-h: ${sigH}px;
        --primary-color: ${CONFIG.COLORS.primary};
        --secondary-color: ${CONFIG.COLORS.secondary};
        --border-color: ${CONFIG.COLORS.border};
        --light-bg: ${CONFIG.COLORS.lightBg};
        --danger-color: ${CONFIG.COLORS.danger};
        --success-color: ${CONFIG.COLORS.success};
        --warning-color: ${CONFIG.COLORS.warning};
      }
      
      ${this.generateBaseStyles(fontPx)}
      ${this.generateHeaderFooterStyles()}
      ${this.generatePageStyles()}
      ${this.generatePatientStripStyles()}
      ${this.generateTableStyles()}
      ${this.generateSignatureStyles()}
      ${this.generateUtilityStyles()}
      ${this.generatePrintStyles()}
      ${debug ? this.generateDebugStyles() : ''}
    `;
  }

  static generateBaseStyles(fontPx) {
    return `
      html, body { 
        margin: 0; 
        padding: 0; 
        width: 100%; 
        height: 100%; 
      }
      
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: ${fontPx}px;
        color: var(--primary-color);
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    `;
  }

  static generateHeaderFooterStyles() {
    return `
      .header, .footer {
        position: fixed;
        left: 0;
        right: 0;
        z-index: 10;
        background: white;
      }
      
      .header { 
        top: 0; 
        height: var(--header-h);
      }
      
      .footer { 
        bottom: 0; 
        height: var(--footer-h);
      }
      
      .header img, .footer img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      
      .header.blank, .footer.blank { 
        background: transparent;
        border: none;
      }
    `;
  }

  static generatePageStyles() {
    return `
      .page {
        position: relative;
        width: 210mm;
        height: 297mm;
        box-sizing: border-box;
        
        /* Space for fixed header */
        padding-top: calc(var(--header-h) + 15px);
        
        /* Space for fixed footer */
        padding-bottom: calc(var(--footer-h) + 10px);
        
        /* Side margins */
        padding-left: 20px;
        padding-right: 20px;
        
        background: white;
        page-break-after: always;
        break-after: page;
      }
      
      .page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    `;
  }

  static generatePatientStripStyles() {
    return `
      .ps-wrap {
        display: flex;
        justify-content: space-between;
        padding: 6px 10px;
        margin: 0 0 8px 0;
        background: #ffffff;
        border: 1px solid #ddd;
        border-radius: 4px;
      }

      .ps-wrap.ps-pro {
        display: flex;
        gap: 10px;
      }

      .ps-col { 
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .ps-left {
        flex: 0 0 28%;
        padding-right: 8px;
        border-right: 1px solid #eee;
      }

      .ps-mid {
        flex: 0 0 38%;
        padding: 0 8px;
        border-right: 1px solid #eee;
      }

      .ps-right {
        flex: 1;
        padding-left: 8px;
      }

      .ps-name {
        font-weight: 700;
        font-size: 14px;
        line-height: 1.2;
        color: #111;
        margin: 0 0 2px 0;
      }

      .ps-subline {
        font-size: 11px;
        color: #555;
        display: flex;
        align-items: center;
        gap: 5px;
        margin: 0;
        line-height: 1.2;
      }

      .ps-dot { 
        color: #999; 
        font-size: 8px; 
      }

      .ps-kv {
        display: flex;
        gap: 6px;
        margin: 0 0 3px 0;
        line-height: 1.2;
        align-items: baseline;
      }

      .ps-kv:last-child {
        margin-bottom: 0;
      }

      .ps-k {
        min-width: 75px;
        font-size: 10px;
        font-weight: 600;
        color: #666;
        white-space: nowrap;
      }

      .ps-v {
        font-size: 11px;
        font-weight: 500;
        color: #111;
        flex: 1;
      }

      .ps-mono {
        font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      }
    `;
  }

  static generateTableStyles() {
    return `
      .test-name {
        margin: 8px 0 10px;
        font-size: 15px;
        font-weight: 700;
        color: var(--primary-color);
        padding-bottom: 6px;
        border-bottom: 2px solid var(--border-color);
        page-break-after: avoid;
        break-after: avoid;
      }
      
      /* Pathology Table */
      table,
      .pathology-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        overflow: hidden;
        margin-bottom: 15px;
        page-break-inside: auto;
        break-inside: auto;
      }
      
      table th,
      .pathology-table th {
        background: var(--light-bg);
        padding: 9px 8px;
        font-weight: 600;
        text-align: left;
        color: var(--primary-color);
        border-bottom: 1px solid var(--border-color);
        font-size: 12px;
      }
      
      table td,
      .pathology-table td {
        padding: 8px;
        border-bottom: 1px solid var(--border-color);
        font-size: 12px;
        vertical-align: middle;
      }
      
      table tr:last-child td,
      .pathology-table tr:last-child td {
        border-bottom: none;
      }
      
      /* Column widths for pathology table */
      .col-parameter,
      th.col-parameter,
      td.col-parameter {
        width: 45%;
      }
      
      .col-result,
      th.col-result,
      td.col-result {
        width: 20%;
      }
      
      .col-range,
      th.col-range,
      td.col-range {
        width: 35%;
      }
      
      /* Parameter name and method */
      .parameter-name {
        font-weight: 600;
        color: var(--primary-color);
        font-size: 12px;
        line-height: 1.3;
        margin-bottom: 2px;
      }
      
      .method {
        color: var(--secondary-color);
        font-size: 10px;
        margin-top: 2px;
        line-height: 1.2;
      }
      
      /* Result cell */
      .result-cell {
        font-weight: 500;
        font-size: 12px;
      }
      
      .result-value {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      
      /* Flag colors */
      .result-high {
        color: var(--danger-color);
        font-weight: 600;
      }
      
      .result-low {
        color: var(--danger-color);
        font-weight: 600;
      }
      
      .arrow {
        font-weight: 800;
        font-size: 12px;
        line-height: 1;
      }
      
      /* Range cell */
      .range-cell {
        color: var(--secondary-color);
        font-size: 10.5px;
        line-height: 1.4;
      }
      
      /* No data message */
      .no-data {
        padding: 20px;
        text-align: center;
        color: var(--secondary-color);
        font-style: italic;
      }
    `;
  }

  static generateSignatureStyles() {
    return `
      .sig-row {
        margin-top: 20px;
        display: grid;
        gap: 30px;
        align-items: end;
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .sig-row.cols-1 { grid-template-columns: 1fr; }
      .sig-row.cols-2 { grid-template-columns: 1fr 1fr; }
      .sig-row.cols-3 { grid-template-columns: 1fr 1fr 1fr; }

      .sig-cell {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        min-height: 100px;
      }

      .sig-cell.left { 
        align-items: flex-start; 
        text-align: left; 
      }
      
      .sig-cell.center { 
        align-items: center; 
        text-align: center; 
      }
      
      .sig-cell.right { 
        align-items: flex-end; 
        text-align: right; 
      }

      /* Signature image wrapper */
      .sig-img-wrap {
        min-height: 60px;
        max-height: 80px; /* ✅ Increased from 70px */
        display: flex;
        align-items: flex-end;
        width: 100%;
        margin-bottom: 8px;
      }

      .sig-cell.left .sig-img-wrap { 
        justify-content: flex-start; 
      }
      
      .sig-cell.center .sig-img-wrap { 
        justify-content: center; 
      }
      
      .sig-cell.right .sig-img-wrap { 
        justify-content: flex-end; 
      }

      /* Signature image - ensure it displays */
      .sig-img {
        max-height: 80px; /* ✅ Increased from 70px */
        max-width: 200px; /* ✅ Increased from 180px */
        width: auto;
        height: auto;
        object-fit: contain;
        display: block; /* ✅ Ensure image displays */
      }

      /* Placeholder when no image */
      .sig-placeholder {
        height: 60px;
        width: 180px;
        background: transparent;
      }

      /* Signature name and designation */
      .sig-name {
        font-weight: 600;
        font-size: 13px; /* ✅ Increased from 12px */
        margin: 6px 0 3px; /* ✅ Increased spacing */
        color: var(--primary-color);
        width: 100%;
      }

      .sig-desig {
        font-size: 11px; /* ✅ Increased from 10px */
        color: var(--secondary-color);
        width: 100%;
      }
    `;
  }

  static generateUtilityStyles() {
    return `
      /* Radiology Content - LARGER FONT SIZE */
      .radiology-wrap {
        margin: 8px 0;
        font-size: 13.5px; /* ✅ INCREASED from 12px to 13.5px */
        line-height: 1.6; /* ✅ INCREASED from 1.5 to 1.6 */
        color: var(--primary-color);
        word-wrap: break-word;
      }

      .radiology-wrap p {
        margin: 5px 0; /* ✅ Increased from 4px */
        line-height: 1.6;
      }

      .radiology-wrap ul,
      .radiology-wrap ol {
        margin: 8px 0 8px 20px; /* ✅ Increased from 6px */
        line-height: 1.6;
      }

      .radiology-wrap li {
        margin: 3px 0; /* ✅ Increased from 2px */
        line-height: 1.6;
      }

      .radiology-wrap img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 10px 0;
      }

      .radiology-wrap strong,
      .radiology-wrap b {
        font-weight: 600;
        color: var(--primary-color);
      }

      /* Quill alignment classes */
      .radiology-wrap .ql-align-center { text-align: center !important; }
      .radiology-wrap .ql-align-right { text-align: right !important; }
      .radiology-wrap .ql-align-justify { text-align: justify !important; }
      .radiology-wrap .ql-align-left { text-align: left !important; }

      /* Conditions */
      .conditions {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--border-color);
        page-break-inside: avoid;
        break-inside: avoid;
      }

      .conditions-title {
        font-weight: 700;
        font-size: 11px;
        text-transform: uppercase;
        margin-bottom: 8px;
        color: var(--primary-color);
      }

      .conditions-list {
        margin: 0;
        padding-left: 18px;
        font-size: 10.5px;
        line-height: 1.5;
      }

      .conditions-list li {
        margin: 4px 0;
        color: #374151;
      }
    `;
  }

  static generatePrintStyles() {
    return `
      @media print {
        .page {
          page-break-after: always;
          break-after: page;
        }
        
        .page:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        .ps-wrap {
          border-color: #bbb;
        }
        
        .test-name {
          page-break-after: avoid;
          break-after: avoid;
        }
        
        table,
        .pathology-table {
          page-break-inside: auto;
          break-inside: auto;
        }
        
        thead {
          display: table-header-group;
        }
        
        tbody tr {
          page-break-inside: auto;
          break-inside: auto;
        }
        
        /* Ensure signature images print */
        .sig-img {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `;
  }

  static generateDebugStyles() {
    return `
      /* ============================================
         DEBUG MODE - Visual Layout Guide
         ============================================ */
      
      /* Header - Red */
      .header {
        background: rgba(255, 0, 0, 0.15) !important;
        border: 3px solid red !important;
        position: relative;
      }
      
      .header::after {
        content: 'HEADER (' var(--header-h) ')';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 0, 0, 0.9);
        color: white;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: bold;
        border-radius: 4px;
        z-index: 999;
      }
      
      /* Footer - Blue */
      .footer {
        background: rgba(0, 0, 255, 0.15) !important;
        border: 3px solid blue !important;
        position: relative;
      }
      
      .footer::after {
        content: 'FOOTER (' var(--footer-h) ')';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 255, 0.9);
        color: white;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: bold;
        border-radius: 4px;
        z-index: 999;
      }
      
      /* Page container - Orange */
      .page {
        background: rgba(255, 165, 0, 0.08) !important;
        border: 3px dashed orange !important;
        position: relative;
      }
      
      .page::before {
        content: 'PAGE CONTENT AREA';
        position: absolute;
        top: 5px;
        right: 5px;
        background: rgba(255, 165, 0, 0.9);
        color: white;
        padding: 4px 8px;
        font-size: 10px;
        font-weight: bold;
        border-radius: 3px;
        z-index: 998;
      }
      
      /* Patient strip - Green */
      .ps-wrap, 
      .ps-wrap.ps-pro {
        background: rgba(0, 255, 0, 0.15) !important;
        border: 2px solid green !important;
      }
      
      .ps-wrap::before {
        content: 'PATIENT STRIP';
        position: absolute;
        top: -20px;
        left: 0;
        background: rgba(0, 128, 0, 0.9);
        color: white;
        padding: 3px 8px;
        font-size: 9px;
        font-weight: bold;
        border-radius: 3px;
      }
      
      /* Test name - Cyan */
      .test-name {
        background: rgba(0, 255, 255, 0.15) !important;
        border: 2px solid cyan !important;
        position: relative;
      }
      
      .test-name::before {
        content: 'TEST NAME';
        position: absolute;
        top: -18px;
        left: 0;
        background: rgba(0, 139, 139, 0.9);
        color: white;
        padding: 2px 6px;
        font-size: 8px;
        font-weight: bold;
        border-radius: 2px;
      }
      
      /* Pathology table - Light Blue */
      table,
      .pathology-table {
        background: rgba(173, 216, 230, 0.15) !important;
        border: 2px solid lightblue !important;
        position: relative;
      }
      
      table::before,
      .pathology-table::before {
        content: 'PATHOLOGY TABLE';
        position: absolute;
        top: -18px;
        left: 0;
        background: rgba(70, 130, 180, 0.9);
        color: white;
        padding: 2px 6px;
        font-size: 8px;
        font-weight: bold;
        border-radius: 2px;
        z-index: 1;
      }
      
      /* Radiology content - Purple */
      .radiology-wrap {
        background: rgba(147, 51, 234, 0.1) !important;
        border: 2px dashed purple !important;
        min-height: 100px;
        padding: 8px;
        position: relative;
      }
      
      .radiology-wrap::before {
        content: 'RADIOLOGY CONTENT';
        position: absolute;
        top: -18px;
        left: 0;
        background: rgba(147, 51, 234, 0.9);
        color: white;
        padding: 2px 6px;
        font-size: 8px;
        font-weight: bold;
        border-radius: 2px;
      }
      
      /* Signature area - Dark Orange */
      .sig-row {
        background: rgba(255, 140, 0, 0.15) !important;
        border: 2px solid darkorange !important;
        padding: 10px;
        position: relative;
      }
      
      .sig-row::before {
        content: 'SIGNATURES';
        position: absolute;
        top: -18px;
        left: 0;
        background: rgba(255, 140, 0, 0.9);
        color: white;
        padding: 2px 6px;
        font-size: 8px;
        font-weight: bold;
        border-radius: 2px;
      }
      
      /* Conditions - Pink */
      .conditions {
        background: rgba(255, 192, 203, 0.2) !important;
        border: 2px solid hotpink !important;
        position: relative;
      }
      
      .conditions::before {
        content: 'CONDITIONS';
        position: absolute;
        top: -18px;
        left: 0;
        background: rgba(255, 105, 180, 0.9);
        color: white;
        padding: 2px 6px;
        font-size: 8px;
        font-weight: bold;
        border-radius: 2px;
      }
      
      /* Padding indicators */
      .page::after {
        content: 'Top: calc(' var(--header-h) ' + 15px) | Bottom: calc(' var(--footer-h) ' + 10px)';
        position: absolute;
        bottom: 5px;
        right: 5px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        font-size: 9px;
        font-weight: bold;
        border-radius: 3px;
        z-index: 998;
      }
    `;
  }
}