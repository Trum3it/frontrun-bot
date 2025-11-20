import type { ClobClient } from '@polymarket/clob-client';
import type { Wallet } from 'ethers';
import type { RuntimeEnv } from '../config/env';
import type { Logger } from '../utils/logger.util';
import type { TradeSignal } from '../domain/trade.types';
import { computeProportionalSizing } from '../config/copy-strategy';
import { postOrder } from '../utils/post-order.util';
import { getUsdBalanceApprox, getPolBalance } from '../utils/get-balance.util';
import { httpGet } from '../utils/fetch-data.util';

export type TradeExecutorDeps = {
  client: ClobClient & { wallet: Wallet };
  proxyWallet: string;
  env: RuntimeEnv;
  logger: Logger;
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
    const { logger, env, client } = this.deps;
    try {
      const yourUsdBalance = await getUsdBalanceApprox(client.wallet, env.usdcContractAddress);
      const polBalance = await getPolBalance(client.wallet);
      const traderBalance = await this.getTraderBalance(signal.trader);

      logger.info(`Balance check - POL: ${polBalance.toFixed(4)} POL, USDC: ${yourUsdBalance.toFixed(2)} USDC`);

      const sizing = computeProportionalSizing({
        yourUsdBalance,
        traderUsdBalance: traderBalance,
        traderTradeUsd: signal.sizeUsd,
        multiplier: env.tradeMultiplier,
      });

      logger.info(
        `${signal.side} ${sizing.targetUsdSize.toFixed(2)} USD`,
      );

      // Balance validation before executing trade
      const requiredUsdc = sizing.targetUsdSize;
      const minPolForGas = 0.01; // Minimum POL needed for gas

      if (signal.side === 'BUY') {
        if (yourUsdBalance < requiredUsdc) {
          logger.error(
            `Insufficient USDC balance. Required: ${requiredUsdc.toFixed(2)} USDC, Available: ${yourUsdBalance.toFixed(2)} USDC`,
          );
          return;
        }
      }

      if (polBalance < minPolForGas) {
        logger.error(
          `Insufficient POL balance for gas. Required: ${minPolForGas} POL, Available: ${polBalance.toFixed(4)} POL`,
        );
        return;
      }

      await postOrder({
        client,
        marketId: signal.marketId,
        tokenId: signal.tokenId,
        outcome: signal.outcome,
        side: signal.side,
        sizeUsd: sizing.targetUsdSize,
      });
      logger.info(`Successfully executed ${signal.side} order for ${sizing.targetUsdSize.toFixed(2)} USD`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('closed') || errorMessage.includes('resolved') || errorMessage.includes('No orderbook')) {
        logger.warn(`Skipping trade - Market ${signal.marketId} is closed or resolved: ${errorMessage}`);
      } else {
        logger.error(`Failed to copy trade: ${errorMessage}`, err as Error);
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

