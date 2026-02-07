// html-generators/styles.js - SIMPLIFIED FOR YOUR LAYOUT
import { CONFIG } from "../config/constants.js";

export class Styles {
  static generate(options = {}) {
    const {
      headerH = 100,    // Top blank space
      footerH = 50,     // Bottom blank space
      fontPx = 12,
    } = options;

    return `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      
      @page {
        size: A4;
        margin: 0;
      }
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      html, body {
        width: 100%;
        min-height: 100%;
        font-family: 'Inter', sans-serif;
        font-size: ${fontPx}px;
        line-height: 1.5;
        color: #000;
        background: white;
      }
      
      /* MAIN PAGE CONTAINER */
      .page-container {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        background: white;
        position: relative;
      }
      
      /* TOP BLANK SPACE (Header Area) */
      .header-space {
        height: ${headerH}px;
        width: 100%;
        background: transparent;
      }
      
      /* PATIENT DETAILS SECTION */
      .patient-section {
        width: 100%;
        padding: 15px 20px;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        margin-bottom: 20px;
      }
      
      .patient-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      
      .patient-col {
        flex: 1;
        padding: 0 10px;
      }
      
      .patient-col:not(:last-child) {
        border-right: 1px solid #ced4da;
      }
      
      .patient-name {
        font-size: 16px;
        font-weight: 700;
        color: #212529;
        margin-bottom: 5px;
      }
      
      .patient-meta {
        font-size: 12px;
        color: #6c757d;
        display: flex;
        gap: 10px;
        align-items: center;
        margin-bottom: 10px;
      }
      
      .patient-detail {
        font-size: 11px;
        margin-bottom: 4px;
        display: flex;
      }
      
      .patient-label {
        min-width: 80px;
        font-weight: 600;
        color: #495057;
      }
      
      .patient-value {
        color: #212529;
        flex: 1;
      }
      
      /* CONTENT AREA */
      .content-area {
        width: 100%;
        padding: 0 20px;
        min-height: calc(297mm - ${headerH}px - ${footerH}px - 150px);
      }
      
      /* TEST TITLE */
      .test-title {
        font-size: 18px;
        font-weight: 700;
        color: #212529;
        margin: 0 0 15px 0;
        padding-bottom: 8px;
        border-bottom: 2px solid #dee2e6;
      }
      
      /* RADIOLOGY CONTENT */
      .radiology-content {
        font-size: 14px;
        line-height: 1.6;
      }
      
      .radiology-content p {
        margin-bottom: 10px;
      }
      
      /* PATHOLOGY TABLE */
      .pathology-table {
        width: 100%;
        border-collapse: collapse;
        margin: 15px 0;
      }
      
      .pathology-table th {
        background: #f8f9fa;
        padding: 8px 10px;
        text-align: left;
        font-weight: 600;
        font-size: 11px;
        border: 1px solid #dee2e6;
      }
      
      .pathology-table td {
        padding: 8px 10px;
        font-size: 12px;
        border: 1px solid #dee2e6;
      }
      
      /* SIGNATURES */
      .signature-section {
        margin: 30px 0;
        padding-top: 20px;
        border-top: 1px solid #dee2e6;
      }
      
      .signature-row {
        display: flex;
        justify-content: space-between;
      }
      
      .signature-col {
        flex: 1;
        text-align: center;
        min-height: 100px;
        padding: 0 10px;
      }
      
      .signature-image {
        height: 60px;
        margin-bottom: 8px;
      }
      
      .signature-name {
        font-weight: 600;
        font-size: 12px;
        margin-bottom: 3px;
      }
      
      .signature-title {
        font-size: 10px;
        color: #6c757d;
      }
      
      /* CONDITIONS */
      .conditions-section {
        margin-top: 20px;
        padding-top: 15px;
        border-top: 1px solid #dee2e6;
      }
      
      .conditions-title {
        font-weight: 700;
        font-size: 11px;
        text-transform: uppercase;
        margin-bottom: 8px;
        color: #212529;
      }
      
      .conditions-list {
        font-size: 10px;
        line-height: 1.4;
        color: #495057;
        padding-left: 15px;
      }
      
      .conditions-list li {
        margin-bottom: 4px;
      }
      
      /* BOTTOM BLANK SPACE (Footer Area) */
      .footer-space {
        height: ${footerH}px;
        width: 100%;
        background: transparent;
      }
      
      /* PRINT STYLES */
      @media print {
        .page-container {
          width: 210mm;
          height: 297mm;
          page-break-after: always;
        }
        
        .header-space {
          height: ${headerH}px;
        }
        
        .footer-space {
          height: ${footerH}px;
        }
      }
    `;
  }
}