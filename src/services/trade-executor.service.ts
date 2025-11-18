import type { ClobClient } from '@polymarket/clob-client';
import type { RuntimeEnv } from '../config/env';
import type { Logger } from '../utils/logger.util';
import type { TradeSignal } from '../domain/trade.types';
import { computeProportionalSizing } from '../config/copy-strategy';
import { postOrder } from '../utils/post-order.util';
import { getUsdBalanceApprox } from '../utils/get-balance.util';
import { httpGet } from '../utils/fetch-data.util';
import type { PositionTrackerService } from './position-tracker.service';

export type TradeExecutorDeps = {
  client: ClobClient;
  proxyWallet: string;
  env: RuntimeEnv;
  logger: Logger;
  positionTracker?: PositionTrackerService;
};

interface Position {
  conditionId: string;
  initialValue: number;
  currentValue: number;
}

export class TradeExecutorService {
  private readonly deps: TradeExecutorDeps;

  constructor(deps: TradeExecutorDeps) {
    this.deps = deps;
  }

  async copyTrade(signal: TradeSignal): Promise<void> {
    const { logger, env, client, positionTracker } = this.deps;
    let executionSuccess = false;
    let executedSize = 0;

    try {
      const yourUsdBalance = await getUsdBalanceApprox(client.wallet, env.usdcContractAddress);
      const traderBalance = await this.getTraderBalance(signal.trader);

      const sizing = computeProportionalSizing({
        yourUsdBalance,
        traderUsdBalance: traderBalance,
        traderTradeUsd: signal.sizeUsd,
        multiplier: env.tradeMultiplier,
      });

      executedSize = sizing.targetUsdSize;

      logger.info(`${signal.side} ${sizing.targetUsdSize.toFixed(2)} USD on ${signal.marketId} (${signal.outcome})`, {
        trader: signal.trader,
        market: signal.marketId,
        outcome: signal.outcome,
        side: signal.side,
        size: sizing.targetUsdSize,
        price: signal.price,
      });

      await postOrder({
        client,
        marketId: signal.marketId,
        outcome: signal.outcome,
        side: signal.side,
        sizeUsd: sizing.targetUsdSize,
        expectedPrice: signal.price,
        maxSlippagePercent: env.maxSlippagePercent,
        logger,
      });

      executionSuccess = true;

      // Record successful trade
      if (positionTracker) {
        await positionTracker.recordTrade(
          signal,
          sizing.targetUsdSize,
          signal.price,
          'success',
        );
      }

      // Track metrics
      if ('recordTradeSuccess' in logger && typeof logger.recordTradeSuccess === 'function') {
        (logger as any).recordTradeSuccess(sizing.targetUsdSize);
      }
    } catch (err) {
      logger.error('Failed to copy trade', err as Error, {
        trader: signal.trader,
        market: signal.marketId,
        side: signal.side,
      });

      // Record failed trade
      if (positionTracker) {
        await positionTracker.recordTrade(
          signal,
          executedSize,
          signal.price,
          'failed',
          undefined,
          (err as Error).message,
        );
      }

      // Track metrics
      if ('recordTradeFailure' in logger && typeof logger.recordTradeFailure === 'function') {
        (logger as any).recordTradeFailure();
      }
    }
  }

  private async getTraderBalance(trader: string): Promise<number> {
    try {
      const positions: Position[] = await httpGet<Position[]>(
        `https://data-api.polymarket.com/positions?user=${trader}`,
      );
      const totalValue = positions.reduce((sum, pos) => sum + (pos.currentValue || pos.initialValue || 0), 0);
      return Math.max(100, totalValue);
    } catch {
      return 1000;
    }
  }
}

