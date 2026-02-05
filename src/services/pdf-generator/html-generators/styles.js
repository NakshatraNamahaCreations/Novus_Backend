import { CONFIG } from "../config/constants.js";

export class Styles {
  static generate(options = {}) {
    const {
      headerH = CONFIG.DIMENSIONS.headerHeight,
      footerH = CONFIG.DIMENSIONS.footerHeight,
      sigH = CONFIG.DIMENSIONS.signatureHeight,
      fontPx = CONFIG.FONT_SIZES.base,
    } = options;

    return `
      <style>
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
          --page-height: ${CONFIG.DIMENSIONS.pageHeight};
          --page-width: ${CONFIG.DIMENSIONS.pageWidth};
        }
        
        ${this.generateBaseStyles(fontPx)}
        ${this.generateHeaderFooterStyles()}
        ${this.generatePageStyles()}
        ${this.generatePatientStripStyles()}
        ${this.generateTableStyles()}
        ${this.generateSignatureStyles()}
        ${this.generateUtilityStyles()}
        ${this.generatePrintStyles()}
      </style>
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
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        font-size: ${fontPx}px;
        color: var(--primary-color);
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
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
        object-position: center;
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
      width: var(--page-width);
      height: var(--page-height);
      box-sizing: border-box;

      padding-top: calc(var(--header-h) + 15px);
      padding-left: 20px;
      padding-right: 20px;

  padding-bottom: calc(var(--footer-h) + 5px);


      page-break-after: always;
      break-after: page;
  background: white;
  overflow: hidden;
     
    }
      .sig-break{
  page-break-before: always;
  break-before: page;
  height: 0;
}
.page-break {
  page-break-before: always;
  break-before: page;
}


.page-content{
  /* ✅ Let content flow naturally */
  max-height: none;
  overflow: visible;

  /* Optional: prevent footer overlap by keeping safe space */
  padding-bottom: 10px;
}


    .page-number {
      position: fixed;
      right: 20px;
      bottom: 10px;
      z-index: 11;
      font-size: 10.5px;
      color: var(--secondary-color);
      font-weight: 400;
    }

    .page-number:before {
      content: "Page " counter(page) " / " counter(pages);
    }
  `;
}


static generatePatientStripStyles() {
  return `
 /* Patient Strip - Ultra Compact Professional */
.ps-wrap {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  margin: 0 0 6px 0;
  background: #ffffff;
  border: 1px solid #ddd;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.ps-wrap.ps-pro {
  display: flex;
  gap: 10px;
  padding: 6px 10px;
  margin: 0 0 6px 0;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 4px;
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

/* Name - NO bottom margin */
.ps-name {
  font-weight: 700;
  font-size: 14px;
  line-height: 1;
  color: #111;
  margin: 0;
}

/* Subline - minimal spacing */
.ps-subline {
  font-size: 11px;
  color: #555;
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 2px 0 0 0;
  line-height: 1;
}

.ps-dot { 
  color: #999; 
  font-size: 8px; 
}

/* Key/Value - ZERO vertical gaps */
.ps-kv {
  display: flex;
  gap: 1px;
  margin: 0;
  line-height: 1;
  align-items: baseline;
}

.ps-kv + .ps-kv {
  margin-top: 3px;
}

.ps-kv-compact { 
  margin-top: 4px;
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
  min-width: 0;
}

/* Partner text wrapping - tighter */
.ps-wraptext {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
  word-break: break-word;
  line-height: 1.2;
  max-height: 2.4em;
}

/* Monospace IDs */
.ps-mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  letter-spacing: 0;
}

@media print {
  .ps-wrap, 
  .ps-wrap.ps-pro {
    border-color: #bbb;
  }
}
  `;
}

  static generateTableStyles() {
    return `
      .test-name {
        margin: 12px 0 10px;
        font-size: 15px;
        font-weight: 700;
        color: var(--primary-color);
        padding-bottom: 5px;
       
        page-break-after: avoid;
        break-after: avoid;
      }
      
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        margin-bottom: 15px;
        page-break-inside: auto;
        break-inside: auto;
      }
      
      th {
        background: var(--light-bg);
        padding: 9px 8px;
        font-weight: 600;
        text-align: left;
        color: var(--primary-color);
        border-bottom: 1px solid var(--border-color);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      td {
        padding: 8px;
        border-bottom: 1px solid var(--border-color);
        font-size: 12px;
        vertical-align: middle;
        line-height: 1.4;
      }
      
      tr:last-child td {
        border-bottom: 1px solid var(--border-color);
        page-break-before: avoid;
        break-before: avoid;
      }
      
      tr:hover td {
        background: #f8fafc;
      }
      
      .parameter-name {
        font-weight: 600;
        color: var(--primary-color);
        margin-bottom: 1px;
        line-height: 1.3;
        font-size: 12px;
      }
      
      .method {
        color: var(--secondary-color);
        font-size: 10px;
        font-weight: 400;
        margin-top: 1px;
        line-height: 1.2;
      }
      
      .result-cell {
        font-weight: 500;
        position: relative;
        font-size: 12px;
        line-height: 1.4;
      }
      
      .range-cell {
        color: var(--secondary-color);
        font-size: 10.5px;
        line-height: 1.4;
      }
      
      .result-value {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      
      .result-high {
        color: var(--danger-color);
      }
      
      .result-low {
         color: var(--danger-color);
      }
      
      .arrow {
        font-weight: 800;
        font-size: 12px;
        vertical-align: middle;
        display: inline-block;
        line-height: 1;
      }
      
      .status-badge {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        margin-left: 8px;
      }
      
      .status-normal {
        background: #d1fae5;
        color: #065f46;
      }
      
      .status-high {
        background: #fee2e2;
        color: #991b1b;
      }
      
      .status-low {
        background: #dbeafe;
        color: #1e40af;
      }
      
      .two-col {
        display: grid;
        grid-template-columns: 70% 30%;
        gap: 15px;
        align-items: start;
      }
      
      .col-trend {
        padding: 12px;
        background: var(--light-bg);
        border-radius: 6px;
        border: 1px solid var(--border-color);
      }
      
      .trend-title-right {
        font-weight: 700;
        margin: 0 0 10px;
        color: var(--primary-color);
        font-size: 12px;
        padding-bottom: 5px;
        border-bottom: 1px solid var(--border-color);
      }
      
      .trend-box table {
        font-size: 10.5px;
        background: white;
      }
      
      .trend-box th {
        background: #f1f5f9;
        font-size: 10px;
        padding: 7px 6px;
      }
      
      .trend-box td {
        padding: 6px;
        font-size: 10px;
        line-height: 1.3;
      }
    `;
  }

  static generateSignatureStyles() {
    return `
.sig-row{
  margin-top: 14px;
  display: grid;
  gap: 30px;
  align-items: end;
  page-break-inside: avoid;

    break-inside: avoid;

  break-before: auto;
  page-break-before: auto;
}



/* Dynamic columns */
.sig-row.cols-1{ grid-template-columns: 1fr; }
.sig-row.cols-2{ grid-template-columns: 1fr 1fr; }
.sig-row.cols-3{ grid-template-columns: 1fr 1fr 1fr; }

.sig-cell{
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 110px;
}

/* Alignment per cell */
.sig-cell.left   { align-items: flex-start; text-align: left; }
.sig-cell.center { align-items: center;     text-align: center; }
.sig-cell.right  { align-items: flex-end;   text-align: right; }

.sig-img-wrap{
  min-height: 70px;
  display: flex;
  align-items: flex-end;
  width: 100%;
}

.sig-cell.left .sig-img-wrap   { justify-content: flex-start; }
.sig-cell.center .sig-img-wrap { justify-content: center; }
.sig-cell.right .sig-img-wrap  { justify-content: flex-end; }

.sig-img{
  max-height: 70px;
  max-width: 180px;
  object-fit: contain;
  display: block;
}

.sig-name,
.sig-desig {
  width: 100%;
}

/* Left signature text aligned left */
.sig-cell.left .sig-name,
.sig-cell.left .sig-desig {
  text-align: left;
}

/* Center signature text aligned center */
.sig-cell.center .sig-name,
.sig-cell.center .sig-desig {
  text-align: center;
}

/* Right signature text aligned right */
.sig-cell.right .sig-name,
.sig-cell.right .sig-desig {
  text-align: right;
}

.sig-placeholder{
  height: 70px;
  width: 180px;
}

  `;
  }

  static generateUtilityStyles() {
    return `
    .radiology-wrap {
      margin-top: 12px;
      margin-bottom: 20px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--primary-color);
      overflow-wrap: break-word;
      word-wrap: break-word;
    }

    .radiology-wrap p {
      margin: 5px 0;
      text-align: justify;
      line-height: 1.5;
    }
      .radiology-wrap img {
  max-width: 100%;
  height: auto;
  display: block;
}


    /* ✅ Quill alignment classes (must override default p rule) */
    .radiology-wrap .ql-align-center { text-align: center !important; }
    .radiology-wrap .ql-align-right  { text-align: right !important; }
    .radiology-wrap .ql-align-justify{ text-align: justify !important; }
    .radiology-wrap .ql-align-left   { text-align: left !important; }

    .radiology-wrap strong,
    .radiology-wrap b {
      font-weight: 600;
      color: var(--primary-color);
    }

    .radiology-wrap ul,
    .radiology-wrap ol {
      margin: 5px 0 5px 20px;
    }

    .radiology-wrap li {
      margin: 2px 0;
      line-height: 1.5;
    }
.conditions{
  break-inside: avoid;
  page-break-inside: avoid;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e5e7eb;
}


.conditions-title{
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.conditions-body p{
  margin: 4px 0;
  color: #374151;
}




.conditions-list{
  margin: 0;
  padding-left: 16px;
}

.conditions-list li{
  margin: 3px 0;
  color: #374151;
}
.end-page {
  margin-top: 10px;
}

.conditions {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid #e5e7eb;
  font-size: 10.5px;
  line-height: 1.45;
  page-break-inside: avoid;
  break-inside: avoid;
}

.conditions-title {
  font-weight: 700;
  font-size: 11px;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.conditions-list {
  margin: 0;
  padding-left: 18px;
}

.conditions-list li {
  margin: 4px 0;
  color: #111827;
}

.conditions-list li.sub {
  margin: 3px 0 3px 12px;
  list-style-type: circle;
  color: #374151;
}

  `;
  }

  static generatePrintStyles() {
    return `
      @media print {
        body {
          font-size: 12px;
        }
        
        .patient-strip {
          box-shadow: none;
          border: 1px solid #ccc;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        
        .test-name {
          page-break-after: avoid;
          break-after: avoid;
        }
        
        table {
          page-break-inside: auto;
          break-inside: auto;
        }
        
       /* ✅ Allow body rows to break, but keep headers together */
tbody tr {
  page-break-inside: auto;
  break-inside: auto;
}

/* Keep header from splitting */
thead {
  display: table-header-group;
}
tfoot {
  display: table-footer-group;
}

        tr:hover td {
          background: transparent;
        }
        
        .two-col, 
        .col-main, 
        .col-trend { 
          page-break-inside: avoid;
          break-inside: avoid;
        }
        


      }
    `;
  }
}
