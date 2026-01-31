// config/constants.js
export const CONFIG = {
  FONT_SIZES: {
    base: 11.5,
    title: 20,
    patientName: 18,
    small: 10,
    medium: 12,
    large: 13
  },
  
  DIMENSIONS: {
    pageWidth: '210mm',
    pageHeight: '297mm',
    headerHeight: 120,
    footerHeight: 75,
    signatureHeight: 120,
    patientStripHeight: 180
  },
  
  COLORS: {
    primary: '#000000',
    secondary: '#6b7280',
    border: '#e5e7eb',
    lightBg: '#f9fafb',
    danger: '#dc2626',
    success: '#059669',
    warning: '#d97706'
  },
  
  LIMITS: {
    radiologyMaxChars: 1800,
    radiologyMinChars: 900,
    rowsPerPageFull: 7,
    rowsPerPageStandard: 12
  },
  
  PATHS: {
    tmpDirPrefix: 'pdf-'
  }
};

export const PDF_SETTINGS = {
  COMPRESSION_PRESET: '/ebook',
  COMPATIBILITY_LEVEL: '1.4',
  IMAGE_RESOLUTION: 150,
  IMAGE_DOWNSAMPLE_TYPE: '/Bicubic'
};

export const HTML_CLASSES = {
  PAGE: 'page',
  PAGE_CONTENT: 'page-content',
  PATIENT_STRIP: 'ps-wrap',
  TEST_NAME: 'test-name',
  RADIOLOGY_WRAP: 'radiology-wrap',
  SIGNATURE_ROW: 'sig-row',
  SIGNATURE_CELL: 'sig-cell'
};