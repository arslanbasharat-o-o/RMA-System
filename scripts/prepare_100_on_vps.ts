import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDir = path.join(__dirname, "test_images_100");
fs.mkdirSync(targetDir, { recursive: true });

const manifestPath = path.join(targetDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

async function run() {
  console.log(`Preparing ${manifest.length} test images...`);
  const dir50 = path.join(__dirname, "test_images_50");
  const dir30 = path.join(__dirname, "test_images_30");

  for (const item of manifest) {
    const dest = path.join(targetDir, item.filename);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      continue;
    }

    const orig = item.filename.replace(/^\d{3}_/, "");
    const src50 = path.join(dir50, orig);
    if (fs.existsSync(src50)) {
      fs.copyFileSync(src50, dest);
      continue;
    }

    const src30 = path.join(dir30, orig);
    if (fs.existsSync(src30)) {
      fs.copyFileSync(src30, dest);
      continue;
    }

    if (item.sourceUrl) {
      console.log(`Downloading ${item.filename}...`);
      try {
        const res = await fetch(item.sourceUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(dest, buf);
        } else {
          console.warn(`Failed to download ${item.filename}: HTTP ${res.status}`);
        }
      } catch (err) {
        console.warn(`Error downloading ${item.filename}:`, err);
      }
    }
  }

  const existing = fs.readdirSync(targetDir).filter((f) => f.endsWith(".jpg"));
  console.log(`Ready! ${existing.length}/100 images present in ${targetDir}`);
}

run().catch(console.error);
