import { db } from "../src/db/index";
import { displayCatalog } from "../src/db/schema";
import { cleanVisualCandidatesWithOpenAi } from "../src/lib/recognition/lens/decision";
import { matchDisplayToCatalog } from "../src/lib/recognition/synthesizer";
import { VisualCandidate, VisualIdentificationResult } from "../src/lib/recognition/lens/types";

interface DisplayTestCase {
  id: number;
  expectedManufacturer: string;
  expectedModel: string;
  expectedCategory: "iPhone" | "iPad" | "Samsung Galaxy" | "Google Pixel";
  lensCandidates: string[];
}

export const BENCHMARK_CASES: DisplayTestCase[] = [
  // --- Apple iPhone Generations ---
  {
    id: 1,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 8",
    expectedCategory: "iPhone",
    lensCandidates: [
      "OEM LCD Screen and Digitizer Assembly for iPhone 8 Black - MobileSentrix",
      "Apple iPhone 8 Replacement LCD Touch Screen Assembly with Back Plate",
      "iPhone 8 Screen Replacement 4.7 inch LCD Display - Injured Gadgets",
      "iPhone 8 Replacement Screen - iFixit",
    ],
  },
  {
    id: 2,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone X",
    expectedCategory: "iPhone",
    lensCandidates: [
      "OEM Refurbished OLED Display Assembly for iPhone X - MobileSentrix",
      "iPhone X Screen Replacement Soft OLED 5.8 inch - Injured Gadgets",
      "Apple iPhone X OLED Screen and Digitizer Assembly Replacement",
      "iPhone X OLED Display Assembly - RepairsUniverse",
    ],
  },
  {
    id: 3,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone XR",
    expectedCategory: "iPhone",
    lensCandidates: [
      "OEM In-Cell LCD Screen Replacement for iPhone XR 6.1\" - Injured Gadgets",
      "Apple iPhone XR Liquid Retina LCD Display Digitizer Assembly",
      "Replacement Screen for iPhone XR A1984 A2105 - MobileSentrix",
      "iPhone XR LCD and Touch Screen Assembly Black",
    ],
  },
  {
    id: 4,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone XS Max",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Soft OLED Screen for iPhone XS Max 6.5\" Assembly - MobileSentrix",
      "Apple iPhone XS Max OLED Display Touch Screen Digitizer",
      "Replacement OLED Panel for iPhone XS Max A1921 A2101",
      "iPhone XS Max Soft OLED Assembly - Injured Gadgets",
    ],
  },
  {
    id: 5,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 11",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Premium In-Cell LCD Screen for iPhone 11 6.1\" - Injured Gadgets",
      "Apple iPhone 11 LCD Screen Replacement Assembly Black",
      "iPhone 11 Liquid Retina Display Touch Digitizer A2111 A2221",
      "Replacement In-Cell LCD for Apple iPhone 11 - MobileSentrix",
    ],
  },
  {
    id: 6,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 11 Pro",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Soft OLED Screen Assembly for iPhone 11 Pro 5.8\" - MobileSentrix",
      "Apple iPhone 11 Pro Super Retina XDR OLED Display Replacement",
      "iPhone 11 Pro OLED Screen Digitizer Assembly A2160 - Injured Gadgets",
      "OEM OLED for iPhone 11 Pro Display Replacement",
    ],
  },
  {
    id: 7,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 11 Pro Max",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Apple iPhone 11 Pro Max Soft OLED Display Assembly Replacement",
      "iPhone 11 Pro Max 6.5\" OLED Touch Screen Digitizer - MobileSentrix",
      "Replacement OLED Assembly for iPhone 11 Pro Max A2161",
      "iPhone 11 Pro Max OLED Screen - Injured Gadgets",
    ],
  },
  {
    id: 8,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 12 Mini",
    expectedCategory: "iPhone",
    lensCandidates: [
      "OLED Screen Replacement for iPhone 12 Mini 5.4\" - MobileSentrix",
      "Apple iPhone 12 Mini OLED Display and Digitizer Assembly",
      "iPhone 12 Mini Super Retina XDR OLED A2176 A2399 - Injured Gadgets",
      "iPhone 12 Mini Screen Assembly - iFixit",
    ],
  },
  {
    id: 9,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 12 / 12 Pro",
    expectedCategory: "iPhone",
    lensCandidates: [
      "OEM Soft OLED Display for iPhone 12 / iPhone 12 Pro 6.1\" - MobileSentrix",
      "Apple iPhone 12 and 12 Pro OLED Screen Replacement Assembly",
      "iPhone 12 / 12 Pro OLED Display Digitizer A2172 A2403 - Injured Gadgets",
      "Replacement Screen for iPhone 12 / 12 Pro 6.1 inch",
    ],
  },
  {
    id: 10,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 12 Pro Max",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Apple iPhone 12 Pro Max 6.7\" OLED Screen Replacement - MobileSentrix",
      "Soft OLED Assembly for iPhone 12 Pro Max A2342 A2411 - Injured Gadgets",
      "iPhone 12 Pro Max Super Retina XDR Display Digitizer",
      "OEM OLED Replacement for Apple iPhone 12 Pro Max",
    ],
  },
  {
    id: 11,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 13 Mini",
    expectedCategory: "iPhone",
    lensCandidates: [
      "OLED Screen for Apple iPhone 13 Mini 5.4\" - Injured Gadgets",
      "iPhone 13 Mini Display and Digitizer Assembly Replacement - MobileSentrix",
      "OEM Pull iPhone 13 Mini OLED Screen A2481 A2630",
      "Apple iPhone 13 Mini Display Assembly",
    ],
  },
  {
    id: 12,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 13",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Apple iPhone 13 6.1\" OLED Display and Touch Screen - MobileSentrix",
      "OEM Refurbished OLED Screen Replacement for iPhone 13 - Injured Gadgets",
      "iPhone 13 Display Assembly A2482 A2633 With Bracket",
      "Replacement OLED for Apple iPhone 13 6.1 inch",
    ],
  },
  {
    id: 13,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 13 Pro",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Apple iPhone 13 Pro 120Hz ProMotion OLED Screen Assembly - MobileSentrix",
      "iPhone 13 Pro Super Retina XDR OLED Display Digitizer - Injured Gadgets",
      "OEM 120Hz OLED Display for iPhone 13 Pro A2483 A2638",
      "Replacement Display Screen for iPhone 13 Pro",
    ],
  },
  {
    id: 14,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 13 Pro Max",
    expectedCategory: "iPhone",
    lensCandidates: [
      "OEM OLED Screen Assembly for iPhone 13 Pro Max 6.7\" 120Hz - MobileSentrix",
      "Apple iPhone 13 Pro Max OLED Display Digitizer A2484 - Injured Gadgets",
      "iPhone 13 Pro Max ProMotion Display Replacement",
      "iPhone 13 Pro Max Screen Assembly Genuine Pull",
    ],
  },
  {
    id: 15,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 14",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Apple iPhone 14 6.1\" OLED Screen Replacement - MobileSentrix",
      "iPhone 14 OLED Display and Digitizer Assembly A2649 - Injured Gadgets",
      "OEM Refurbished OLED Screen for iPhone 14 6.1 inch",
      "Replacement Display for Apple iPhone 14",
    ],
  },
  {
    id: 16,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 14 Plus",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Apple iPhone 14 Plus 6.7\" OLED Display Assembly - Injured Gadgets",
      "OEM OLED Screen Replacement for iPhone 14 Plus A2632 - MobileSentrix",
      "iPhone 14 Plus Touch Screen Digitizer Assembly",
      "Replacement OLED for iPhone 14 Plus 6.7 inch",
    ],
  },
  {
    id: 17,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 14 Pro",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Apple iPhone 14 Pro Dynamic Island OLED Display Assembly - MobileSentrix",
      "iPhone 14 Pro 120Hz ProMotion OLED Screen A2650 - Injured Gadgets",
      "OEM OLED Screen Replacement for iPhone 14 Pro",
      "Dynamic Island Display Panel for Apple iPhone 14 Pro",
    ],
  },
  {
    id: 18,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 14 Pro Max",
    expectedCategory: "iPhone",
    lensCandidates: [
      "OEM OLED Assembly for iPhone 14 Pro Max 6.7\" Dynamic Island - MobileSentrix",
      "Apple iPhone 14 Pro Max Super Retina XDR OLED - Injured Gadgets",
      "iPhone 14 Pro Max Screen Digitizer Replacement A2651",
      "120Hz Display Assembly for iPhone 14 Pro Max",
    ],
  },
  {
    id: 19,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 15",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Apple iPhone 15 OLED Screen Replacement Dynamic Island - MobileSentrix",
      "iPhone 15 6.1\" OLED Display and Touch Digitizer - Injured Gadgets",
      "OEM Refurbished Display Assembly for iPhone 15 A2846",
      "Replacement OLED Screen for Apple iPhone 15",
    ],
  },
  {
    id: 20,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 15 Pro",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Apple iPhone 15 Pro OLED Display Assembly Dynamic Island - MobileSentrix",
      "iPhone 15 Pro 120Hz ProMotion Screen Replacement A2848 - Injured Gadgets",
      "OEM Display for iPhone 15 Pro Super Retina XDR",
      "Replacement OLED Panel for Apple iPhone 15 Pro",
    ],
  },
  {
    id: 21,
    expectedManufacturer: "Apple",
    expectedModel: "iPhone 15 Pro Max",
    expectedCategory: "iPhone",
    lensCandidates: [
      "Apple iPhone 15 Pro Max 6.7\" OLED Screen Replacement - MobileSentrix",
      "OEM Refurbished OLED for iPhone 15 Pro Max A2849 - Injured Gadgets",
      "iPhone 15 Pro Max Dynamic Island 120Hz ProMotion Display",
      "Super Retina XDR Assembly for iPhone 15 Pro Max",
    ],
  },

  // --- Apple iPads & Tablets ---
  {
    id: 22,
    expectedManufacturer: "Apple",
    expectedModel: "iPad Pro 12.9 1st Gen",
    expectedCategory: "iPad",
    lensCandidates: [
      "LCD Assembly With Digitizer & Daughter Board Flex For iPad Pro 12.9 1st Gen",
      "LCD FOR IPAD PRO 12.9 1ST GEN CONN - Wholesale Gadget Parts",
      "iPad Pro 12.9 1Gen 2015 LCD and Touch Screen Replacement A1584 A1652",
      "iPad Pro 12.9\" A1584 A1652 LCD Display Digitizer Touch Assembly",
    ],
  },
  {
    id: 23,
    expectedManufacturer: "Apple",
    expectedModel: "iPad Pro 11",
    expectedCategory: "iPad",
    lensCandidates: [
      "LCD Screen and Digitizer Assembly for iPad Pro 11\" 1st Gen / 2nd Gen - MobileSentrix",
      "Apple iPad Pro 11 Liquid Retina Display Touch Replacement A1980 A2228",
      "iPad Pro 11 inch 120Hz ProMotion LCD Assembly - Injured Gadgets",
      "OEM LCD Display for Apple iPad Pro 11",
    ],
  },
  {
    id: 24,
    expectedManufacturer: "Apple",
    expectedModel: "iPad Air 4 / 5",
    expectedCategory: "iPad",
    lensCandidates: [
      "Apple iPad Air 4 (2020) / iPad Air 5 (2022) 10.9\" LCD Assembly - MobileSentrix",
      "LCD Display Touch Screen Digitizer for iPad Air 4th / 5th Gen A2316 A2588",
      "iPad Air 10.9 inch Replacement LCD Assembly - Injured Gadgets",
      "OEM Screen Assembly for iPad Air 4 / Air 5",
    ],
  },

  // --- Samsung Galaxy S-Series ---
  {
    id: 25,
    expectedManufacturer: "Samsung",
    expectedModel: "Galaxy S21 Ultra",
    expectedCategory: "Samsung Galaxy",
    lensCandidates: [
      "OEM Dynamic AMOLED 2X Display with Frame for Samsung Galaxy S21 Ultra 5G G998 - MobileSentrix",
      "Samsung Galaxy S21 Ultra 5G Screen Replacement Service Pack GH82-26034A",
      "Galaxy S21 Ultra AMOLED LCD Touch Screen Digitizer - Injured Gadgets",
      "Samsung S21 Ultra 6.8 inch 120Hz Display Assembly",
    ],
  },
  {
    id: 26,
    expectedManufacturer: "Samsung",
    expectedModel: "Galaxy S22 Ultra",
    expectedCategory: "Samsung Galaxy",
    lensCandidates: [
      "Samsung Galaxy S22 Ultra 5G Dynamic AMOLED Screen with Frame S908 - MobileSentrix",
      "Galaxy S22 Ultra 5G OLED Display Touch Digitizer Replacement Service Pack",
      "OEM Screen Replacement for Samsung Galaxy S22 Ultra - Injured Gadgets",
      "Samsung S22 Ultra 6.8\" Curved AMOLED Assembly",
    ],
  },
  {
    id: 27,
    expectedManufacturer: "Samsung",
    expectedModel: "Galaxy S23 Ultra",
    expectedCategory: "Samsung Galaxy",
    lensCandidates: [
      "OEM Service Pack Screen with Frame for Samsung Galaxy S23 Ultra S918 - MobileSentrix",
      "Samsung Galaxy S23 Ultra 5G Dynamic AMOLED 2X Display Assembly",
      "Galaxy S23 Ultra 6.8\" AMOLED Replacement Screen - Injured Gadgets",
      "Samsung S23 Ultra Genuine OLED Panel Service Pack",
    ],
  },

  // --- Samsung Galaxy A-Series ---
  {
    id: 28,
    expectedManufacturer: "Samsung",
    expectedModel: "Galaxy A16 5G",
    expectedCategory: "Samsung Galaxy",
    lensCandidates: [
      "Samsung Galaxy A16 5G A166 LCD Screen Replacement with Frame - MobileSentrix",
      "OEM LCD Display Touch Screen Digitizer for Samsung Galaxy A16 5G SM-A166P",
      "Galaxy A16 5G In-Cell LCD Assembly 6.7\" - Injured Gadgets",
      "Samsung A16 5G Replacement Screen Assembly",
    ],
  },
  {
    id: 29,
    expectedManufacturer: "Samsung",
    expectedModel: "Galaxy A26 5G",
    expectedCategory: "Samsung Galaxy",
    lensCandidates: [
      "Samsung Galaxy A26 5G A266 LCD Display Screen Replacement - MobileSentrix",
      "OEM Replacement LCD Assembly for Samsung Galaxy A26 5G SM-A266",
      "Galaxy A26 5G Touch Screen Digitizer LCD - Injured Gadgets",
      "Samsung A26 5G Display Assembly",
    ],
  },

  // --- Google Pixel Series ---
  {
    id: 30,
    expectedManufacturer: "Google",
    expectedModel: "Pixel 7 Pro",
    expectedCategory: "Google Pixel",
    lensCandidates: [
      "Google Pixel 7 Pro OEM OLED Display and Touch Screen Assembly - iFixit",
      "Pixel 7 Pro 6.7\" LTPO AMOLED Screen Replacement GE2AE GP4BC - MobileSentrix",
      "Google Pixel 7 Pro OLED Display Digitizer - Injured Gadgets",
      "OEM Replacement Screen for Google Pixel 7 Pro 5G",
    ],
  },
];

async function runBenchmark() {
  console.log("===============================================================================");
  console.log("🚀 STARTING 30-DISPLAY RECOGNITION BENCHMARK SUITE");
  console.log("Testing Decision Engine & Catalog Matcher across 30 Mobile & Tablet Assemblies");
  console.log("===============================================================================\n");

  const allCatalog = await db.select().from(displayCatalog);
  console.log(`Loaded ${allCatalog.length} catalog items from display_catalog database table.\n`);

  let totalCases = BENCHMARK_CASES.length;
  let passedCount = 0;
  let catalogMatchCount = 0;
  let totalConfidence = 0;

  const results: Array<{
    id: number;
    expected: string;
    predictedModel: string;
    predictedManufacturer: string;
    cleanDisplayName: string;
    confidence: number;
    catalogSku: string | null;
    status: "PASS" | "FAIL";
    reasoning: string;
  }> = [];

  for (const testCase of BENCHMARK_CASES) {
    const rawCandidates: VisualCandidate[] = testCase.lensCandidates.map((title, idx) => ({
      title,
      rank: idx + 1,
      sourceUrl: "https://example.com/item",
    }));

    try {
      const decision = await cleanVisualCandidatesWithOpenAi(rawCandidates, {
        filename: `${testCase.expectedModel.replace(/\s+/g, "_")}.png`,
      });

      const visualResult: VisualIdentificationResult = {
        provider: "lens",
        candidates: rawCandidates,
        normalizedManufacturer: decision.manufacturer || undefined,
        normalizedModel: decision.model || undefined,
        detectedDisplayAssembly: decision.displayName,
        cleanDecision: decision,
        durationMs: 150,
        rawResponse: { cleanDecision: decision },
      };

      const displayMatch = matchDisplayToCatalog(visualResult, allCatalog, []);

      const mfgMatches =
        decision.manufacturer?.toLowerCase() === testCase.expectedManufacturer.toLowerCase();

      // Check if predicted model contains the expected model or vice versa
      const expNorm = testCase.expectedModel.toLowerCase().replace(/[^a-z0-9]/g, "");
      const predNorm = (decision.model || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const modelMatches =
        predNorm.includes(expNorm) || expNorm.includes(predNorm);

      const isPass = mfgMatches && modelMatches;
      if (isPass) passedCount++;
      if (displayMatch) catalogMatchCount++;
      totalConfidence += decision.confidence;

      results.push({
        id: testCase.id,
        expected: `${testCase.expectedManufacturer} ${testCase.expectedModel}`,
        predictedModel: decision.model || "Unidentified",
        predictedManufacturer: decision.manufacturer || "Unidentified",
        cleanDisplayName: decision.displayName,
        confidence: decision.confidence,
        catalogSku: displayMatch?.internalSku || null,
        status: isPass ? "PASS" : "FAIL",
        reasoning: decision.reasoning,
      });

      console.log(
        `[Case ${String(testCase.id).padStart(2, " ")}/30] ${isPass ? "✅ PASS" : "❌ FAIL"} | ` +
        `Expected: ${testCase.expectedManufacturer} ${testCase.expectedModel.padEnd(20, " ")} | ` +
        `Result: ${decision.manufacturer} ${decision.model || "None"} (${(decision.confidence * 100).toFixed(0)}%) | ` +
        `SKU: ${displayMatch?.internalSku || "No Catalog SKU"}`
      );
    } catch (err) {
      console.error(`[Case ${testCase.id}] ERROR:`, err);
      results.push({
        id: testCase.id,
        expected: `${testCase.expectedManufacturer} ${testCase.expectedModel}`,
        predictedModel: "ERROR",
        predictedManufacturer: "ERROR",
        cleanDisplayName: "ERROR",
        confidence: 0,
        catalogSku: null,
        status: "FAIL",
        reasoning: String(err),
      });
    }
  }

  const passRate = ((passedCount / totalCases) * 100).toFixed(1);
  const avgConfidence = ((totalConfidence / totalCases) * 100).toFixed(1);
  const catalogRate = ((catalogMatchCount / totalCases) * 100).toFixed(1);

  console.log("\n===============================================================================");
  console.log("📊 BENCHMARK SUITE RESULTS SUMMARY");
  console.log("===============================================================================");
  console.log(`Total Displays Tested : ${totalCases}`);
  console.log(`Passed (Model & Mfg)  : ${passedCount} / ${totalCases} (${passRate}%)`);
  console.log(`Catalog Sku Matched   : ${catalogMatchCount} / ${totalCases} (${catalogRate}%)`);
  console.log(`Average Confidence    : ${avgConfidence}%`);
  console.log("===============================================================================\n");

  if (passedCount < totalCases) {
    console.log("Failed Cases:");
    results.filter(r => r.status === "FAIL").forEach(r => {
      console.log(`- Case ${r.id}: Expected '${r.expected}', got '${r.predictedManufacturer} ${r.predictedModel}' (Reason: ${r.reasoning})`);
    });
  }
}

runBenchmark().catch(console.error);
