import { describe, it, expect } from "vitest";
import { generateNextRmaNumber } from "@/lib/utils/rma-sequence";

describe("RMA Sequence Generation", () => {
  it("should generate a valid formatted sequential RMA number", async () => {
    const num1 = await generateNextRmaNumber(2026);
    expect(num1).toMatch(/^RMA-2026-\d{6}$/);

    const num2 = await generateNextRmaNumber(2026);
    expect(num2).toMatch(/^RMA-2026-\d{6}$/);

    // Extract sequence integer
    const seq1 = parseInt(num1.split("-")[2], 10);
    const seq2 = parseInt(num2.split("-")[2], 10);
    expect(seq2).toBe(seq1 + 1);
  });

  it("should handle concurrent sequence calls safely without collisions", async () => {
    const count = 10;
    const promises = Array.from({ length: count }, () =>
      generateNextRmaNumber(2026)
    );
    const results = await Promise.all(promises);

    // Ensure all 10 generated numbers are distinct
    const unique = new Set(results);
    expect(unique.size).toBe(count);
  });
});
