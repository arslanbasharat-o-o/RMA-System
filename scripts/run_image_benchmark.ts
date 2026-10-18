import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../src/db/index";
import { displayCatalog } from "../src/db/schema";
import { SelfHostedLensProvider } from "../src/lib/recognition/lens/self-hosted";
import { matchDisplayToCatalog } from "../src/lib/recognition/synthesizer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ManifestEntry {
  id: number;
  filename: string;
  path: string;
  expectedManufacturer: string;
  expectedModel: string;
  expectedTech: string;
  sourceUrl: string;
  imageUrl: string;
}

async function runImageBenchmark() {
  console.log("===============================================================================");
  console.log("🚀 STARTING REAL IMAGE RECOGNITION BENCHMARK ON VPS");
  console.log("Uploading & Searching 30 Real Display Replacement Images via Google Lens + AI");
  console.log("===============================================================================\n");

  const manifestPath = path.join(__dirname, "test_images_30", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest file not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`Loaded ${manifest.length} real display test images from manifest.\n`);

  const allCatalog = await db.select().from(displayCatalog);
  console.log(`Loaded ${allCatalog.length} catalog items from PostgreSQL.\n`);

  const provider = new SelfHostedLensProvider();

  let passedCount = 0;
  let catalogMatchCount = 0;
  let totalConfidence = 0;
  let totalDuration = 0;

  const results: Array<{
    id: number;
    expected: string;
    expectedTech: string;
    predictedManufacturer: string;
    predictedModel: string;
    cleanDisplayName: string;
    confidence: number;
    catalogSku: string | null;
    status: "PASS" | "FAIL";
    reasoning: string;
    durationMs: number;
  }> = [];

  for (const item of manifest) {
    const fullPath = path.join(__dirname, "test_images_30", item.filename);

    if (!fs.existsSync(fullPath)) {
      console.warn(`[Case ${item.id}] Image file not found: ${fullPath}`);
      continue;
    }

    const imageBuffer = fs.readFileSync(fullPath);
    console.log(`\n-------------------------------------------------------------------------------`);
    console.log(`[Case ${String(item.id).padStart(2, " ")}/30] Processing: ${item.expectedManufacturer} ${item.expectedModel} (${item.expectedTech})`);
    console.log(`File: ${item.filename} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

    const t0 = Date.now();
    try {
      const visualResult = await provider.identifyDisplay(imageBuffer, {
        filename: item.filename,
        mimeType: "image/jpeg",
        noCache: true,
      });

      const elapsed = Date.now() - t0;
      totalDuration += elapsed;

      const decision = visualResult.cleanDecision || {
        manufacturer: visualResult.normalizedManufacturer || null,
        model: visualResult.normalizedModel || null,
        displayName: visualResult.detectedDisplayAssembly || "Unidentified Display",
        confidence: 0,
        cleanedCandidates: [],
        reasoning: "No decision generated",
      };

      const displayMatch = matchDisplayToCatalog(visualResult, allCatalog, []);

      // Verification checks
      const expMfgNorm = item.expectedManufacturer.toLowerCase();
      const predMfgNorm = (decision.manufacturer || "").toLowerCase();
      const mfgMatches = predMfgNorm === expMfgNorm || predMfgNorm.includes(expMfgNorm);

      const expMdlNorm = item.expectedModel.toLowerCase().replace(/[^a-z0-9]/g, "");
      const predMdlNorm = (decision.model || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const modelMatches = predMdlNorm.includes(expMdlNorm) || expMdlNorm.includes(predMdlNorm);

      const isPass = mfgMatches && modelMatches;
      if (isPass) passedCount++;
      if (displayMatch) catalogMatchCount++;
      totalConfidence += decision.confidence;

      results.push({
        id: item.id,
        expected: `${item.expectedManufacturer} ${item.expectedModel}`,
        expectedTech: item.expectedTech,
        predictedManufacturer: decision.manufacturer || "Unidentified",
        predictedModel: decision.model || "Unidentified",
        cleanDisplayName: decision.displayName,
        confidence: decision.confidence,
        catalogSku: displayMatch?.internalSku || null,
        status: isPass ? "PASS" : "FAIL",
        reasoning: decision.reasoning,
        durationMs: elapsed,
      });

      console.log(`   Candidate Count : ${visualResult.candidates?.length || 0}`);
      if (visualResult.candidates && visualResult.candidates.length > 0) {
        console.log(`   Top Candidate   : ${visualResult.candidates[0].title}`);
      }
      console.log(`   Model Decision  : ${decision.manufacturer} ${decision.model} (${(decision.confidence * 100).toFixed(0)}%)`);
      console.log(`   Catalog Match   : ${displayMatch ? `${displayMatch.modelName} [SKU: ${displayMatch.internalSku}]` : "No Catalog Link (technician review)"}`);
      console.log(`   Verdict         : ${isPass ? "✅ PASS" : "❌ FAIL"} in ${elapsed}ms`);
      console.log(`   Reasoning       : ${decision.reasoning}`);
    } catch (err) {
      const elapsed = Date.now() - t0;
      console.error(`   ❌ Error during recognition:`, err);
      results.push({
        id: item.id,
        expected: `${item.expectedManufacturer} ${item.expectedModel}`,
        expectedTech: item.expectedTech,
        predictedManufacturer: "ERROR",
        predictedModel: "ERROR",
        cleanDisplayName: "ERROR",
        confidence: 0,
        catalogSku: null,
        status: "FAIL",
        reasoning: String(err),
        durationMs: elapsed,
      });
    }
  }

  const passRate = ((passedCount / manifest.length) * 100).toFixed(1);
  const avgConfidence = ((totalConfidence / manifest.length) * 100).toFixed(1);
  const catalogRate = ((catalogMatchCount / manifest.length) * 100).toFixed(1);
  const avgDuration = (totalDuration / manifest.length / 1000).toFixed(1);

  console.log("\n===============================================================================");
  console.log("📊 REAL IMAGE 30-DISPLAY BENCHMARK FINAL SUMMARY");
  console.log("===============================================================================");
  console.log(`Total Images Tested   : ${manifest.length}`);
  console.log(`Accuracy (Model & Mfg): ${passedCount} / ${manifest.length} (${passRate}%)`);
  console.log(`Catalog Sku Matched   : ${catalogMatchCount} / ${manifest.length} (${catalogRate}%)`);
  console.log(`Average Confidence    : ${avgConfidence}%`);
  console.log(`Average Processing Time: ${avgDuration}s per image`);
  console.log("===============================================================================\n");

  const summaryReportPath = path.join(__dirname, "test_images_30", "benchmark_report.json");
  fs.writeFileSync(summaryReportPath, JSON.stringify({ results, passRate, avgConfidence, catalogRate }, null, 2));
  console.log(`Detailed JSON report written to ${summaryReportPath}`);
}

runImageBenchmark().catch(console.error);
