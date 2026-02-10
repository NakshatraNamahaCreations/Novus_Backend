import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { pathToFileURL } from "url";

const ROOT = process.cwd();
const assetsDir = path.join(ROOT, "assets");
const outDir = path.join(ROOT, "output");

const htmlPath = path.join(assetsDir, "test.html");
const outPdf = path.join(outDir, "out.pdf");

fs.mkdirSync(outDir, { recursive: true });

const baseUrl = pathToFileURL(assetsDir + path.sep).href; // ✅ important

console.log("Assets:", assetsDir);
console.log("Base URL:", baseUrl);
console.log("HTML exists?", fs.existsSync(htmlPath));

const princeBin = process.env.PRINCE_PATH || "prince";

const args = [
  "--silent",
  "--baseurl",
  baseUrl,
  htmlPath,
  "-o",
  outPdf,
];


await new Promise((resolve, reject) => {
  const p = spawn(princeBin, args, { windowsHide: true });

  let err = "";
  p.stderr.on("data", (d) => (err += d.toString()));
  p.on("error", reject);
  p.on("close", (code) => {
    if (code !== 0) return reject(new Error(`Prince failed (code ${code}): ${err}`));
    resolve();
  });
});

console.log("✅ PDF created:", outPdf);
