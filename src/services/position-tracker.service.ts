import type { Logger } from '../utils/logger.util';
import { TradeModel, ITrade } from '../domain/models/trade.model';
import { PositionModel, IPosition } from '../domain/models/position.model';
import type { TradeSignal } from '../domain/trade.types';

export type PositionTrackerDeps = {
  followerAddress: string;
  logger: Logger;
  enabled: boolean;
};

export class PositionTrackerService {
  private readonly deps: PositionTrackerDeps;

  constructor(deps: PositionTrackerDeps) {
    this.deps = deps;
  }

  /**
   * Records a trade execution and updates the corresponding position
   */
  async recordTrade(
    signal: TradeSignal,
    executedSizeUsd: number,
    executedPrice: number,
    status: 'success' | 'failed',
    transactionHash?: string,
    errorMessage?: string,
  ): Promise<void> {
    if (!this.deps.enabled) {
      return;
    }

    try {
      // Create trade record
      const trade = await TradeModel.create({
        trader: signal.trader,
        follower: this.deps.followerAddress,
        marketId: signal.marketId,
        outcome: signal.outcome,
        side: signal.side,
        sizeUsd: executedSizeUsd,
        price: executedPrice,
        executedAt: new Date(signal.timestamp),
        transactionHash,
        status,
        errorMessage,
      });

      // Update position only if trade was successful
      if (status === 'success') {
        await this.updatePosition(signal, executedSizeUsd, executedPrice);
      }

      this.deps.logger.debug(`Recorded trade: ${trade._id}`);
    } catch (err) {
      this.deps.logger.error('Failed to record trade', err as Error);
    }
  }

  /**
   * Updates position based on a successful trade
   */
  private async updatePosition(
    signal: TradeSignal,
    sizeUsd: number,
    price: number,
  ): Promise<void> {
    const { followerAddress } = this.deps;
    const { marketId, outcome, side } = signal;

    try {
      // Find or create position
      let position = await PositionModel.findOne({
        follower: followerAddress,
        marketId,
        outcome,
      });

      if (!position) {
        position = new PositionModel({
          follower: followerAddress,
          marketId,
          outcome,
          totalSizeUsd: 0,
          averagePrice: 0,
          currentSize: 0,
          realizedPnL: 0,
          unrealizedPnL: 0,
          isOpen: true,
        });
      }

      if (side === 'BUY') {
        // Add to position
        const newTotalSize = position.currentSize + sizeUsd / price;
        const newTotalCost = position.totalSizeUsd + sizeUsd;

        position.currentSize = newTotalSize;
        position.totalSizeUsd = newTotalCost;
        position.averagePrice = newTotalCost / newTotalSize;
        position.isOpen = true;
      } else {
        // SELL - reduce position
        const sellSize = sizeUsd / price;
        const costBasis = sellSize * position.averagePrice;
        const pnl = sizeUsd - costBasis;

        position.currentSize = Math.max(0, position.currentSize - sellSize);
        position.totalSizeUsd = Math.max(0, position.totalSizeUsd - costBasis);
        position.realizedPnL += pnl;

        // Close position if size is near zero
        if (position.currentSize < 0.01) {
          position.isOpen = false;
          position.currentSize = 0;
          position.totalSizeUsd = 0;
        }
      }

      position.lastUpdated = new Date();
      await position.save();

      this.deps.logger.debug(
        `Updated position for ${marketId} ${outcome}: size=${position.currentSize.toFixed(2)}, avg=${position.averagePrice.toFixed(3)}`,
      );
    } catch (err) {
      this.deps.logger.error('Failed to update position', err as Error);
    }
  }

  /**
   * Gets all open positions for the follower
   */
  async getOpenPositions(): Promise<IPosition[]> {
    if (!this.deps.enabled) {
      return [];
    }

    try {
      return await PositionModel.find({
        follower: this.deps.followerAddress,
        isOpen: true,
      }).sort({ lastUpdated: -1 });
    } catch (err) {
      this.deps.logger.error('Failed to fetch open positions', err as Error);
      return [];
    }
  }

  /**
   * Gets trade history for the follower
   */
  async getTradeHistory(limit: number = 100): Promise<ITrade[]> {
    if (!this.deps.enabled) {
      return [];
    }

    try {
      return await TradeModel.find({
        follower: this.deps.followerAddress,
        status: 'success',
      })
        .sort({ executedAt: -1 })
        .limit(limit);
    } catch (err) {
      this.deps.logger.error('Failed to fetch trade history', err as Error);
      return [];
    }
  }

  /**
   * Calculates total PnL (realized + unrealized)
   */
  async getTotalPnL(): Promise<{ realized: number; unrealized: number; total: number }> {
    if (!this.deps.enabled) {
      return { realized: 0, unrealized: 0, total: 0 };
    }

    try {
      const positions = await PositionModel.find({
        follower: this.deps.followerAddress,
      });

      const realized = positions.reduce((sum, pos) => sum + pos.realizedPnL, 0);
      const unrealized = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);

      return {
        realized,
        unrealized,
        total: realized + unrealized,
      };
    } catch (err) {
      this.deps.logger.error('Failed to calculate PnL', err as Error);
      return { realized: 0, unrealized: 0, total: 0 };
    }
  }
}
