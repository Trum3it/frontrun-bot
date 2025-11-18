import 'dotenv/config';
import { loadEnv } from '../config/env';
import { createPolymarketClient } from '../infrastructure/clob-client.factory';
import { TradeMonitorService } from '../services/trade-monitor.service';
import { TradeExecutorService } from '../services/trade-executor.service';
import { PositionTrackerService } from '../services/position-tracker.service';
import { Database } from '../infrastructure/database';
import { HealthCheckServer } from '../infrastructure/health-check.server';
import { ConsoleLogger } from '../utils/logger.util';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = new ConsoleLogger(env.debugEnabled);

  logger.info('Starting Polymarket Copy Trading Bot');

  // Initialize database connection
  const database = new Database({ mongoUri: env.mongoUri, logger });
  const dbConnected = await database.connect();

  // Initialize position tracker
  let positionTracker: PositionTrackerService | undefined;
  if (dbConnected) {
    positionTracker = new PositionTrackerService({
      followerAddress: env.proxyWallet,
      logger,
      enabled: true,
    });
    logger.info('Position tracking enabled');
  } else {
    logger.warn('Position tracking disabled (no database connection)');
  }

  const client = await createPolymarketClient({ rpcUrl: env.rpcUrl, privateKey: env.privateKey });
  const executor = new TradeExecutorService({
    client,
    proxyWallet: env.proxyWallet,
    logger,
    env,
    positionTracker,
  });

  const monitor = new TradeMonitorService({
    client,
    logger,
    env,
    userAddresses: env.userAddresses,
    onDetectedTrade: async (signal) => {
      await executor.copyTrade(signal);
    },
  });

  // Initialize health check server
  const healthCheckServer = new HealthCheckServer({
    port: env.healthCheckPort,
    logger,
    database,
    getMetrics: () => {
      if ('getMetrics' in logger && typeof logger.getMetrics === 'function') {
        return (logger as any).getMetrics();
      }
      return {};
    },
  });
  healthCheckServer.start();

  // Graceful shutdown handler
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    monitor.stop();
    healthCheckServer.stop();
    await database.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Log metrics every 5 minutes
  setInterval(() => {
    if ('logMetrics' in logger && typeof logger.logMetrics === 'function') {
      (logger as any).logMetrics();
    }
  }, 5 * 60 * 1000);

  await monitor.start();
}

main().catch((err) => {
  console.error('Fatal error', err);
  process.exit(1);
});

