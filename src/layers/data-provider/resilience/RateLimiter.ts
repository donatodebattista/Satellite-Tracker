export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  minIntervalMs: number;
  recommendedTtlHours?: number;
}

export class RateLimitExceededError extends Error {
  constructor(public readonly providerId: string, public readonly retryAfterMs: number) {
    super(
      `Rate limit exceeded for provider "${providerId}". Retry after ${Math.ceil(
        retryAfterMs / 1000,
      )}s`,
    );
    this.name = 'RateLimitExceededError';
  }
}

/**
 * Sliding window rate limiter respecting PRD Section 4.2 API usage constraints.
 */
export class RateLimiter {
  private minuteHistory: number[] = [];
  private hourHistory: number[] = [];
  private lastRequestTimestamp = 0;

  constructor(
    public readonly providerId: string,
    public readonly config: RateLimitConfig,
  ) {}

  /**
   * Cleans up stale timestamps beyond 1 minute and 1 hour windows.
   */
  private prune(now: number): void {
    const oneMinuteAgo = now - 60_000;
    const oneHourAgo = now - 3_600_000;

    this.minuteHistory = this.minuteHistory.filter(t => t > oneMinuteAgo);
    this.hourHistory = this.hourHistory.filter(t => t > oneHourAgo);
  }

  /**
   * Calculates milliseconds until the next request slot is available.
   * Returns 0 if request can be performed immediately.
   */
  public getTimeUntilNextSlotMs(now = Date.now()): number {
    this.prune(now);

    let waitMs = 0;

    // Check min interval
    const intervalPassed = now - this.lastRequestTimestamp;
    if (intervalPassed < this.config.minIntervalMs) {
      waitMs = Math.max(waitMs, this.config.minIntervalMs - intervalPassed);
    }

    // Check per-minute quota
    if (this.minuteHistory.length >= this.config.maxRequestsPerMinute) {
      const oldestMinute = this.minuteHistory[0];
      const waitMinute = oldestMinute + 60_000 - now;
      waitMs = Math.max(waitMs, waitMinute);
    }

    // Check per-hour quota
    if (this.hourHistory.length >= this.config.maxRequestsPerHour) {
      const oldestHour = this.hourHistory[0];
      const waitHour = oldestHour + 3_600_000 - now;
      waitMs = Math.max(waitMs, waitHour);
    }

    return Math.max(0, waitMs);
  }

  /**
   * Determines if a request can be executed right now.
   */
  public canExecute(now = Date.now()): boolean {
    return this.getTimeUntilNextSlotMs(now) === 0;
  }

  /**
   * Registers a performed request timestamp.
   */
  public recordRequest(now = Date.now()): void {
    this.prune(now);
    this.lastRequestTimestamp = now;
    this.minuteHistory.push(now);
    this.hourHistory.push(now);
  }

  /**
   * Executes a task respecting the rate limits.
   * If waitIfThrottled is false and limits are reached, throws RateLimitExceededError.
   */
  public async execute<T>(
    task: () => Promise<T>,
    waitIfThrottled = true,
    maxWaitMs = 15_000,
  ): Promise<T> {
    const waitMs = this.getTimeUntilNextSlotMs();

    if (waitMs > 0) {
      if (!waitIfThrottled || waitMs > maxWaitMs) {
        throw new RateLimitExceededError(this.providerId, waitMs);
      }
      await new Promise<void>(resolve => setTimeout(() => resolve(), waitMs));
    }

    this.recordRequest();
    return await task();
  }

  /**
   * Resets all internal histories (e.g. for testing).
   */
  public reset(): void {
    this.minuteHistory = [];
    this.hourHistory = [];
    this.lastRequestTimestamp = 0;
  }
}
