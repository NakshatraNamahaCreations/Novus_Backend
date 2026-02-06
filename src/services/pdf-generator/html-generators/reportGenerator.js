// html-generators/reportGenerator.js

import { RadiologyContent } from './radiologyContent.js';
import { Styles } from '../styles/styles.js';
import { CONFIG } from '../config/constants.js';

export class ReportGenerator {
  
  // ✅ ADD THIS METHOD
  generateRadiologyPage(pageData) {
    const { reportChunk, isLastRadiologyChunk, testName, chunkIndex, chunkCount } = pageData;
    
    return `
      <div class="page">
        ${this.generatePatientStrip(pageData)}
        ${this.generateTestTitle(testName, chunkIndex, chunkCount)}
        
        <div class="radiology-wrap">
          ${reportChunk}
        </div>
        
        ${isLastRadiologyChunk ? `
          <div class="sig-row cols-3">
            ${this.generateSignatures(pageData.signatures)}
          </div>
          
          <div class="conditions">
            ${this.generateConditions()}
          </div>
        ` : '<!-- NO SIGNATURES ON CONTINUATION PAGE -->'}
      </div>
    `;
  }

  // Your existing methods:
  generatePatientStrip(pageData) {
    const { result } = pageData;
    const patient = result.patient || {};
    
    return `
      <div class="ps-wrap ps-pro">
        <div class="ps-col ps-left">
          <div class="ps-name">${patient.name || 'N/A'}</div>
          <div class="ps-subline">
            <span>${patient.age || 'N/A'}</span>
            <span class="ps-dot">•</span>
            <span>${patient.gender || 'N/A'}</span>
          </div>
        </div>
        <div class="ps-col ps-mid">
          <div class="ps-kv">
            <span class="ps-k">Report ID:</span>
            <span class="ps-v ps-mono">${result.reportId || 'N/A'}</span>
          </div>
          <div class="ps-kv ps-kv-compact">
            <span class="ps-k">Sample ID:</span>
            <span class="ps-v ps-mono">${result.sampleId || 'N/A'}</span>
          </div>
        </div>
        <div class="ps-col ps-right">
          <div class="ps-kv">
            <span class="ps-k">Collected:</span>
            <span class="ps-v">${result.collectedDate || 'N/A'}</span>
          </div>
          <div class="ps-kv ps-kv-compact">
            <span class="ps-k">Reported:</span>
            <span class="ps-v">${result.reportedDate || 'N/A'}</span>
          </div>
        </div>
      </div>
    `;
  }

  generateTestTitle(testName, chunkIndex, chunkCount) {
    if (chunkCount > 1) {
      return `<div class="test-name">${testName} (Part ${chunkIndex + 1}/${chunkCount})</div>`;
    }
    return `<div class="test-name">${testName}</div>`;
  }

  generateSignatures(signatures = []) {
    if (!signatures || signatures.length === 0) {
      return '';
    }

    const cols = signatures.length;
    const cells = signatures.map(sig => `
      <div class="sig-cell ${sig.align || 'center'}">
        ${sig.imageUrl ? `
          <div class="sig-img-wrap">
            <img src="${sig.imageUrl}" alt="Signature" class="sig-img" />
          </div>
        ` : '<div class="sig-placeholder"></div>'}
        <div class="sig-name">${sig.name || ''}</div>
        <div class="sig-desig">${sig.designation || ''}</div>
      </div>
    `).join('');

    return `<div class="sig-row cols-${cols}">${cells}</div>`;
  }

  generateConditions() {
    return `
      <div class="conditions-title">CONDITIONS OF LABORATORY TESTING & REPORTING</div>
      <ul class="conditions-list">
        <li>All reports are subject to the terms and conditions specified by Novus Health Labs.</li>
        <li>This is a computer-generated report and does not require a physical signature.</li>
        <li>Results are valid for diagnostic purposes only.</li>
      </ul>
    `;
  }

  // Main method to generate the full HTML document
  generateFullReport(pagesData, options = {}) {
    const styles = Styles.generate({
      headerH: CONFIG.DIMENSIONS.headerHeight,
      footerH: CONFIG.DIMENSIONS.footerHeight,
      sigH: CONFIG.DIMENSIONS.signatureHeight,
      fontPx: CONFIG.FONT_SIZES.base,
      debug: false, // ✅ Enable debug colors
    });

    const pagesHtml = pagesData.map(pageData => {
      if (pageData.isRadiology) {
        return this.generateRadiologyPage(pageData);
      } else {
        return this.generatePathologyPage(pageData);
      }
    }).join('\n');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Medical Report</title>
        <style>${styles}</style>
      </head>
      <body>
        ${pagesHtml}
      </body>
      </html>
    `;
  }
}