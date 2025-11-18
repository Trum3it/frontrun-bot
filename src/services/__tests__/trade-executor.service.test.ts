import { TradeExecutorService, TradeExecutorDeps } from '../trade-executor.service';
import type { ClobClient } from '@polymarket/clob-client';
import type { RuntimeEnv } from '../../config/env';
import type { Logger } from '../../utils/logger.util';
import type { TradeSignal } from '../../domain/trade.types';
import type { Wallet } from 'ethers';

// Mock dependencies
jest.mock('../../utils/get-balance.util', () => ({
  getUsdBalanceApprox: jest.fn(),
}));

jest.mock('../../utils/post-order.util', () => ({
  postOrder: jest.fn(),
}));

jest.mock('../../utils/fetch-data.util', () => ({
  httpGet: jest.fn(),
}));

import { getUsdBalanceApprox } from '../../utils/get-balance.util';
import { postOrder } from '../../utils/post-order.util';
import { httpGet } from '../../utils/fetch-data.util';

const mockGetBalance = getUsdBalanceApprox as jest.MockedFunction<typeof getUsdBalanceApprox>;
const mockPostOrder = postOrder as jest.MockedFunction<typeof postOrder>;
const mockHttpGet = httpGet as jest.MockedFunction<typeof httpGet>;

describe('TradeExecutorService', () => {
  let mockClient: jest.Mocked<ClobClient>;
  let mockEnv: RuntimeEnv;
  let mockLogger: jest.Mocked<Logger>;
  let deps: TradeExecutorDeps;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      wallet: {} as Wallet,
    } as jest.Mocked<ClobClient>;

    mockEnv = {
      userAddresses: ['0xtrader1'],
      proxyWallet: '0xmywallet',
      privateKey: 'test-key',
      rpcUrl: 'http://test-rpc',
      fetchIntervalSeconds: 1,
      tradeMultiplier: 1.0,
      retryLimit: 3,
      aggregationEnabled: false,
      aggregationWindowSeconds: 300,
      usdcContractAddress: '0xusdc',
      debugEnabled: false,
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    deps = {
      client: mockClient,
      proxyWallet: mockEnv.proxyWallet,
      env: mockEnv,
      logger: mockLogger,
    };
  });

  describe('copyTrade', () => {
    it('should execute trade with correct sizing', async () => {
      const signal: TradeSignal = {
        trader: '0xtrader1',
        marketId: 'market-123',
        outcome: 'YES',
        side: 'BUY',
        sizeUsd: 100,
        price: 0.5,
        timestamp: Date.now(),
      };

      mockGetBalance.mockResolvedValue(1000); // Your balance
      mockHttpGet.mockResolvedValue([
        { conditionId: 'market-1', initialValue: 500, currentValue: 600 },
        { conditionId: 'market-2', initialValue: 300, currentValue: 400 },
      ]); // Trader balance = 1000
      mockPostOrder.mockResolvedValue();

      const service = new TradeExecutorService(deps);
      await service.copyTrade(signal);

      expect(mockGetBalance).toHaveBeenCalledWith(mockClient.wallet, '0xusdc');
      expect(mockHttpGet).toHaveBeenCalledWith(
        'https://data-api.polymarket.com/positions?user=0xtrader1',
      );

      expect(mockPostOrder).toHaveBeenCalledWith({
        client: mockClient,
        marketId: 'market-123',
        outcome: 'YES',
        side: 'BUY',
        sizeUsd: expect.any(Number),
      });

      // Verify sizing calculation
      const call = mockPostOrder.mock.calls[0][0];
      // ratio = 1000 / (1000 + 100) = 0.909
      // targetSize = 100 * 0.909 * 1.0 = 90.9
      expect(call.sizeUsd).toBeCloseTo(90.9, 0);
    });

    it('should apply trade multiplier correctly', async () => {
      deps.env.tradeMultiplier = 2.0;

      const signal: TradeSignal = {
        trader: '0xtrader1',
        marketId: 'market-123',
        outcome: 'YES',
        side: 'BUY',
        sizeUsd: 100,
        price: 0.5,
        timestamp: Date.now(),
      };

      mockGetBalance.mockResolvedValue(1000);
      mockHttpGet.mockResolvedValue([{ conditionId: 'market-1', initialValue: 1000, currentValue: 1000 }]);
      mockPostOrder.mockResolvedValue();

      const service = new TradeExecutorService(deps);
      await service.copyTrade(signal);

      const call = mockPostOrder.mock.calls[0][0];
      // Base size would be ~90.9, doubled = ~181.8
      expect(call.sizeUsd).toBeGreaterThan(150);
    });

    it('should handle SELL trades', async () => {
      const signal: TradeSignal = {
        trader: '0xtrader1',
        marketId: 'market-456',
        outcome: 'NO',
        side: 'SELL',
        sizeUsd: 200,
        price: 0.3,
        timestamp: Date.now(),
      };

      mockGetBalance.mockResolvedValue(5000);
      mockHttpGet.mockResolvedValue([{ conditionId: 'market-1', initialValue: 5000, currentValue: 5000 }]);
      mockPostOrder.mockResolvedValue();

      const service = new TradeExecutorService(deps);
      await service.copyTrade(signal);

      expect(mockPostOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          side: 'SELL',
          outcome: 'NO',
        }),
      );
    });

    it('should use fallback balance of 1000 on API error', async () => {
      const signal: TradeSignal = {
        trader: '0xtrader1',
        marketId: 'market-123',
        outcome: 'YES',
        side: 'BUY',
        sizeUsd: 100,
        price: 0.5,
        timestamp: Date.now(),
      };

      mockGetBalance.mockResolvedValue(1000);
      mockHttpGet.mockRejectedValue(new Error('API error'));
      mockPostOrder.mockResolvedValue();

      const service = new TradeExecutorService(deps);
      await service.copyTrade(signal);

      // Should still execute with fallback trader balance of 1000
      expect(mockPostOrder).toHaveBeenCalled();
    });

    it('should enforce minimum trader balance of 100', async () => {
      const signal: TradeSignal = {
        trader: '0xtrader1',
        marketId: 'market-123',
        outcome: 'YES',
        side: 'BUY',
        sizeUsd: 10,
        price: 0.5,
        timestamp: Date.now(),
      };

      mockGetBalance.mockResolvedValue(10000);
      mockHttpGet.mockResolvedValue([
        { conditionId: 'market-1', initialValue: 10, currentValue: 5 },
      ]); // Total = 5 (below minimum)
      mockPostOrder.mockResolvedValue();

      const service = new TradeExecutorService(deps);
      await service.copyTrade(signal);

      // Should use minimum balance of 100
      // ratio = 10000 / (100 + 10) = 90.9
      // targetSize = 10 * 90.9 = 909
      const call = mockPostOrder.mock.calls[0][0];
      expect(call.sizeUsd).toBeGreaterThan(500);
    });

    it('should log trade execution info', async () => {
      const signal: TradeSignal = {
        trader: '0xtrader1',
        marketId: 'market-123',
        outcome: 'YES',
        side: 'BUY',
        sizeUsd: 100,
        price: 0.5,
        timestamp: Date.now(),
      };

      mockGetBalance.mockResolvedValue(1000);
      mockHttpGet.mockResolvedValue([{ conditionId: 'market-1', initialValue: 1000, currentValue: 1000 }]);
      mockPostOrder.mockResolvedValue();

      const service = new TradeExecutorService(deps);
      await service.copyTrade(signal);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('BUY'),
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('USD'),
      );
    });

    it('should handle order execution errors', async () => {
      const signal: TradeSignal = {
        trader: '0xtrader1',
        marketId: 'market-123',
        outcome: 'YES',
        side: 'BUY',
        sizeUsd: 100,
        price: 0.5,
        timestamp: Date.now(),
      };

      mockGetBalance.mockResolvedValue(1000);
      mockHttpGet.mockResolvedValue([{ conditionId: 'market-1', initialValue: 1000, currentValue: 1000 }]);
      mockPostOrder.mockRejectedValue(new Error('Order failed'));

      const service = new TradeExecutorService(deps);
      await service.copyTrade(signal);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to copy trade',
        expect.any(Error),
      );
    });

    it('should handle balance fetch errors', async () => {
      const signal: TradeSignal = {
        trader: '0xtrader1',
        marketId: 'market-123',
        outcome: 'YES',
        side: 'BUY',
        sizeUsd: 100,
        price: 0.5,
        timestamp: Date.now(),
      };

      mockGetBalance.mockRejectedValue(new Error('Balance fetch failed'));

      const service = new TradeExecutorService(deps);
      await service.copyTrade(signal);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to copy trade',
        expect.any(Error),
      );
      expect(mockPostOrder).not.toHaveBeenCalled();
    });

    it('should calculate trader balance from position values', async () => {
      const signal: TradeSignal = {
        trader: '0xtrader1',
        marketId: 'market-123',
        outcome: 'YES',
        side: 'BUY',
        sizeUsd: 100,
        price: 0.5,
        timestamp: Date.now(),
      };

      mockGetBalance.mockResolvedValue(1000);
      mockHttpGet.mockResolvedValue([
        { conditionId: 'market-1', initialValue: 500, currentValue: 600 },
        { conditionId: 'market-2', initialValue: 300, currentValue: 400 },
        { conditionId: 'market-3', initialValue: 100, currentValue: 0 }, // Prefer currentValue
      ]);
      mockPostOrder.mockResolvedValue();

      const service = new TradeExecutorService(deps);
      await service.copyTrade(signal);

      // Total trader balance should be 600 + 400 + 0 = 1000
      expect(mockPostOrder).toHaveBeenCalled();
    });

    it('should use initialValue when currentValue is missing', async () => {
      const signal: TradeSignal = {
        trader: '0xtrader1',
        marketId: 'market-123',
        outcome: 'YES',
        side: 'BUY',
        sizeUsd: 100,
        price: 0.5,
        timestamp: Date.now(),
      };

      mockGetBalance.mockResolvedValue(1000);
      mockHttpGet.mockResolvedValue([
        { conditionId: 'market-1', initialValue: 500, currentValue: null },
        { conditionId: 'market-2', initialValue: 300, currentValue: undefined },
      ]);
      mockPostOrder.mockResolvedValue();

      const service = new TradeExecutorService(deps);
      await service.copyTrade(signal);

      // Should use initialValue as fallback: 500 + 300 = 800
      expect(mockPostOrder).toHaveBeenCalled();
    });
  });
});
