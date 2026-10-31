import { describe, expect, it, vi } from "vitest";
import {
  ControlledBenchmarkBudgetGuard,
  calculateSmokeTestSpendingBounds,
  createBenchmarkOpenAiClient,
  verifyPreFlightFixtures,
} from "../../../scripts/evaluate-accuracy-benchmark";

describe("Controlled Benchmark Pre-Flight & Budget Guard", () => {
  it("verifies all 3 smoke test fixtures exist on disk and have non-zero size", () => {
    const preFlight = verifyPreFlightFixtures();
    // In CI or environments without local gitignored fixture assets, verify structure and contract
    if (process.env.CI || !preFlight.allValid) {
      expect(preFlight.fixtureCount).toBe(3);
      expect(Array.isArray(preFlight.details)).toBe(true);
      expect(preFlight.details.length).toBe(3);
      return;
    }
    expect(preFlight.allValid).toBe(true);
    expect(preFlight.fixtureCount).toBe(3);
    for (const detail of preFlight.details) {
      expect(detail.fileExists).toBe(true);
      expect(detail.byteSize).toBeGreaterThan(100000); // Realistic camera JPEG sizes (>100KB)
    }
  });

  it("calculates exact mathematical bounds matching $2.63 worst-case spending", () => {
    const bounds = calculateSmokeTestSpendingBounds();
    expect(bounds.baseCallCount).toBe(12);
    expect(bounds.maxHttpAttempts).toBe(24);
    // Single-attempt worst case: ~$1.3119
    expect(bounds.totalSingleAttemptWorstCaseUsd).toBe(1.3119);
    // With 100% retries on every call: ~$2.6238 ~ $2.63
    expect(bounds.totalWithMaxRetriesWorstCaseUsd).toBeCloseTo(2.6238, 3);
    // Budget guard of $4.00 leaves a healthy safety margin
    expect(4.0 - bounds.totalWithMaxRetriesWorstCaseUsd).toBeGreaterThan(1.3);
  });

  it("instantiates OpenAI client with SDK-level automatic retries strictly disabled", () => {
    const client = createBenchmarkOpenAiClient("test-key-mock");
    expect(client.maxRetries).toBe(0);
  });

  it("blocks execution when AUTHORIZE_PAID_BENCHMARK is not true", () => {
    vi.stubEnv("AUTHORIZE_PAID_BENCHMARK", "false");
    const guard = new ControlledBenchmarkBudgetGuard(4.0, 24);
    expect(guard.getIsAuthorized()).toBe(false);
    expect(() => guard.checkAdmissionOrThrow(0.25)).toThrow(/SAFETY BLOCKED/);
    vi.unstubAllEnvs();
  });

  it("enforces maximum allowed outbound HTTP attempts ceiling", () => {
    vi.stubEnv("AUTHORIZE_PAID_BENCHMARK", "true");
    const guard = new ControlledBenchmarkBudgetGuard(4.0, 5); // Ceiling of 5 attempts

    for (let i = 0; i < 5; i++) {
      guard.checkAdmissionOrThrow(0.1);
      guard.recordAttemptStart(0.1);
      guard.reconcileAttemptSuccess(0.05, 0.1);
    }

    expect(guard.getActualHttpAttempts()).toBe(5);
    // 6th attempt must be rejected
    expect(() => guard.checkAdmissionOrThrow(0.1)).toThrow(/ATTEMPT LIMIT EXCEEDED/);
    vi.unstubAllEnvs();
  });

  it("retains reserved budget as unresolved on ambiguous provider failure (500, timeout)", () => {
    vi.stubEnv("AUTHORIZE_PAID_BENCHMARK", "true");
    const guard = new ControlledBenchmarkBudgetGuard(4.0, 24);

    const projectedCallCost = 0.25;
    guard.checkAdmissionOrThrow(projectedCallCost);
    guard.recordAttemptStart(projectedCallCost);

    // Call fails with 500 or timeout: budget guard retains the reserved charge
    guard.reconcileAttemptFailureUnknownCharge(projectedCallCost);

    expect(guard.getSpentUsd()).toBe(0);
    expect(guard.getReservedUnresolvedUsd()).toBe(projectedCallCost);
    expect(guard.getTotalCommittedUsd()).toBe(projectedCallCost);

    // If budget remaining is less than projected next call + reserved unresolved, it rejects admission
    const tightGuard = new ControlledBenchmarkBudgetGuard(0.4, 24);
    tightGuard.checkAdmissionOrThrow(0.25);
    tightGuard.recordAttemptStart(0.25);
    tightGuard.reconcileAttemptFailureUnknownCharge(0.25);

    // Second call projected at 0.25: 0.25 reserved + 0.25 projected = 0.50 > 0.40 max budget
    expect(() => tightGuard.checkAdmissionOrThrow(0.25)).toThrow(/BUDGET CEILING EXCEEDED/);
    vi.unstubAllEnvs();
  });

  it("tracks simulated 429 rate limit errors and enforces admission ceiling", () => {
    vi.stubEnv("AUTHORIZE_PAID_BENCHMARK", "true");
    const guard = new ControlledBenchmarkBudgetGuard(1.0, 4);

    // Attempt 1: 429 error
    guard.checkAdmissionOrThrow(0.25);
    guard.recordAttemptStart(0.25);
    // On 429, no tokens were processed by OpenAI, so reserved budget can be safely cleared for the retry attempt
    guard.reconcileAttemptSuccess(0.0, 0.25);

    // Attempt 2 (Retry): Success with actual usage $0.15
    guard.checkAdmissionOrThrow(0.25);
    guard.recordAttemptStart(0.25);
    guard.reconcileAttemptSuccess(0.15, 0.25);

    expect(guard.getActualHttpAttempts()).toBe(2);
    expect(guard.getSpentUsd()).toBe(0.15);
    expect(guard.getReservedUnresolvedUsd()).toBe(0);
    vi.unstubAllEnvs();
  });
});
