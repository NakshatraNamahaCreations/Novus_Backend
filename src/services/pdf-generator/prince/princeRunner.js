import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { pathToFileURL } from "url";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function randId() {
  return crypto.randomBytes(8).toString("hex");
}

async function downloadToFile(url, outPath) {
  // Node 18+ has global fetch
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url} (${res.status})`);
  const arr = new Uint8Array(await res.arrayBuffer());
  fs.writeFileSync(outPath, arr);
}

/**
 * html -> PDF buffer using Prince
 * assetsDirAbs: your STATIC assets folder (css etc)
 * extraRemoteAssets: array of { url, relPath } to download into jobDir/<relPath>
 */
export async function princeHtmlToPdfBuffer({
  html,
  assetsDirAbs,
  princePath = process.env.PRINCE_PATH || "prince",
  extraRemoteAssets = [], // [{ url, relPath: "images/header.png" }]
  debugSave = false,
  debugOutDirAbs = null,
}) {
  if (!html) throw new Error("Missing html");
  if (!assetsDirAbs) throw new Error("Missing assetsDirAbs");

  const tmpRoot = process.env.TMPDIR || os.tmpdir();
  const jobDir = path.join(tmpRoot, "novus-prince", randId());
  ensureDir(jobDir);

  // Copy STATIC assets into jobDir/base so baseurl can resolve both css + downloaded images
  const baseDir = path.join(jobDir, "base");
  ensureDir(baseDir);

  // Copy your assets/report folder (css/images placeholders) into baseDir
  fs.cpSync(assetsDirAbs, baseDir, { recursive: true });

  // Download remote images into baseDir
  for (const a of extraRemoteAssets) {
    if (!a?.url || !a?.relPath) continue;
    const outPath = path.join(baseDir, a.relPath);
    ensureDir(path.dirname(outPath));
    await downloadToFile(a.url, outPath);
  }

  const htmlPath = path.join(jobDir, "doc.html");
  const pdfPath = path.join(jobDir, "out.pdf");
  fs.writeFileSync(htmlPath, html, "utf8");

  // ✅ baseurl points to baseDir (contains css/ and images/)
  const baseUrl = pathToFileURL(baseDir + path.sep).href;

  const args = ["--silent", "--baseurl", baseUrl, htmlPath, "-o", pdfPath];

  const run = () =>
    new Promise((resolve, reject) => {
      const p = spawn(princePath, args, { windowsHide: true });
      let err = "";
      p.stderr.on("data", (d) => (err += d.toString()));
      p.on("error", reject);
      p.on("close", (code) => {
        if (code !== 0) return reject(new Error(`Prince failed (code ${code}): ${err}`));
        resolve();
      });
    });

  try {
    await run();
    const pdfBuffer = fs.readFileSync(pdfPath);

    if (debugSave && debugOutDirAbs) {
      ensureDir(debugOutDirAbs);
      fs.copyFileSync(htmlPath, path.join(debugOutDirAbs, `debug-${Date.now()}.html`));
      fs.copyFileSync(pdfPath, path.join(debugOutDirAbs, `debug-${Date.now()}.pdf`));
    }

    return pdfBuffer;
  } finally {
    try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch {}
  }
}