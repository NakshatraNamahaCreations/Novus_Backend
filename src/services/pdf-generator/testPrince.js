import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generatePatient3PdfsNew } from "./main.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.resolve(__dirname, "../../../output");
fs.mkdirSync(outDir, { recursive: true });

const { fullBuffer } = await generatePatient3PdfsNew({ orderId: 1, patientId: 1 });
fs.writeFileSync(path.join(outDir, "test-full.pdf"), fullBuffer);

console.log("✅ created output/test-full.pdf");
