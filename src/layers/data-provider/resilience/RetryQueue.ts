export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitter?: boolean;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2,
  jitter: true,
  shouldRetry: (error: unknown) => {
    // By default, retry network errors or 5xx/429
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('fetch') ||
        msg.includes('429') ||
        msg.includes('50')
      ) {
        return true;
      }
    }
    return true;
  },
};

/**
 * Executes async operations with exponential backoff and jitter.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      if (attempt > config.maxRetries || !config.shouldRetry(error, attempt)) {
        throw error;
      }

      let delay = config.initialDelayMs * Math.pow(config.backoffFactor, attempt - 1);
      delay = Math.min(delay, config.maxDelayMs);

      if (config.jitter) {
        const jitterMultiplier = 0.8 + Math.random() * 0.4; // 80% to 120%
        delay = Math.round(delay * jitterMultiplier);
      }

      await new Promise<void>(resolve => setTimeout(() => resolve(), delay));
    }
  }
}
