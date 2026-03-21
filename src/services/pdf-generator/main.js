import path from "path";
import { fileURLToPath } from "url";

import { PatientService } from "./services/patientService.js";
import { TrendService } from "./services/trendService.js";
import { buildHtml } from "./templates/buildHtml.js";
import { princeHtmlToPdfBuffer } from "./prince/princeRunner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const assetsDirAbs = path.resolve(__dirname, "../../../assets/report");

function layoutAssets(layout, variant) {
  const list = [];

  if (variant !== "plain") {
    if (layout?.headerImg) {
      list.push({ url: layout.headerImg, relPath: "images/_header.png" });
    }
    if (layout?.footerImg) {
      list.push({ url: layout.footerImg, relPath: "images/_footer.png" });
    }
  }

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
  const reportData = await PatientService.getReportData({ orderId, patientId });

  const trendMap = await TrendService.buildTrendMap({
    results: reportData.results,
    patientId,
  });

  reportData.trendMap = trendMap;

  // ⚠️  buildHtml is async — MUST be awaited before passing to princeHtmlToPdfBuffer
  const makeOne = async (variant) => {
    const html = await buildHtml({ reportData, variant }); // ← await is critical

    if (typeof html !== "string") {
      throw new Error(
        `buildHtml did not return a string for variant "${variant}". Got: ${typeof html}`
      );
    }

    return princeHtmlToPdfBuffer({
      html,
      assetsDirAbs,
      extraRemoteAssets: layoutAssets(reportData.layout, variant),
      debugSave: false,
      debugOutDirAbs: null,
    });
  };

  const [plainBuffer, letterheadBuffer, fullBuffer] = await Promise.all([
    makeOne("plain"),
    makeOne("letterhead"),
    makeOne("full"),
  ]);

  return { plainBuffer, letterheadBuffer, fullBuffer };
}

export async function generateSingleTestPdf({ orderId, patientId, testResultId, variant = "letterhead" }) {
  const reportData = await PatientService.getReportData({ orderId, patientId, testResultId });

  const trendMap = await TrendService.buildTrendMap({
    results: reportData.results,
    patientId,
  });

  reportData.trendMap = trendMap;

  const html = await buildHtml({ reportData, variant });

  if (typeof html !== "string") {
    throw new Error(`buildHtml did not return a string for variant "${variant}". Got: ${typeof html}`);
  }

  return princeHtmlToPdfBuffer({
    html,
    assetsDirAbs,
    extraRemoteAssets: layoutAssets(reportData.layout, variant),
    debugSave: false,
    debugOutDirAbs: null,
  });
}