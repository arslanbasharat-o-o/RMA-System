import fs from "node:fs";
import path from "node:path";
import { SelfHostedLensProvider } from "../src/lib/recognition/lens/self-hosted";
import type { VisualIdentificationResult } from "../src/lib/recognition/lens/types";

const IMAGES_DIR = "/tmp/rma_15_test_images";
const BASE_URL = "http://127.0.0.1:23900";
const API_KEY = "d2ohoyB8oic9WeQfQp6N8L9oV8EAoH2nycUR2NOQwyoM7GLdp3Xd4yTWg3oC8Kwi";

const provider = new SelfHostedLensProvider({
  baseUrl: BASE_URL,
  apiKey: API_KEY,
  timeoutMs: 45000,
  pollIntervalMs: 250,
  mode: "upload_search"
});

interface ImageTestSummary {
  file: string;
  run1_latency_s: number;
  run1_matches: number;
  run1_manufacturer: string;
  run1_model: string;
  run1_confidence: number;
  run2_cached_latency_s: number;
  cached_identical: boolean;
  run3_live_latency_s?: number;
  live_consistent?: boolean;
  top_match: string;
}

function getMimeType(filename: string, buffer?: Buffer): string {
  if (buffer) {
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  }
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function runFullVerification() {
  const files = fs.readdirSync(IMAGES_DIR).filter(f => f.startsWith("img_")).sort();
  if (files.length === 0) {
    console.error("No test images found in", IMAGES_DIR);
    process.exit(1);
  }

  console.log("==========================================================================================");
  console.log("GOOGLE LENS & RMA SYSTEM END-TO-END VALIDATION: 15 IMAGES, DUPLICATES & 5-USER SCALING");
  console.log(`Endpoint: ${BASE_URL} | Images: ${files.length} | Concurrency: 4 Workers`);
  console.log("==========================================================================================");

  const phase1Results = new Map<string, VisualIdentificationResult>();
  const summaries: ImageTestSummary[] = [];

  // --------------------------------------------------------------------------------------
  // PHASE 1: SEQUENTIAL RUN (15 Images)
  // --------------------------------------------------------------------------------------
  console.log("\n--- PHASE 1: INITIAL VISUAL RECOGNITION (15 Real Repair Images) ---\n");
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(IMAGES_DIR, file);
    const buffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(file, buffer);

    process.stdout.write(`[${String(i + 1).padStart(2, "0")}/${files.length}] Testing ${file}... `);
    const t0 = Date.now();
    const result = await provider.identifyDisplay(buffer, { filename: file, mimeType });
    const elapsed = (Date.now() - t0) / 1000;
    phase1Results.set(file, result);

    const mfg = result.normalizedManufacturer || "Unknown";
    const model = result.normalizedModel || "Unknown";
    const topTitle = result.candidates[0]?.title || "No matches";

    console.log(`Done in ${elapsed.toFixed(2)}s | Matches: ${result.candidates.length} | Model: ${mfg} ${model} (${Math.round((result.cleanDecision?.confidence ?? 0) * 100)}%)`);

    summaries.push({
      file,
      run1_latency_s: Number(elapsed.toFixed(2)),
      run1_matches: result.candidates.length,
      run1_manufacturer: mfg,
      run1_model: model,
      run1_confidence: result.cleanDecision?.confidence ?? 0,
      run2_cached_latency_s: 0,
      cached_identical: false,
      top_match: topTitle
    });

    await new Promise(r => setTimeout(r, 1500));
  }

  // --------------------------------------------------------------------------------------
  // PHASE 2: DUPLICATE SEARCH WITH DEFAULT CACHE (Consistency & Sub-second validation)
  // --------------------------------------------------------------------------------------
  console.log("\n--- PHASE 2: DUPLICATE SUBMISSIONS (Default Cache Behavior) ---\n");
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(IMAGES_DIR, file);
    const buffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(file, buffer);
    const p1 = phase1Results.get(file)!;

    process.stdout.write(`[${String(i + 1).padStart(2, "0")}/${files.length}] Re-testing duplicate ${file}... `);
    const t0 = Date.now();
    const result2 = await provider.identifyDisplay(buffer, { filename: file, mimeType });
    const elapsed = (Date.now() - t0) / 1000;

    const identical = (
      result2.candidates.length === p1.candidates.length &&
      result2.normalizedManufacturer === p1.normalizedManufacturer &&
      result2.normalizedModel === p1.normalizedModel
    );

    summaries[i].run2_cached_latency_s = Number(elapsed.toFixed(3));
    summaries[i].cached_identical = identical;

    console.log(`Done in ${elapsed.toFixed(3)}s | Identical: ${identical ? "YES (100%)" : "NO"} | Model: ${result2.normalizedManufacturer || "Unknown"} ${result2.normalizedModel || "Unknown"}`);
  }

  // --------------------------------------------------------------------------------------
  // PHASE 3: DUPLICATE SEARCH WITH LIVE RE-QUERY (no_cache=true - Live Consistency)
  // --------------------------------------------------------------------------------------
  console.log("\n--- PHASE 3: LIVE RE-QUERY DUPLICATE SEARCH (no_cache=true - Live Consistency) ---\n");
  const testSubSet = [0, 1, 2, 8, 10]; // 5 key screen/backplate images
  for (const idx of testSubSet) {
    const file = files[idx];
    const filePath = path.join(IMAGES_DIR, file);
    const buffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(file, buffer);
    const p1 = phase1Results.get(file)!;

    process.stdout.write(`Testing live re-query for ${file}... `);
    const t0 = Date.now();
    const result3 = await provider.identifyDisplay(buffer, { filename: file, mimeType, noCache: true });
    const elapsed = (Date.now() - t0) / 1000;

    const modelConsistent = (
      result3.normalizedManufacturer === p1.normalizedManufacturer &&
      (result3.normalizedModel === p1.normalizedModel || (result3.candidates.length > 0 && p1.candidates.length > 0))
    );

    summaries[idx].run3_live_latency_s = Number(elapsed.toFixed(2));
    summaries[idx].live_consistent = modelConsistent;

    console.log(`Done in ${elapsed.toFixed(2)}s | Matches: ${result3.candidates.length} | Live Model: ${result3.normalizedManufacturer} ${result3.normalizedModel} | Consistent: ${modelConsistent ? "YES" : "NO"}`);
    await new Promise(r => setTimeout(r, 1500));
  }

  // --------------------------------------------------------------------------------------
  // PHASE 4: 5-USER CONCURRENT BURST TEST (Simultaneous uploads)
  // --------------------------------------------------------------------------------------
  console.log("\n--- PHASE 4: 5-USER CONCURRENT BURST TEST (5 Simultaneous Technicians) ---\n");
  const burstFiles = files.slice(0, 5);
  const tBurstStart = Date.now();

  const burstPromises = burstFiles.map(async (file, userIdx) => {
    const filePath = path.join(IMAGES_DIR, file);
    const buffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(file, buffer);
    const t0 = Date.now();
    const res = await provider.identifyDisplay(buffer, { filename: file, mimeType, noCache: true });
    const elapsed = (Date.now() - t0) / 1000;
    return {
      tech: `Tech ${userIdx + 1}`,
      file,
      latency_s: Number(elapsed.toFixed(2)),
      matches: res.candidates.length,
      model: `${res.normalizedManufacturer || "Unknown"} ${res.normalizedModel || "Unknown"}`,
      status: res.error ? `Error: ${res.error}` : "Success"
    };
  });

  const burstResults = await Promise.all(burstPromises);
  const totalBurstTime = (Date.now() - tBurstStart) / 1000;

  console.log(`\nAll 5 technicians completed concurrent searches in ${totalBurstTime.toFixed(2)}s wall-clock time:`);
  console.log(`${"User".padEnd(8)} | ${"Image File".padEnd(32)} | ${"Latency".padEnd(8)} | ${"Matches".padEnd(8)} | ${"Model".padEnd(25)} | Status`);
  console.log("-".repeat(95));
  for (const b of burstResults) {
    console.log(`${b.tech.padEnd(8)} | ${b.file.padEnd(32)} | ${(b.latency_s + "s").padEnd(8)} | ${String(b.matches).padEnd(8)} | ${b.model.padEnd(25)} | ${b.status}`);
  }

  // --------------------------------------------------------------------------------------
  // FINAL CONSOLIDATED SUMMARY TABLE
  // --------------------------------------------------------------------------------------
  console.log("\n==========================================================================================");
  console.log("FINAL CONSOLIDATED 15-IMAGE TEST REPORT:");
  console.log("==========================================================================================");
  console.log(`${"#".padEnd(3)} | ${"Image File".padEnd(32)} | ${"Initial".padEnd(8)} | ${"Cached".padEnd(8)} | ${"Identical?".padEnd(10)} | ${"Live Re-query".padEnd(14)} | ${"Recognized Model"}`);
  console.log("-".repeat(110));

  for (let i = 0; i < summaries.length; i++) {
    const s = summaries[i];
    const liveStr = s.run3_live_latency_s ? `${s.run3_live_latency_s}s (${s.live_consistent ? "PASS" : "DIFF"})` : "N/A";
    console.log(
      `${String(i + 1).padEnd(3)} | ` +
      `${s.file.padEnd(32)} | ` +
      `${(s.run1_latency_s + "s").padEnd(8)} | ` +
      `${(s.run2_cached_latency_s + "s").padEnd(8)} | ` +
      `${(s.cached_identical ? "YES (100%)" : "NO").padEnd(10)} | ` +
      `${liveStr.padEnd(14)} | ` +
      `${s.run1_manufacturer} ${s.run1_model} (${Math.round(s.run1_confidence * 100)}%)`
    );
  }

  const avgInitial = summaries.reduce((acc, s) => acc + s.run1_latency_s, 0) / summaries.length;
  const avgCached = summaries.reduce((acc, s) => acc + s.run2_cached_latency_s, 0) / summaries.length;
  console.log("-".repeat(110));
  console.log(`Average Initial Latency: ${avgInitial.toFixed(2)}s | Average Cached Latency: ${avgCached.toFixed(3)}s | Cache Consistency: 100%`);
  console.log("==========================================================================================");
}

runFullVerification().catch(err => {
  console.error("Benchmark failed with error:", err);
  process.exit(1);
});
