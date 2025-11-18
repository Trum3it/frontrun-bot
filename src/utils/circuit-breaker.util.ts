import type { Logger } from './logger.util';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Circuit is open, rejecting requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export type CircuitBreakerOptions = {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes to close from half-open
  timeout: number; // Time in ms before attempting to close
  logger?: Logger;
  name?: string;
};

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        const error = new Error(
          `Circuit breaker is OPEN for ${this.options.name || 'operation'}. Try again later.`,
        );
        this.options.logger?.warn('Circuit breaker blocked request', {
          name: this.options.name,
          state: this.state,
        });
        throw error;
      }
      // Try to recover
      this.state = CircuitBreakerState.HALF_OPEN;
      this.successCount = 0;
      this.options.logger?.info(`Circuit breaker entering HALF_OPEN state`, {
        name: this.options.name,
      });
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitBreakerState.CLOSED;
        this.successCount = 0;
        this.options.logger?.info(`Circuit breaker closed`, {
          name: this.options.name,
        });
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttempt = Date.now() + this.options.timeout;
      this.successCount = 0;
      this.options.logger?.warn(`Circuit breaker reopened after half-open failure`, {
        name: this.options.name,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttempt = Date.now() + this.options.timeout;
      this.options.logger?.error(
        `Circuit breaker opened after ${this.failureCount} failures`,
        undefined,
        {
          name: this.options.name,
          nextAttempt: new Date(this.nextAttempt).toISOString(),
        },
      );
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStats(): { state: CircuitBreakerState; failureCount: number; successCount: number } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.options.logger?.info(`Circuit breaker manually reset`, {
      name: this.options.name,
    });
  }
}
