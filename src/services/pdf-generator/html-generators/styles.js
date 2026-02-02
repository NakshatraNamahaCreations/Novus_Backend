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
        padding-bottom: calc(var(--footer-h) + var(--sig-h) + 45px);
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
        background: white;
        overflow: hidden;
      }
      
.page-content {
  max-height: calc(
    var(--page-height) - 
    var(--header-h) - 
    var(--footer-h) - 
    var(--sig-h) - 
    70px /* top/bottom padding */
  );
  overflow-y: auto;
  position: relative;
}
  .page.full-mode .page-content {
  max-height: calc(
    var(--page-height) - 
    var(--header-h) - 
    var(--footer-h) - 
    var(--sig-h) - 
    90px /* extra space for trend box */
  );
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
      .ps-wrap {
        display: flex;
        justify-content: space-between;
        grid-template-columns: 1fr 1.1fr 0.55fr;
        column-gap: 0;
        padding: 12px 14px;
        margin: 0 0 16px 0;
        background: #ffffff;
        border: 1px solid #ebdfdf; /* Changed from blue to black */
        border-radius: 8px;
        box-shadow: 0 1px 2px rgba(46, 45, 45, 0.1);
        position: relative;
        overflow: hidden;
      }
      
      .ps-col {
        padding: 0 14px;
        min-width: 0;
        position: relative;
      }
      
   .ps-left {
  flex: 0 0 25%; /* Fixed width of 25% */
  max-width: 25%;
  padding: 0 15px;
  display: flex;
  flex-direction: column;
}

/* Middle and right columns share the remaining width equally */
.ps-mid, .ps-right {
  flex: 1; /* Equal distribution of remaining space */
  padding: 0 15px;
  display: flex;
  flex-direction: column;
}
  .ps-mid .ps-row {
  margin: 2px 0;
  padding: 2px 0;
  align-items: flex-start;  /* so label stays aligned when partner wraps */
}


/* ✅ Partner can wrap to next line without adding big gap */
.ps-v-partner {
  white-space: normal !important;     /* allow wrap */
  overflow: visible !important;       /* no clipping */
  text-overflow: unset !important;
  line-height: 1.15;                  /* tighter line spacing */
  max-height: 2.3em;                  /* ~2 lines */
  display: -webkit-box;
  -webkit-line-clamp: 2;              /* clamp to 2 lines */
  -webkit-box-orient: vertical;
}

      
      .ps-header {
        margin-bottom: 12px;
        padding-bottom: 8px;
 
      }
      
      .ps-name {
        font-weight: 800;
        font-size: 18px;
        line-height: 1.15;
        margin-bottom: 4px;
        color: var(--primary-color);
      }
        .ps-name-large{
         font-size: 18px;
        }
      
      .ps-age-gender {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
      }
      
      .ps-age {
        color: var(--success-color);
        background: #d1fae5;
        padding: 2px 8px;
        border-radius: 12px;
      }
      
      .ps-gender {
        color: var(--warning-color);
        background: #ede9fe;
        padding: 2px 8px;
        border-radius: 12px;
      }
      
      .ps-separator {
        color: var(--secondary-color);
        font-weight: 300;
      }
      
      .ps-section {
        margin-bottom: 10px;
      }
      
      .ps-section:last-child {
        margin-bottom: 0;
      }
      
       .ps-row {
        display: flex;

        font-size: 12px;
        margin: 5px 0;
        padding: 4px 0;
     
      }

      .ps-kv {
        display: flex;
    
        align-items: center;
        font-size: 12px;
        margin: 5px 0;
        padding: 4px 0;
        
      }
      
      .ps-kv:last-child, .ps-row:last-child {
        border-bottom: none;
      }
      
      .ps-k {
        color: var(--secondary-color);
        font-weight: 600;
        white-space: nowrap;
        min-width: 90px;
      }
      
      .ps-v {
        color: var(--primary-color);
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
  
      }
      
      .ps-v.highlight {
        color: var(--primary-color);
        font-weight: 700;
        background: var(--light-bg);
        padding: 2px 8px;
        border-radius: 4px;
        display: inline-block;
      }
      
      .ps-right-wrap {
        display: flex;
        gap: 15px;
        justify-content: flex-end;
        align-items: flex-start;
        height: 100%;
        padding-top: 8px;
      }
      
      .ps-stamp {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 80px;
      }
      
      .ps-stamp-img {
        width: 65px;
        height: 65px;
        object-fit: contain;
        display: block;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 4px;
        background: white;
      }
      
      .ps-stamp-code {
        margin-top: 6px;
        font-size: 10px;
        font-weight: 700;
        color: var(--primary-color);
        background: var(--light-bg);
        padding: 2px 6px;
        border-radius: 4px;
      }
      
      .ph {
        background: var(--light-bg);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        border-style: dashed;
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
    .sig-row {
      position: absolute;
      left: 20px;
      right: 20px;
      bottom: calc(var(--footer-h) + 25px);
      height: var(--sig-h);
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 15px;
      align-items: flex-end;
      padding-top: 10px;
      background: white;
      z-index: 5;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-before: avoid;
      break-before: avoid;
    }
    
    .sig-cell {
      min-width: 0;
      min-height: 80px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      align-items: center; /* Center horizontally */
      text-align: center; /* Center text alignment */
    }
    
    /* Remove left/right specific classes since all are centered */
    .sig-cell.left, 
    .sig-cell.center, 
    .sig-cell.right { 
      text-align: center;
      align-items: center;
    }
    
    .sig-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      width: 100%;
      height: 100%;
    }
    
    .sig-img-wrap {
      min-height: 50px;
      display: flex;
      align-items: flex-end;
      justify-content: center; /* Center image horizontally */
      margin-bottom: 8px;
      width: 100%;
    }
    
    .sig-placeholder {
      height: 45px;
      width: 160px; /* Fixed width to match max-width of sig-img */
      background: transparent;
    }
    
    .sig-img {
      max-height: 50px;
      max-width: 160px;
      object-fit: contain;
      display: block;
      margin: 0 auto; /* Center the image */
    }
    
    .sig-name {
      font-weight: 700;
      color: var(--primary-color);
      margin-top: 6px;
      font-size: 12px;
      min-height: 18px;
      width: 100%;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .sig-desig {
      color: var(--secondary-color);
      margin-top: 3px;
      font-size: 12px;
      min-height: 16px;
      width: 100%;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    /* For cells with both name and designation */
    .sig-cell.has-desig .sig-name {
      margin-top: 4px;
    }
    
    .sig-cell.has-desig .sig-desig {
      margin-top: 2px;
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
        
        tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        
        thead {
          page-break-after: avoid;
          break-after: avoid;
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
        
        .sig-row {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        
       .page-content{
  position: relative;
  overflow: hidden;
  max-height: calc(var(--page-height) - var(--header-h) - var(--footer-h) - var(--sig-h) - 70px);
}

      }
    `;
  }
}
