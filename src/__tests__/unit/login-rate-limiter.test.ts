import { describe, expect, it } from "vitest";
import { getTrustedClientAddress, LoginRateLimiter } from "@/lib/auth/login-rate-limiter";

describe("login rate limiter", () => {
  it("uses the reverse proxy's client address, not a spoofable forwarded chain", () => {
    const headers = new Headers({
      "x-real-ip": "198.51.100.24",
      "x-forwarded-for": "203.0.113.1, 198.51.100.24",
    });

    expect(getTrustedClientAddress(headers)).toBe("198.51.100.24");
    expect(getTrustedClientAddress(new Headers({ "x-forwarded-for": "203.0.113.2" }))).toBe("local");
  });

  it("limits after ten failures, expires the window, and clears after a successful login", () => {
    const limiter = new LoginRateLimiter();
    const now = 1_000_000;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(limiter.isLimited("198.51.100.24", now)).toBe(false);
      limiter.recordFailure("198.51.100.24", now);
    }
    expect(limiter.isLimited("198.51.100.24", now)).toBe(true);
    expect(limiter.isLimited("198.51.100.24", now + 60_000)).toBe(false);

    limiter.recordFailure("198.51.100.24", now);
    limiter.clear("198.51.100.24");
    expect(limiter.isLimited("198.51.100.24", now)).toBe(false);
  });

  it("keeps the tracked address map bounded", () => {
    const limiter = new LoginRateLimiter();
    for (let address = 0; address <= 10_000; address += 1) {
      limiter.recordFailure(`198.51.${Math.floor(address / 256)}.${address % 256}`, 1_000_000);
    }

    expect(limiter.trackedAddressCount()).toBeLessThanOrEqual(10_000);
  });
});
