// html-generators/baseHtml.js
import { CONFIG, HTML_CLASSES } from "../config/constants.js";
import { StringUtils } from "../utils/stringUtils.js";
import { PatientHeader } from "./patientHeader.js";
import { SignatureSection } from "./signatureSection.js";

export class BaseHtmlGenerator {
  constructor(options = {}) {
    this.mode = options.mode || "standard";
    this.headerImg = options.headerImg;
    this.footerImg = options.footerImg;
    this.reserveHeaderFooterSpace = options.reserveHeaderFooterSpace !== false;
    this.layout = options.layout;
    this.order = options.order;
    this.patient = options.patient;
  }

  generateDoctype() {
    return `<!doctype html>`;
  }

  generateHead(css) {
    return `
      <head>
        <meta charset="utf-8" />
        <meta name="page-number" content="counter(page) of counter(pages)">
        ${css}
      </head>
    `;
  }

  generateHeaderSection() {
    const headerClass = this.headerImg ? "header" : "header blank";
    return `
      <div class="${headerClass}">
        ${this.headerImg ? `<img src="${this.headerImg}" alt="header" />` : ''}
      </div>
    `;
  }

  generateFooterSection() {
    const footerClass = this.footerImg ? "footer" : "footer blank";
    return `
      <div class="${footerClass}">
        ${this.footerImg ? `<img src="${this.footerImg}" alt="footer" />` : ''}
      </div>
    `;
  }

  generatePageNumber() {
    return `<div class="page-number"></div>`;
  }

  generatePageWrapper(content, signatureRow) {
    return `
      <div class="${HTML_CLASSES.PAGE}">
        <div class="${HTML_CLASSES.PAGE_CONTENT}">
          ${content}
        </div>
        ${signatureRow}
      </div>
    `;
  }

  generateCompleteHtml(pageContents) {
    const css = this.generateCss();
    
    return `
      ${this.generateDoctype()}
      <html>
        ${this.generateHead(css)}
        <body>
          ${this.generateHeaderSection()}
          ${this.generateFooterSection()}
          ${this.generatePageNumber()}
          ${pageContents}
        </body>
      </html>
    `;
  }

  generateCss() {
    const { headerH, footerH, sigH, fontPx } = this.getCssDimensions();
    return this.buildCss({ headerH, footerH, sigH, fontPx });
  }

  getCssDimensions() {
    return {
      headerH: this.reserveHeaderFooterSpace ? CONFIG.DIMENSIONS.headerHeight : this.headerImg ? CONFIG.DIMENSIONS.headerHeight : 0,
      footerH: this.reserveHeaderFooterSpace ? CONFIG.DIMENSIONS.footerHeight : this.footerImg ? CONFIG.DIMENSIONS.footerHeight : 0,
      sigH: CONFIG.DIMENSIONS.signatureHeight,
      fontPx: CONFIG.FONT_SIZES.base
    };
  }

  buildCss({ headerH, footerH, sigH, fontPx }) {
    // CSS will be generated in styles.js
    return `<style>/* CSS will be inserted here */</style>`;
  }
}