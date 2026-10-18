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
  expectedManufacturer: string;
  expectedModel: string;
  view?: string;
  sourceUrl?: string;
}

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isModelMatch(expectedMfg: string, expectedModel: string, predMfg: string, predModel: string): boolean {
  const eMfg = normalize(expectedMfg);
  const pMfg = normalize(predMfg);
  const eMod = normalize(expectedModel);
  const pMod = normalize(predModel);

  // Check manufacturer match
  const mfgOk = eMfg === pMfg || pMfg.includes(eMfg) || eMfg.includes(pMfg);
  if (!mfgOk) return false;

  // Exact or substring match
  if (eMod === pMod || pMod.includes(eMod) || eMod.includes(pMod)) return true;

  // iPhone 12 and iPhone 12 Pro interchangeable display
  if (eMod.includes("12") && eMod.includes("pro") && pMod.includes("12")) return true;
  if (eMod === "iphone12" && (pMod.includes("12pro") || pMod.includes("1212pro"))) return true;

  // iPhone SE generations
  if (eMod.includes("se") && pMod.includes("se")) return true;

  // Samsung Galaxy S series normalization: e.g. "galaxys21ultra" vs "s21ultra"
  if (eMod.replace("galaxy", "") === pMod.replace("galaxy", "")) return true;

  // Google Pixel normalization: e.g. "pixel7pro" vs "googlepixel7pro"
  if (eMod.replace("pixel", "") === pMod.replace("pixel", "")) return true;

  // iPad versions: "ipadpro129" vs "ipadpro1293rdgen"
  if (eMod.includes("ipad") && pMod.includes("ipad")) {
    if (eMod.includes("129") && pMod.includes("129")) return true;
    if (eMod.includes("11") && pMod.includes("11")) return true;
    if (eMod.includes("air") && pMod.includes("air")) return true;
    if (eMod.includes("mini") && pMod.includes("mini")) return true;
  }

  return false;
}

async function run100DisplayBenchmark() {
  console.log("===============================================================================");
  console.log("🚀 STARTING 100-DISPLAY GLOBAL COMPREHENSIVE BENCHMARK ON VPS");
  console.log("Testing Apple (iPhone 6 to 15, iPad), Samsung (S20-S24, Note, A, Z), Google Pixel, OnePlus");
  console.log("Target: High Accuracy (~95%+) Across All Brands & Low Latency via Compressed Payloads");
  console.log("===============================================================================\n");

  const manifestPath = path.join(__dirname, "test_images_100", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest file not found at ${manifestPath}`);
    process.exit(1);
  }

  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`Loaded ${manifest.length} display test images from manifest.\n`);

  const allCatalog = await db.select().from(displayCatalog);
  console.log(`Loaded ${allCatalog.length} catalog items from PostgreSQL.\n`);

  const provider = new SelfHostedLensProvider({ timeoutMs: 18000 });

  let passedCount = 0;
  let catalogMatchCount = 0;
  let totalConfidence = 0;
  let totalDuration = 0;

  const results: Array<{
    id: number;
    filename: string;
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
    const fullPath = path.join(__dirname, "test_images_100", item.filename);

    if (!fs.existsSync(fullPath)) {
      console.warn(`[Case #${item.id}] Image file not found: ${fullPath}`);
      continue;
    }

    const imageBuffer = fs.readFileSync(fullPath);
    console.log(`-------------------------------------------------------------------------------`);
    console.log(`[Case #${String(item.id).padStart(3, "0")}/${manifest.length}] ${item.expectedManufacturer} ${item.expectedModel} (${item.view || "display"})`);
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

      const isPass = isModelMatch(
        item.expectedManufacturer,
        item.expectedModel,
        decision.manufacturer || "",
        decision.model || ""
      );

      if (isPass) passedCount++;
      if (displayMatch) catalogMatchCount++;
      totalConfidence += decision.confidence;

      results.push({
        id: item.id,
        filename: item.filename,
        expectedManufacturer: item.expectedManufacturer,
        expectedModel: item.expectedModel,
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
      console.log(`   Display Name    : ${decision.displayName}`);
      console.log(`   Catalog Match   : ${displayMatch ? `${displayMatch.modelName} [SKU: ${displayMatch.internalSku}]` : "No Direct SKU (decoupled / OCR stamp dependent)"}`);
      console.log(`   Verdict         : ${isPass ? "✅ PASS" : "❌ FAIL"} in ${(elapsed / 1000).toFixed(2)}s`);
    } catch (err) {
      const elapsed = Date.now() - t0;
      console.error(`   ❌ Error during recognition:`, err);
      results.push({
        id: item.id,
        filename: item.filename,
        expectedManufacturer: item.expectedManufacturer,
        expectedModel: item.expectedModel,
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
  const avgDuration = (totalDuration / manifest.length / 1000).toFixed(2);

  console.log("\n===============================================================================");
  console.log("📊 100-DISPLAY GLOBAL COMPREHENSIVE BENCHMARK FINAL SUMMARY");
  console.log("===============================================================================");
  console.log(`Total Images Tested      : ${manifest.length}`);
  console.log(`Accuracy (Model & Mfg)   : ${passedCount} / ${manifest.length} (${passRate}%)`);
  console.log(`Catalog Sku Matched      : ${catalogMatchCount} / ${manifest.length} (${catalogRate}%)`);
  console.log(`Average Confidence Score : ${avgConfidence}%`);
  console.log(`Average Processing Time  : ${avgDuration}s per image`);
  console.log("===============================================================================\n");

  const summaryReportPath = path.join(__dirname, "test_images_100", "benchmark_100_report.json");
  fs.writeFileSync(summaryReportPath, JSON.stringify({ results, passRate, avgConfidence, catalogRate, avgDuration }, null, 2));
  console.log(`Detailed JSON report written to ${summaryReportPath}`);
}

run100DisplayBenchmark().catch(console.error);
