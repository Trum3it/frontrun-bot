import chalk from 'chalk';

export type LogContext = Record<string, unknown>;

export interface Logger {
  info: (msg: string, context?: LogContext) => void;
  warn: (msg: string, context?: LogContext) => void;
  error: (msg: string, err?: Error, context?: LogContext) => void;
  debug: (msg: string, context?: LogContext) => void;
}

export type LogMetrics = {
  tradesExecuted: number;
  tradesFailed: number;
  totalVolumeUsd: number;
  lastTradeTime?: Date;
  apiErrors: number;
  executionErrors: number;
};

export class ConsoleLogger implements Logger {
  private debugEnabled: boolean;
  private metrics: LogMetrics;

  constructor(debugEnabled: boolean = false) {
    this.debugEnabled = debugEnabled || process.env.DEBUG === '1';
    this.metrics = {
      tradesExecuted: 0,
      tradesFailed: 0,
      totalVolumeUsd: 0,
      apiErrors: 0,
      executionErrors: 0,
    };
  }

  private formatMessage(level: string, msg: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `${timestamp} ${level} ${msg}${contextStr}`;
  }

  info(msg: string, context?: LogContext): void {
    const formatted = this.formatMessage('[INFO]', msg, context);
    // eslint-disable-next-line no-console
    console.log(chalk.cyan(formatted));
  }

  warn(msg: string, context?: LogContext): void {
    const formatted = this.formatMessage('[WARN]', msg, context);
    // eslint-disable-next-line no-console
    console.warn(chalk.yellow(formatted));
  }

  error(msg: string, err?: Error, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: err?.message,
      stack: err?.stack,
    };
    const formatted = this.formatMessage('[ERROR]', msg, errorContext);
    // eslint-disable-next-line no-console
    console.error(chalk.red(formatted));

    // Track metrics
    if (msg.includes('API') || msg.includes('fetch')) {
      this.metrics.apiErrors++;
    } else if (msg.includes('trade') || msg.includes('execution')) {
      this.metrics.executionErrors++;
    }
  }

  debug(msg: string, context?: LogContext): void {
    if (this.debugEnabled) {
      const formatted = this.formatMessage('[DEBUG]', msg, context);
      // eslint-disable-next-line no-console
      console.debug(chalk.gray(formatted));
    }
  }

  // Metrics tracking methods
  recordTradeSuccess(volumeUsd: number): void {
    this.metrics.tradesExecuted++;
    this.metrics.totalVolumeUsd += volumeUsd;
    this.metrics.lastTradeTime = new Date();
  }

  recordTradeFailure(): void {
    this.metrics.tradesFailed++;
  }

  getMetrics(): LogMetrics {
    return { ...this.metrics };
  }

  logMetrics(): void {
    const successRate =
      this.metrics.tradesExecuted + this.metrics.tradesFailed > 0
        ? (this.metrics.tradesExecuted / (this.metrics.tradesExecuted + this.metrics.tradesFailed)) * 100
        : 0;

    this.info('Metrics Summary', {
      tradesExecuted: this.metrics.tradesExecuted,
      tradesFailed: this.metrics.tradesFailed,
      successRate: `${successRate.toFixed(2)}%`,
      totalVolume: `$${this.metrics.totalVolumeUsd.toFixed(2)}`,
      apiErrors: this.metrics.apiErrors,
      executionErrors: this.metrics.executionErrors,
      lastTrade: this.metrics.lastTradeTime?.toISOString() || 'N/A',
    });
  }
}

