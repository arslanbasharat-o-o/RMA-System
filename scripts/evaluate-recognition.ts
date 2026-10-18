import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { SelfHostedLensProvider } from "../src/lib/recognition/lens/self-hosted";
import { sameDeviceIdentity, percentile } from "../src/lib/recognition/evaluation";

interface Case {
  id: string | number;
  filename: string;
  expectedManufacturer: string;
  expectedModel: string;
  sha256: string;
}

async function main() {
  const [manifestPath, outputPath] = process.argv.slice(2);
  if (!manifestPath || !outputPath || !path.isAbsolute(manifestPath) || !path.isAbsolute(outputPath)) {
    throw new Error("Usage: tsx scripts/evaluate-recognition.ts /external/manifest.json /external/report.json");
  }
  const bytes = await fs.readFile(manifestPath);
  const cases: Case[] = JSON.parse(bytes.toString());
  if (!Array.isArray(cases) || !cases.length) throw new Error("Evaluation manifest must contain cases");
  const ids = new Set();
  for (const c of cases) {
    if (!c.filename || !c.expectedManufacturer || !c.expectedModel || !/^[a-f0-9]{64}$/.test(c.sha256) || ids.has(c.id)) {
      throw new Error("Each case needs a unique id, verified label, filename and SHA-256");
    }
    ids.add(c.id);
  }
  const provider = new SelfHostedLensProvider();
  const results = [];
  for (const c of cases) {
    const started = performance.now();
    try {
      const image = await fs.readFile(path.resolve(path.dirname(manifestPath), c.filename));
      if (createHash("sha256").update(image).digest("hex") !== c.sha256) throw new Error("Image checksum mismatch");
      // Only photo bytes and a neutral MIME/file name cross the inference boundary.
      const result = await provider.identifyDisplay(image, { filename: "display.jpg", noCache: true });
      const decision = result.cleanDecision;
      const correct = sameDeviceIdentity(c.expectedManufacturer, c.expectedModel,
        decision?.manufacturer, decision?.model);
      const accepted = !result.error && !!decision?.model && decision.confidence >= 0.85;
      results.push({ id: c.id, expectedManufacturer: c.expectedManufacturer, expectedModel: c.expectedModel,
        predictedManufacturer: decision?.manufacturer, predictedModel: decision?.model,
        correct, accepted, provider: result.provider, evidenceScore: decision?.confidence,
        durationMs: performance.now() - started, error: result.error || null });
    } catch (error) {
      results.push({ id: c.id, correct: false, accepted: false,
        durationMs: performance.now() - started, error: error instanceof Error ? error.message : "Evaluation failed" });
    }
    console.log(`Completed ${results.length}/${cases.length}`);
  }
  const accepted = results.filter(r => r.accepted);
  const report = { manifestSha256: createHash("sha256").update(bytes).digest("hex"),
    total: cases.length, tested: results.length,
    exactModelAccuracy: results.filter(r => r.correct).length / cases.length,
    acceptedCoverage: accepted.length / cases.length,
    acceptedPrecision: accepted.length ? accepted.filter(r => r.correct).length / accepted.length : null,
    falseConfidentMatches: accepted.filter(r => !r.correct).length,
    errors: results.filter(r => r.error).length,
    p50Ms: percentile(results.map(r => r.durationMs), 0.5),
    p95Ms: percentile(results.map(r => r.durationMs), 0.95), results };
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
  if (!accepted.length || report.exactModelAccuracy < 0.95 || report.falseConfidentMatches || report.errors) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
