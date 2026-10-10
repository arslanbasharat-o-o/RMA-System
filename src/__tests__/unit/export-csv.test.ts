import { describe, it, expect } from "vitest";
import { sanitizeCsvCell, buildCsv } from "@/lib/utils/export-csv";

describe("CSV Export Formula Injection Sanitization", () => {
  it("should prepend single quote to cells beginning with dangerous characters", () => {
    expect(sanitizeCsvCell("=1+1")).toBe(`"'=1+1"`);
    expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).toBe(`"'+cmd|' /C calc'!A0"`);
    expect(sanitizeCsvCell("-SUM(A1:B10)")).toBe(`"'-SUM(A1:B10)"`);
    expect(sanitizeCsvCell("@alert(1)")).toBe(`"'@alert(1)"`);
  });

  it("should escape quotes by doubling them", () => {
    expect(sanitizeCsvCell('Screen "Grade A" OLED')).toBe('"Screen ""Grade A"" OLED"');
  });

  it("should correctly serialize safe tabular records", () => {
    const headers = ["ID", "Model", "Price"];
    const rows = [
      ["1", "iPhone 13 Pro", 120],
      ["2", "=malicious()", 95],
    ];

    const csv = buildCsv(headers, rows);
    expect(csv).toContain("ID,Model,Price");
    expect(csv).toContain("1,iPhone 13 Pro,120");
    expect(csv).toContain(`2,"'=malicious()",95`);
  });
});
