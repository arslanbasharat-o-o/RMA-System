import { describe, expect, it } from "vitest";
import { sameDeviceIdentity, percentile } from "@/lib/recognition/evaluation";

describe("recognition benchmark integrity", () => {
  it.each([
    ["Apple", "iPhone 15 Pro Max", "Apple", "iPhone 15 Pro"],
    ["Apple", "iPhone XR", "Apple", "iPhone X"],
    ["Apple", "iPhone 12 Pro Max", "Apple", "iPhone 12"],
    ["Apple", "iPad Pro 11 3rd Gen", "Apple", "iPad Pro 11 1st Gen"],
    ["Apple", "iPhone SE 2nd Gen", "Apple", "iPhone SE 3rd Gen"],
    ["Samsung", "Galaxy S21 Ultra", "Samsung", "Galaxy S21"],
    ["Samsung", "Galaxy S23+", "Samsung", "Galaxy S23"],
    ["Apple", "iPhone 8", "", "iPhone 8"],
    ["Apple", "iPhone 8", "Apple", ""],
  ])("rejects incorrect or incomplete variant %s %s vs %s %s", (a, b, c, d) => {
    expect(sameDeviceIdentity(a, b, c, d)).toBe(false);
  });
  it("allows formatting and repeated manufacturer normalization only", () => {
    expect(sameDeviceIdentity("Samsung", "Galaxy S21 Ultra", "Samsung", "Samsung S21 Ultra")).toBe(true);
    expect(sameDeviceIdentity("Apple", "iPhone 15 Pro Max", "Apple", "Apple iPhone15 Pro Max")).toBe(true);
    expect(sameDeviceIdentity("Samsung", "Galaxy S23+", "Samsung", "Galaxy S23 Plus")).toBe(true);
  });
  it("includes the slowest tail in p95", () => {
    expect(percentile([1, 2, 3, 100], 0.95)).toBe(100);
    expect(percentile([], 0.5)).toBeNull();
  });
});
