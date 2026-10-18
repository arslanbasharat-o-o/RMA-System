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
  index: number;
  filename: string;
  expected_manufacturer: string;
  expected_model: string;
  view: string;
  slug: string;
  source_url: string;
  file_size: number;
}

function normalizeForComparison(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/apple/g, "");
}

function isModelMatch(expected: string, predicted: string): boolean {
  const exp = normalizeForComparison(expected);
  const pred = normalizeForComparison(predicted);

  // Exact match
  if (exp === pred || pred.includes(exp) || exp.includes(pred)) return true;

  // iPhone 12 and iPhone 12 Pro share the exact same interchangeable display
  if (exp.includes("12") && exp.includes("pro") && pred.includes("12")) return true;
  if (exp === "iphone12" && (pred === "iphone12" || pred === "iphone12pro" || pred === "iphone1212pro")) return true;

  // iPhone SE 2nd Gen / SE 2020
  if (exp.includes("se") && pred.includes("se")) return true;

  return false;
}

async function run50IphoneBenchmark() {
  console.log("===============================================================================");
  console.log("🚀 STARTING 50 iPHONE DISPLAY STRESS-TEST BENCHMARK ON VPS");
  console.log("Testing All Generations (iPhone 6 to 15 Pro Max) - Front & Rear Stress Test");
  console.log("Target: High Accuracy Across Lookalikes (XR vs 11 vs X vs 12 vs 13) & ~95% Confidence");
  console.log("===============================================================================\n");

  const manifestPath = path.join(__dirname, "test_images_50", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest file not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`Loaded ${manifest.length} iPhone display test images from manifest.\n`);

  const allCatalog = await db.select().from(displayCatalog);
  console.log(`Loaded ${allCatalog.length} catalog items from PostgreSQL.\n`);

  const provider = new SelfHostedLensProvider({ timeoutMs: 15000 });

  let passedCount = 0;
  let catalogMatchCount = 0;
  let totalConfidence = 0;
  let totalDuration = 0;

  const results: Array<{
    index: number;
    filename: string;
    view: string;
    expectedManufacturer: string;
    expectedModel: string;
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
    const fullPath = path.join(__dirname, "test_images_50", item.filename);

    if (!fs.existsSync(fullPath)) {
      console.warn(`[Case #${item.index}] Image file not found: ${fullPath}`);
      continue;
    }

    const imageBuffer = fs.readFileSync(fullPath);
    console.log(`\n-------------------------------------------------------------------------------`);
    console.log(`[Case #${String(item.index).padStart(2, "0")}/50] ${item.expected_model} (${item.view.toUpperCase()} VIEW)`);
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
      const expMfgNorm = (item.expected_manufacturer || "Apple").toLowerCase();
      const predMfgNorm = (decision.manufacturer || "").toLowerCase();
      const mfgMatches = predMfgNorm === expMfgNorm || predMfgNorm.includes(expMfgNorm);

      const modelMatches = isModelMatch(item.expected_model, decision.model || "");

      const isPass = mfgMatches && modelMatches;
      if (isPass) passedCount++;
      if (displayMatch) catalogMatchCount++;
      totalConfidence += decision.confidence;

      results.push({
        index: item.index,
        filename: item.filename,
        view: item.view,
        expectedManufacturer: item.expected_manufacturer,
        expectedModel: item.expected_model,
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
      console.log(`   Model Decision  : ${decision.manufacturer} ${decision.model} (${(decision.confidence * 100).toFixed(1)}%)`);
      console.log(`   Catalog Match   : ${displayMatch ? `${displayMatch.modelName} [SKU: ${displayMatch.internalSku}]` : "No Catalog Link (catalog disambiguation needed)"}`);
      console.log(`   Verdict         : ${isPass ? "✅ PASS" : "❌ FAIL"} in ${elapsed}ms`);
      console.log(`   Reasoning       : ${decision.reasoning}`);
    } catch (err) {
      const elapsed = Date.now() - t0;
      console.error(`   ❌ Error during recognition:`, err);
      results.push({
        index: item.index,
        filename: item.filename,
        view: item.view,
        expectedManufacturer: item.expected_manufacturer,
        expectedModel: item.expected_model,
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
  console.log("📊 50 iPHONE DISPLAY STRESS-TEST BENCHMARK FINAL SUMMARY");
  console.log("===============================================================================");
  console.log(`Total Images Tested      : ${manifest.length}`);
  console.log(`Accuracy (Model & Mfg)   : ${passedCount} / ${manifest.length} (${passRate}%)`);
  console.log(`Catalog Sku Matched      : ${catalogMatchCount} / ${manifest.length} (${catalogRate}%)`);
  console.log(`Average Confidence Score : ${avgConfidence}%`);
  console.log(`Average Processing Time  : ${avgDuration}s per image`);
  console.log("===============================================================================\n");

  const summaryReportPath = path.join(__dirname, "test_images_50", "benchmark_50_report.json");
  fs.writeFileSync(summaryReportPath, JSON.stringify({ results, passRate, avgConfidence, catalogRate }, null, 2));
  console.log(`Detailed JSON report written to ${summaryReportPath}`);
}

run50IphoneBenchmark().catch(console.error);
