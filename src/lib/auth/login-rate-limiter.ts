const WINDOW_MS = 60_000;
const MAX_FAILURES = 10;
const MAX_TRACKED_ADDRESSES = 10_000;

type AttemptWindow = { count: number; startedAt: number };

export class LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptWindow>();
  private operations = 0;

  isLimited(address: string, now = Date.now()): boolean {
    this.sweepOccasionally(now);
    const current = this.attempts.get(address);
    if (!current) return false;
    if (now - current.startedAt >= WINDOW_MS) {
      this.attempts.delete(address);
      return false;
    }
    return current.count >= MAX_FAILURES;
  }

  recordFailure(address: string, now = Date.now()): void {
    this.sweepOccasionally(now);
    let current = this.attempts.get(address);
    if (!current || now - current.startedAt >= WINDOW_MS) {
      current = { count: 0, startedAt: now };
    }

    current.count += 1;
    this.attempts.delete(address);
    this.attempts.set(address, current);

    if (this.attempts.size > MAX_TRACKED_ADDRESSES) {
      const oldestAddress = this.attempts.keys().next().value;
      if (oldestAddress !== undefined) this.attempts.delete(oldestAddress);
    }
  }

  clear(address: string): void {
    this.attempts.delete(address);
  }

  trackedAddressCount(): number {
    return this.attempts.size;
  }

  private sweepOccasionally(now: number): void {
    this.operations += 1;
    if (this.operations % 256 !== 0) return;

    for (const [address, window] of this.attempts) {
      if (now - window.startedAt >= WINDOW_MS) this.attempts.delete(address);
    }
  }
}

export const loginRateLimiter = new LoginRateLimiter();

/** The reverse proxy must overwrite X-Real-IP with the connecting client address. */
export function getTrustedClientAddress(headers: Headers): string {
  return headers.get("x-real-ip")?.trim() || "local";
}
