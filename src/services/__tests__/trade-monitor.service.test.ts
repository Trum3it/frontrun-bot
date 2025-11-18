import { TradeMonitorService, TradeMonitorDeps } from '../trade-monitor.service';
import type { ClobClient } from '@polymarket/clob-client';
import type { RuntimeEnv } from '../../config/env';
import type { Logger } from '../../utils/logger.util';
import type { TradeSignal } from '../../domain/trade.types';

// Mock the fetch-data utility
jest.mock('../../utils/fetch-data.util', () => ({
  httpGet: jest.fn(),
}));

import { httpGet } from '../../utils/fetch-data.util';

const mockHttpGet = httpGet as jest.MockedFunction<typeof httpGet>;

describe('TradeMonitorService', () => {
  let mockClient: jest.Mocked<ClobClient>;
  let mockEnv: RuntimeEnv;
  let mockLogger: jest.Mocked<Logger>;
  let onDetectedTrade: jest.Mock;
  let deps: TradeMonitorDeps;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockClient = {} as jest.Mocked<ClobClient>;

    mockEnv = {
      userAddresses: ['0xtrader1', '0xtrader2'],
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

    onDetectedTrade = jest.fn();

    deps = {
      client: mockClient,
      env: mockEnv,
      logger: mockLogger,
      userAddresses: mockEnv.userAddresses,
      onDetectedTrade,
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should start monitoring and fetch immediately', async () => {
      mockHttpGet.mockResolvedValue([]);
      const service = new TradeMonitorService(deps);

      await service.start();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Monitoring 2 trader(s) every 1s...',
      );
      expect(mockHttpGet).toHaveBeenCalledTimes(2); // One per trader
    });

    it('should poll at configured interval', async () => {
      mockHttpGet.mockResolvedValue([]);
      const service = new TradeMonitorService(deps);

      await service.start();

      // Fast-forward 1 second
      jest.advanceTimersByTime(1000);
      await Promise.resolve(); // Flush promises

      expect(mockHttpGet).toHaveBeenCalledTimes(4); // 2 initial + 2 after 1s
    });
  });

  describe('stop', () => {
    it('should stop the polling timer', async () => {
      mockHttpGet.mockResolvedValue([]);
      const service = new TradeMonitorService(deps);

      await service.start();
      service.stop();

      const callsBefore = mockHttpGet.mock.calls.length;

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Should not have made additional calls
      expect(mockHttpGet).toHaveBeenCalledTimes(callsBefore);
    });
  });

  describe('trade detection', () => {
    it('should detect and emit BUY trade signal', async () => {
      const mockActivity = {
        type: 'TRADE',
        timestamp: Math.floor(Date.now() / 1000),
        conditionId: 'market-123',
        asset: 'token-abc',
        size: 100,
        usdcSize: 50,
        price: 0.5,
        side: 'BUY',
        outcomeIndex: 0,
        transactionHash: '0xtx123',
      };

      mockHttpGet.mockResolvedValue([mockActivity]);

      const service = new TradeMonitorService(deps);
      await service.start();

      expect(onDetectedTrade).toHaveBeenCalledTimes(2); // Once per trader
      expect(onDetectedTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          trader: expect.any(String),
          marketId: 'market-123',
          outcome: 'YES',
          side: 'BUY',
          sizeUsd: 50,
          price: 0.5,
        }),
      );
    });

    it('should detect SELL trade with NO outcome', async () => {
      const mockActivity = {
        type: 'TRADE',
        timestamp: Math.floor(Date.now() / 1000),
        conditionId: 'market-456',
        asset: 'token-def',
        size: 200,
        usdcSize: 100,
        price: 0.5,
        side: 'SELL',
        outcomeIndex: 1,
        transactionHash: '0xtx456',
      };

      mockHttpGet.mockResolvedValue([mockActivity]);

      const service = new TradeMonitorService(deps);
      await service.start();

      expect(onDetectedTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'NO',
          side: 'SELL',
        }),
      );
    });

    it('should calculate sizeUsd from size * price when usdcSize missing', async () => {
      const mockActivity = {
        type: 'TRADE',
        timestamp: Math.floor(Date.now() / 1000),
        conditionId: 'market-789',
        asset: 'token-ghi',
        size: 100,
        usdcSize: 0, // Missing
        price: 0.6,
        side: 'BUY',
        outcomeIndex: 0,
        transactionHash: '0xtx789',
      };

      mockHttpGet.mockResolvedValue([mockActivity]);

      const service = new TradeMonitorService(deps);
      await service.start();

      expect(onDetectedTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          sizeUsd: 60, // 100 * 0.6
        }),
      );
    });

    it('should skip non-TRADE activities', async () => {
      const mockActivities = [
        {
          type: 'DEPOSIT',
          timestamp: Math.floor(Date.now() / 1000),
          transactionHash: '0xtx1',
        },
        {
          type: 'WITHDRAWAL',
          timestamp: Math.floor(Date.now() / 1000),
          transactionHash: '0xtx2',
        },
      ];

      mockHttpGet.mockResolvedValue(mockActivities);

      const service = new TradeMonitorService(deps);
      await service.start();

      expect(onDetectedTrade).not.toHaveBeenCalled();
    });

    it('should not emit duplicate trades (same transaction hash)', async () => {
      const mockActivity = {
        type: 'TRADE',
        timestamp: Math.floor(Date.now() / 1000),
        conditionId: 'market-123',
        asset: 'token-abc',
        size: 100,
        usdcSize: 50,
        price: 0.5,
        side: 'BUY',
        outcomeIndex: 0,
        transactionHash: '0xsame-hash',
      };

      mockHttpGet.mockResolvedValue([mockActivity]);

      const service = new TradeMonitorService(deps);
      await service.start();

      // First call should detect the trade
      expect(onDetectedTrade).toHaveBeenCalledTimes(2);

      // Clear and poll again
      onDetectedTrade.mockClear();
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      // Should not detect again (same hash)
      expect(onDetectedTrade).not.toHaveBeenCalled();
    });

    it('should respect aggregation window', async () => {
      const now = Math.floor(Date.now() / 1000);
      const oldActivity = {
        type: 'TRADE',
        timestamp: now - 400, // 400 seconds ago (outside 300s window)
        conditionId: 'market-old',
        asset: 'token-old',
        size: 100,
        usdcSize: 50,
        price: 0.5,
        side: 'BUY',
        outcomeIndex: 0,
        transactionHash: '0xtx-old',
      };

      const newActivity = {
        type: 'TRADE',
        timestamp: now - 100, // 100 seconds ago (inside window)
        conditionId: 'market-new',
        asset: 'token-new',
        size: 100,
        usdcSize: 50,
        price: 0.5,
        side: 'BUY',
        outcomeIndex: 0,
        transactionHash: '0xtx-new',
      };

      mockHttpGet.mockResolvedValue([oldActivity, newActivity]);

      const service = new TradeMonitorService(deps);
      await service.start();

      // Should only detect the new activity
      expect(onDetectedTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: 'market-new',
        }),
      );

      expect(onDetectedTrade).not.toHaveBeenCalledWith(
        expect.objectContaining({
          marketId: 'market-old',
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should log error and continue on API failure', async () => {
      mockHttpGet.mockRejectedValue(new Error('API error'));

      const service = new TradeMonitorService(deps);
      await service.start();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch activities'),
        expect.any(Error),
      );

      // Should continue monitoring despite error
      mockHttpGet.mockResolvedValue([]);
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockHttpGet).toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      const mockActivity = {
        type: 'TRADE',
        timestamp: Math.floor(Date.now() / 1000),
        conditionId: 'market-123',
        asset: 'token-abc',
        size: 100,
        usdcSize: 50,
        price: 0.5,
        side: 'BUY',
        outcomeIndex: 0,
        transactionHash: '0xtx123',
      };

      mockHttpGet.mockResolvedValue([mockActivity]);
      onDetectedTrade.mockRejectedValue(new Error('Execution error'));

      const service = new TradeMonitorService(deps);

      // Should not throw
      await expect(service.start()).resolves.not.toThrow();
    });
  });

  describe('multiple traders', () => {
    it('should monitor all configured traders', async () => {
      mockHttpGet.mockResolvedValue([]);

      const service = new TradeMonitorService(deps);
      await service.start();

      expect(mockHttpGet).toHaveBeenCalledWith(
        'https://data-api.polymarket.com/activities?user=0xtrader1',
      );
      expect(mockHttpGet).toHaveBeenCalledWith(
        'https://data-api.polymarket.com/activities?user=0xtrader2',
      );
    });

    it('should track last fetch time per trader', async () => {
      const now = Math.floor(Date.now() / 1000);

      const trader1Activity = {
        type: 'TRADE',
        timestamp: now,
        conditionId: 'market-1',
        asset: 'token-1',
        size: 100,
        usdcSize: 50,
        price: 0.5,
        side: 'BUY',
        outcomeIndex: 0,
        transactionHash: '0xtx1',
      };

      const trader2Activity = {
        type: 'TRADE',
        timestamp: now,
        conditionId: 'market-2',
        asset: 'token-2',
        size: 100,
        usdcSize: 50,
        price: 0.5,
        side: 'BUY',
        outcomeIndex: 0,
        transactionHash: '0xtx2',
      };

      mockHttpGet
        .mockResolvedValueOnce([trader1Activity])
        .mockResolvedValueOnce([trader2Activity]);

      const service = new TradeMonitorService(deps);
      await service.start();

      // Both trades should be detected
      expect(onDetectedTrade).toHaveBeenCalledTimes(2);
    });
  });
});
