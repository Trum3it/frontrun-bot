import type { ClobClient } from '@polymarket/clob-client';
import { OrderType, Side } from '@polymarket/clob-client';
import type { Logger } from './logger.util';

export type OrderSide = 'BUY' | 'SELL';
export type OrderOutcome = 'YES' | 'NO';

export type PostOrderInput = {
  client: ClobClient;
  marketId: string;
  outcome: OrderOutcome;
  side: OrderSide;
  sizeUsd: number;
  expectedPrice?: number; // Price from trade signal
  maxSlippagePercent?: number; // Maximum allowed slippage (default: 2%)
  maxAcceptablePrice?: number; // Absolute price limit (overrides slippage)
  logger?: Logger;
};

export async function postOrder(input: PostOrderInput): Promise<void> {
  const {
    client,
    marketId,
    outcome,
    side,
    sizeUsd,
    expectedPrice,
    maxSlippagePercent = 2.0,
    maxAcceptablePrice,
    logger,
  } = input;

  const market = await client.getMarket(marketId);
  if (!market) {
    throw new Error(`Market not found: ${marketId}`);
  }

  const outcomeIndex = outcome === 'YES' ? 0 : 1;
  const tokenId = market.tokens[outcomeIndex];

  const orderBook = await client.getOrderBook(tokenId);
  const isBuy = side === 'BUY';
  const levels = isBuy ? orderBook.asks : orderBook.bids;

  if (!levels || levels.length === 0) {
    throw new Error(`No ${isBuy ? 'asks' : 'bids'} available for token ${tokenId}`);
  }

  const bestPrice = parseFloat(levels[0].price);

  // Calculate slippage if expected price is provided
  if (expectedPrice) {
    const slippage = isBuy
      ? ((bestPrice - expectedPrice) / expectedPrice) * 100
      : ((expectedPrice - bestPrice) / expectedPrice) * 100;

    if (slippage > 0) {
      logger?.warn(`Slippage detected: ${slippage.toFixed(2)}%`, {
        market: marketId,
        side,
        expectedPrice,
        bestPrice,
        slippage: `${slippage.toFixed(2)}%`,
      });

      if (slippage > maxSlippagePercent) {
        throw new Error(
          `Slippage protection: ${slippage.toFixed(2)}% exceeds maximum ${maxSlippagePercent}% (expected: ${expectedPrice}, actual: ${bestPrice})`,
        );
      }
    }
  }

  // Absolute price protection (overrides slippage check)
  if (
    maxAcceptablePrice &&
    ((isBuy && bestPrice > maxAcceptablePrice) || (!isBuy && bestPrice < maxAcceptablePrice))
  ) {
    throw new Error(
      `Price protection: best price ${bestPrice} exceeds max acceptable ${maxAcceptablePrice}`,
    );
  }

  const orderSide = isBuy ? Side.BUY : Side.SELL;
  let remaining = sizeUsd;
  let retryCount = 0;
  const maxRetries = 3;

  while (remaining > 0.01 && retryCount < maxRetries) {
    const currentOrderBook = await client.getOrderBook(tokenId);
    const currentLevels = isBuy ? currentOrderBook.asks : currentOrderBook.bids;

    if (!currentLevels || currentLevels.length === 0) {
      break;
    }

    const level = currentLevels[0];
    const levelPrice = parseFloat(level.price);
    const levelSize = parseFloat(level.size);

    let orderSize: number;
    let orderValue: number;

    if (isBuy) {
      const levelValue = levelSize * levelPrice;
      orderValue = Math.min(remaining, levelValue);
      orderSize = orderValue / levelPrice;
    } else {
      const levelValue = levelSize * levelPrice;
      orderValue = Math.min(remaining, levelValue);
      orderSize = orderValue / levelPrice;
    }

    const orderArgs = {
      side: orderSide,
      tokenID: tokenId,
      amount: orderSize,
      price: levelPrice,
    };

    try {
      const signedOrder = await client.createMarketOrder(orderArgs);
      const response = await client.postOrder(signedOrder, OrderType.FOK);

      if (response.success) {
        remaining -= orderValue;
        retryCount = 0;
      } else {
        retryCount++;
      }
    } catch (error) {
      retryCount++;
      if (retryCount >= maxRetries) {
        throw error;
      }
    }
  }
}

