import path from "path";
import { fileURLToPath } from "url";

import { PatientService } from "./services/patientService.js";
import { TrendService } from "./services/trendService.js";
import { buildHtml } from "./templates/buildHtml.js";
import { princeHtmlToPdfBuffer } from "./prince/princeRunner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// STATIC assets folder containing css/report.css (and maybe default images)
const assetsDirAbs = path.resolve(__dirname, "../../../assets/report");

function layoutAssets(layout, variant) {
  const list = [];

  // For letterhead and full variants, include header/footer
  if (variant !== "plain") {
    if (layout?.headerImg) {
      list.push({ url: layout.headerImg, relPath: "images/_header.png" });
    }
    if (layout?.footerImg) {
      list.push({ url: layout.footerImg, relPath: "images/_footer.png" });
    }
  }

  // For full variant only, include front and last page images
  if (variant === "full") {
    if (layout?.frontPageLastImg) {
      list.push({ url: layout.frontPageLastImg, relPath: "images/_frontPageLast.jpg" });
    }

    if (layout?.lastPageImg) {
      list.push({ url: layout.lastPageImg, relPath: "images/_lastPage.jpg" });
    }
  }

  return list;
}

export async function generatePatient3PdfsNew({ orderId, patientId }) {
  // Fetch all report data once
  const reportData = await PatientService.getReportData({ orderId, patientId });

  // Build trend map
  const trendMap = await TrendService.buildTrendMap({
    results: reportData.results,
    patientId,
  });

  // Add trendMap to reportData
  reportData.trendMap = trendMap;

  // Helper to generate one variant
  const makeOne = async (variant) => {
    const html = buildHtml({ reportData, variant });

    return princeHtmlToPdfBuffer({
      html,
      assetsDirAbs,
      extraRemoteAssets: layoutAssets(reportData.layout, variant),
      debugSave: false, // Set to true for debugging
      debugOutDirAbs: null, // Set path for debugging
    });
  };

  // Generate all three variants in parallel
  const [plainBuffer, letterheadBuffer, fullBuffer] = await Promise.all([
    makeOne("plain"),
    makeOne("letterhead"),
    makeOne("full"),
  ]);

  return { plainBuffer, letterheadBuffer, fullBuffer };
}