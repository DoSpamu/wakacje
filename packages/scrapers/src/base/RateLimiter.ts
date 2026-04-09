import { sleep } from './retry.js';

/**
 * Simple token-bucket rate limiter.
 * Ensures we don't exceed N requests per window per domain.
 */
export class RateLimiter {
  private readonly requestsPerWindow: number;
  private readonly windowMs: number;
  private readonly minDelayMs: number;
  private requestTimestamps: number[] = [];
  private lastRequestTime = 0;

  constructor(options: {
    requestsPerWindow?: number;
    windowMs?: number;
    minDelayMs?: number;
  } = {}) {
    this.requestsPerWindow = options.requestsPerWindow ?? 10;
    this.windowMs = options.windowMs ?? 60_000;
    this.minDelayMs = options.minDelayMs ?? 2000;
  }

  async acquire(): Promise<void> {
    // Enforce minimum delay between consecutive requests
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < this.minDelayMs) {
      await sleep(this.minDelayMs - timeSinceLast);
    }

    // Enforce window rate
    const windowStart = Date.now() - this.windowMs;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > windowStart);

    if (this.requestTimestamps.length >= this.requestsPerWindow) {
      const oldest = this.requestTimestamps[0]!;
      const waitUntil = oldest + this.windowMs;
      const waitMs = waitUntil - Date.now();
      if (waitMs > 0) await sleep(waitMs);
    }

    this.requestTimestamps.push(Date.now());
    this.lastRequestTime = Date.now();
  }
}
