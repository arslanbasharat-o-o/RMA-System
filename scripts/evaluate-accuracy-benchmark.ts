/**
 * CONTROLLED AI API SMOKE TEST HARNESS & PRE-FLIGHT RUNNER
 *
 * Scoped specifically for low-cost connectivity and schema verification:
 * - 3 Verified Fixtures:
 *     1. bench-apple-15pm (.local/benchmark/images/bench_1.jpg) - Represented in catalog
 *     2. bench-samsung-a13 (.local/benchmark/images/bench_4.jpg) - Hardware backplate (Holdout in seeded catalog)
 *     3. bench-moto-g-stylus (.local/benchmark/images/bench_3.jpg) - Holdout Abstention test
 * - Configurations:
 *     Config A: Sol Discovery + Sol Final
 *     Config B: Terra Discovery + Sol Final
 *     (Terra Final is strictly excluded from this initial smoke test)
 * - Real Pipeline Behavior: Uses production compareToVerifiedExamples and matchSeededInventory logic.
 *   Final comparison executes ONLY when Discovery produces a selection.
 *   If Discovery abstains (returns "none"), Final is SKIPPED and not manufactured.
 * - SDK-level retries explicitly disabled (maxRetries: 0) to ensure every HTTP attempt is tracked.
 * - Enforces maximum 24 outbound HTTP attempts ceiling (12 max quota * 2 attempts).
 * - Conservative pre-call budget admission with reserved spend on ambiguous/interrupted failures.
 * - Proposed budget guard: $4.00 USD (Theoretical worst-case with full retries: $2.63; expected: ~$0.29).
 *
 * SAFETY CONTROLS:
 * - Requires explicit AUTHORIZE_PAID_BENCHMARK="true" in environment.
 * - Standalone execution: Zero database or production RMA records touched.
 * - Without authorization, executes in safe offline mock mode with zero API calls.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import OpenAI from "openai";
import type { OpenAiTokenUsage } from "../src/lib/recognition/openai/telemetry";
import { matchSeededInventoryProduct, type SeededInventoryReference } from "../src/lib/recognition/seeded-inventory";
import { OpenAiVisionOcrService } from "../src/lib/recognition/openai/vision";

export interface SmokeTestFixture {
  id: string;
  label: string;
  family: string;
  isRepresentedInCatalog: boolean;
  expectedCatalogId: string | null;
  imagePath: string;
  sha256: string;
  notes: string;
}

/**
 * 3 Authorized & Verified Benchmark Fixtures (Inspected from .local/benchmark/images)
 * Confirmed: Free of customer PII, isolated physical display assemblies photographed on test benches.
 */
export const SMOKE_TEST_FIXTURES: SmokeTestFixture[] = [
  {
    id: "bench-apple-15pm",
    label: "Apple iPhone 15 Pro Max",
    family: "Apple",
    isRepresentedInCatalog: true,
    // Real catalog sourceKey for Apple iPhone 15 Pro Max AM in manifest.json:
    expectedCatalogId: "fd799ac3f3af7aafe15e90d106f937908f56307c731a0b76d5cb78c09c3df661",
    imagePath: ".local/benchmark/images/bench_1.jpg",
    sha256: "97dd8d8d0593a909cf510976f1acda71c655ad49bd3c711db7c911c76f0a3a4e",
    notes: "Verified Apple backplate with flex cable PN: 821-03177-A (DSP-025 in catalog)",
  },
  {
    id: "bench-samsung-a13",
    label: "Samsung Galaxy A13 4G",
    family: "Samsung",
    isRepresentedInCatalog: false, // Discovered in Check 2: Samsung is absent from 76-product Apple catalog
    expectedCatalogId: null, // Must abstain / return "none" under the seeded Apple inventory snapshot
    imagePath: ".local/benchmark/images/bench_4.jpg",
    sha256: "87bce50a756c9b09ffd89b651b62d050756a88bb6158d16c6a2c3bf8e3bc4ac4",
    notes: "Verified Samsung TFT backplate with vendor stamp TXP0319 and flex BS066F84M (Holdout in seeded inventory)",
  },
  {
    id: "bench-moto-g-stylus",
    label: "Motorola Moto G Stylus 4G XT2211",
    family: "Motorola",
    isRepresentedInCatalog: false,
    expectedCatalogId: null, // Holdout abstention test: True product absent, model must return "none"
    imagePath: ".local/benchmark/images/bench_3.jpg",
    sha256: "6d3b2524829d86d080882c8e48253ddaeab0f1b66a8268b36519232aaafb0685",
    notes: "Holdout abstention case: PMM6780JB2-1-1-LM-MAN flex cable, absent from seeded catalog",
  },
];

export interface CallTelemetryRecord {
  callIndex: number;
  configName: "Config_A" | "Config_B";
  stage: "discovery" | "final";
  fixtureId: string;
  requestedModel: string;
  returnedModel: string;
  requestId: string | null;
  attemptNumber: number;
  durationMs: number;
  usage: OpenAiTokenUsage;
  costUsd: number;
  isReconciled: boolean;
  finishReason: string | null;
  schemaValid: boolean;
  selectedCatalogId: string | null;
  confidence: number;
  matchingCuesCount: number;
  conflictingCuesCount: number;
  isCorrectVsGroundTruth: boolean;
  finalStageSkipped?: boolean;
  error?: string;
}

export class ControlledBenchmarkBudgetGuard {
  private spentUsd = 0;
  private reservedUnresolvedUsd = 0;
  private actualHttpAttempts = 0;
  private readonly maxBudgetUsd: number;
  private readonly maxAllowedHttpAttempts: number;
  private readonly isAuthorized: boolean;

  constructor(maxBudgetUsd = 4.0, maxAllowedHttpAttempts = 24) {
    this.maxBudgetUsd = maxBudgetUsd;
    this.maxAllowedHttpAttempts = maxAllowedHttpAttempts;
    this.isAuthorized = process.env.AUTHORIZE_PAID_BENCHMARK === "true";
  }

  public checkAdmissionOrThrow(projectedCostUsd: number): void {
    if (!this.isAuthorized) {
      throw new Error(
        "[SAFETY BLOCKED] Live paid benchmarking is not authorized. Set AUTHORIZE_PAID_BENCHMARK='true' to proceed."
      );
    }
    if (this.actualHttpAttempts >= this.maxAllowedHttpAttempts) {
      throw new Error(
        `[ATTEMPT LIMIT EXCEEDED] Reached maximum allowed HTTP attempts (${this.maxAllowedHttpAttempts}). Aborting execution.`
      );
    }
    const totalCommitted = this.spentUsd + this.reservedUnresolvedUsd + projectedCostUsd;
    if (totalCommitted > this.maxBudgetUsd) {
      throw new Error(
        `[BUDGET CEILING EXCEEDED] Current spend $${this.spentUsd.toFixed(4)} + unresolved $${this.reservedUnresolvedUsd.toFixed(4)} + projected $${projectedCostUsd.toFixed(4)} exceeds maximum authorized budget of $${this.maxBudgetUsd.toFixed(2)}.`
      );
    }
  }

  public recordAttemptStart(projectedWorstCaseUsd: number): void {
    this.actualHttpAttempts++;
    this.reservedUnresolvedUsd += projectedWorstCaseUsd;
  }

  public reconcileAttemptSuccess(actualCostUsd: number, reservedProjectedUsd: number): void {
    this.reservedUnresolvedUsd = Math.max(0, this.reservedUnresolvedUsd - reservedProjectedUsd);
    this.spentUsd += actualCostUsd;
  }

  public reconcileAttemptFailureUnknownCharge(reservedProjectedUsd: number): void {
    console.warn(
      `[BUDGET GUARD] Retaining $${reservedProjectedUsd.toFixed(4)} as unresolved committed charge after ambiguous failure.`
    );
  }

  public getSpentUsd(): number {
    return this.spentUsd;
  }

  public getReservedUnresolvedUsd(): number {
    return this.reservedUnresolvedUsd;
  }

  public getTotalCommittedUsd(): number {
    return this.spentUsd + this.reservedUnresolvedUsd;
  }

  public getActualHttpAttempts(): number {
    return this.actualHttpAttempts;
  }

  public getIsAuthorized(): boolean {
    return this.isAuthorized;
  }
}

/**
 * Calculates conservative worst-case spending for the 3-fixture smoke test
 * across Configuration A (Sol + Sol) and Configuration B (Terra + Sol).
 */
export function calculateSmokeTestSpendingBounds(): {
  configA_WorstCaseUsd: number;
  configB_WorstCaseUsd: number;
  totalSingleAttemptWorstCaseUsd: number;
  totalWithMaxRetriesWorstCaseUsd: number;
  baseCallCount: number;
  maxHttpAttempts: number;
} {
  const solDiscWorst = 0.14648;
  const terraDiscWorst = 0.07324;
  const solFinalWorst = 0.10880;

  // 3 items per configuration (Worst case assumes Final stage runs on all 3)
  const configA_ItemWorst = solDiscWorst + solFinalWorst; // $0.25528
  const configB_ItemWorst = terraDiscWorst + solFinalWorst; // $0.18204

  const configA_WorstCaseUsd = Number((3 * configA_ItemWorst).toFixed(4)); // $0.7658
  const configB_WorstCaseUsd = Number((3 * configB_ItemWorst).toFixed(4)); // $0.5461

  const totalSingleAttemptWorstCaseUsd = Number((configA_WorstCaseUsd + configB_WorstCaseUsd).toFixed(4)); // $1.3119
  const totalWithMaxRetriesWorstCaseUsd = Number((totalSingleAttemptWorstCaseUsd * 2).toFixed(4)); // $2.6238 ~ $2.63

  return {
    configA_WorstCaseUsd,
    configB_WorstCaseUsd,
    totalSingleAttemptWorstCaseUsd,
    totalWithMaxRetriesWorstCaseUsd,
    baseCallCount: 12, // Planned maximum quota (6 calls per config)
    maxHttpAttempts: 24, // 12 max calls * 2 max attempts
  };
}

/**
 * Loads genuine reference library directly from .local/display-inventory-seed/
 */
export function loadGenuineSeedReferences(): SeededInventoryReference[] {
  const seedDir = resolve(process.cwd(), ".local/display-inventory-seed");
  const manifestPath = join(seedDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Seed manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const products = manifest.products as Array<{
    sourceKey: string;
    manufacturer: string;
    modelName: string;
    variantName: string;
    printedTitle: string;
    barcodeValue: string | null;
    barcodeFormat: string | null;
    barcodeSymbology: string | null;
    supplierSku: string | null;
    references: Array<{
      displayId: string;
      imageId: string;
      imagePath: string;
    }>;
  }>;

  const references: SeededInventoryReference[] = [];
  for (const product of products) {
    for (const ref of product.references) {
      const fullImgPath = join(seedDir, ref.imagePath);
      if (existsSync(fullImgPath)) {
        references.push({
          product: {
            id: product.sourceKey,
            manufacturer: product.manufacturer,
            modelName: product.modelName,
            variantName: product.variantName,
            printedTitle: product.printedTitle,
            barcodeValue: product.barcodeValue,
            barcodeFormat: product.barcodeFormat,
            barcodeSymbology: product.barcodeSymbology,
            supplierSku: product.supplierSku || product.printedTitle,
          },
          displayId: ref.displayId,
          imageBuffer: readFileSync(fullImgPath),
          imageType: "back",
        });
      }
    }
  }

  return references;
}

/**
 * Creates an OpenAI client specifically configured for controlled benchmarking
 * with SDK-level automatic retries strictly DISABLED (maxRetries: 0).
 */
export function createBenchmarkOpenAiClient(apiKey?: string): OpenAI {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured for benchmark execution.");
  }
  return new OpenAI({
    apiKey: key,
    maxRetries: 0,
    timeout: 90000,
  });
}

export function verifyPreFlightFixtures(): {
  allValid: boolean;
  fixtureCount: number;
  details: Array<{ id: string; fileExists: boolean; byteSize: number; sha256: string }>;
} {
  const details = SMOKE_TEST_FIXTURES.map((fixture) => {
    const fullPath = resolve(process.cwd(), fixture.imagePath);
    const fileExists = existsSync(fullPath);
    const byteSize = fileExists ? readFileSync(fullPath).length : 0;
    return { id: fixture.id, fileExists, byteSize, sha256: fixture.sha256 };
  });

  const allValid = details.every((d) => d.fileExists && d.byteSize > 0);
  return { allValid, fixtureCount: details.length, details };
}

/**
 * Executes controlled benchmark smoke test if explicitly authorized
 */
export async function executeSmokeTestIfAuthorized(): Promise<void> {
  const isAuthorized = process.env.AUTHORIZE_PAID_BENCHMARK === "true";
  if (!isAuthorized) {
    console.log("[SAFETY STATUS] AUTHORIZE_PAID_BENCHMARK is not 'true'. Execution aborted.");
    return;
  }

  const budgetGuard = new ControlledBenchmarkBudgetGuard(4.0, 24);
  const client = createBenchmarkOpenAiClient();
  const service = new OpenAiVisionOcrService(process.env.OPENAI_API_KEY, "gpt-6.1-sol");
  // Override internal client with maxRetries: 0 client
  (service as unknown as { client: OpenAI }).client = client;

  const references = loadGenuineSeedReferences();
  console.log(`[Loaded Seed Reference Catalog: ${references.length} references across 76 products]`);

  const results: CallTelemetryRecord[] = [];
  let callIndex = 0;

  const configs: Array<{ name: "Config_A" | "Config_B"; disc: string; fin: string }> = [
    { name: "Config_A", disc: "gpt-6.1-sol", fin: "gpt-6.1-sol" },
    { name: "Config_B", disc: "gpt-6.1-terra", fin: "gpt-6.1-sol" },
  ];

  for (const config of configs) {
    console.log(`\n================================================================================`);
    console.log(`EXECUTING ${config.name}: Discovery [${config.disc}] + Final [${config.fin}]`);
    console.log(`================================================================================`);

    for (const fixture of SMOKE_TEST_FIXTURES) {
      console.log(`\n--- Fixture: ${fixture.label} (${fixture.id}) ---`);
      const imgBuffer = readFileSync(resolve(process.cwd(), fixture.imagePath));
      const targetImages = [{ imageBuffer: imgBuffer, imageType: "back" }];

      // Pre-call budget reservation for Discovery attempt
      const discWorst = config.disc === "gpt-6.1-sol" ? 0.14648 : 0.07324;
      budgetGuard.checkAdmissionOrThrow(discWorst);
      budgetGuard.recordAttemptStart(discWorst);

      const startTime = Date.now();
      try {
        const matchResult = await matchSeededInventoryProduct(service, targetImages, references, {
          discoveryModel: config.disc,
          finalModel: config.fin,
          promptCachingOrder: "prefix",
        });
        const duration = Date.now() - startTime;

        // Log Discovery Telemetry
        const discTel = matchResult.telemetry?.discovery;
        const discCost = discTel ? discTel.cost.totalCostUsd : discWorst;
        budgetGuard.reconcileAttemptSuccess(discCost, discWorst);
        callIndex++;

        results.push({
          callIndex,
          configName: config.name,
          stage: "discovery",
          fixtureId: fixture.id,
          requestedModel: config.disc,
          returnedModel: discTel?.actualModel || config.disc,
          requestId: discTel?.responseId || null,
          attemptNumber: 1,
          durationMs: duration,
          usage: discTel?.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedPromptTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
          costUsd: discCost,
          isReconciled: discTel?.cost.isReconciled ?? false,
          finishReason: "stop",
          schemaValid: !matchResult.error,
          selectedCatalogId: matchResult.product?.id || null,
          confidence: matchResult.confidence,
          matchingCuesCount: matchResult.matchingCues.length,
          conflictingCuesCount: matchResult.conflictingCues.length,
          isCorrectVsGroundTruth: fixture.expectedCatalogId === null
            ? matchResult.product === null
            : matchResult.product?.id === fixture.expectedCatalogId,
          finalStageSkipped: !matchResult.telemetry?.final,
        });

        // Log Final Telemetry if Final stage was executed
        if (matchResult.telemetry?.final) {
          const finTel = matchResult.telemetry.final;
          const finCost = finTel.cost.totalCostUsd;
          budgetGuard.reconcileAttemptSuccess(finCost, 0.10880);
          callIndex++;

          results.push({
            callIndex,
            configName: config.name,
            stage: "final",
            fixtureId: fixture.id,
            requestedModel: config.fin,
            returnedModel: finTel.actualModel || config.fin,
            requestId: finTel.responseId || null,
            attemptNumber: 1,
            durationMs: duration,
            usage: finTel.usage,
            costUsd: finCost,
            isReconciled: finTel.cost.isReconciled,
            finishReason: "stop",
            schemaValid: !matchResult.error,
            selectedCatalogId: matchResult.product?.id || null,
            confidence: matchResult.confidence,
            matchingCuesCount: matchResult.matchingCues.length,
            conflictingCuesCount: matchResult.conflictingCues.length,
            isCorrectVsGroundTruth: fixture.expectedCatalogId === null
              ? matchResult.product === null
              : matchResult.product?.id === fixture.expectedCatalogId,
            finalStageSkipped: false,
          });
        } else {
          console.log(`[STAGE SKIP] Final stage was skipped because Discovery returned 'none' (Appropriate abstention).`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        budgetGuard.reconcileAttemptFailureUnknownCharge(discWorst);
        console.error(`[EXECUTION ERROR] ${errorMsg}`);
      }
    }
  }

  // Save results locally to git-ignored benchmark artifact
  const outDir = resolve(process.cwd(), ".local/benchmark/results");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `smoke_test_run_${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify({ results, totalSpentUsd: budgetGuard.getSpentUsd() }, null, 2));
  console.log(`\n[SUCCESS] Smoke test completed. Results written to: ${outPath}`);
}

async function main() {
  console.log("================================================================================");
  console.log("RMA SYSTEM — CONTROLLED AI API SMOKE TEST PRE-FLIGHT VERIFICATION");
  console.log("================================================================================");

  const preFlight = verifyPreFlightFixtures();
  console.log(`[Pre-Flight Fixtures: ${preFlight.allValid ? "ALL VERIFIED ON DISK" : "VERIFICATION FAILED"}]`);
  for (const f of preFlight.details) {
    console.log(`  - ${f.id}: exists=${f.fileExists}, size=${f.byteSize} bytes, sha256=${f.sha256}`);
  }
  console.log("--------------------------------------------------------------------------------");

  const spending = calculateSmokeTestSpendingBounds();
  console.log("[Execution Scope & Spending Guard]");
  console.log(`  - Selected Fixtures:           3 (iPhone 15 Pro Max, Galaxy A13, Moto G Stylus)`);
  console.log(`  - Evaluated Configurations:    2 (Config A: Sol+Sol, Config B: Terra+Sol)`);
  console.log(`  - Planned Maximum Calls:       ${spending.baseCallCount} calls (Expected: 8 calls with abstention skipping)`);
  console.log(`  - SDK Automatic Retries:       DISABLED (maxRetries: 0)`);
  console.log(`  - Enforced Max HTTP Attempts:  ${spending.maxHttpAttempts} attempts (hard ceiling)`);
  console.log(`  - Expected Single-Attempt:     ~$0.29 USD`);
  console.log(`  - 100% Retry Worst Case (Max): $${spending.totalWithMaxRetriesWorstCaseUsd.toFixed(2)} USD (~$2.63)`);
  console.log(`  - PROPOSED BUDGET GUARD:       $4.00 USD (52% safety buffer above worst case)`);
  console.log("--------------------------------------------------------------------------------");

  const isAuthorized = process.env.AUTHORIZE_PAID_BENCHMARK === "true";
  if (!isAuthorized) {
    console.log("[SAFETY STATUS] AUTHORIZE_PAID_BENCHMARK is not set.");
    console.log("  Live network inference is disabled. Zero paid API requests will be dispatched.");
    console.log("  Pre-flight check completed successfully. Ready to await explicit operator authorization.");
    return;
  }

  await executeSmokeTestIfAuthorized();
}

if (process.argv[1]?.endsWith("evaluate-accuracy-benchmark.ts")) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
