import { computeProportionalSizing, CopyInputs } from '../copy-strategy';

describe('computeProportionalSizing', () => {
  describe('basic proportional sizing', () => {
    it('should calculate correct proportional size with 1:1 balance ratio', () => {
      const input: CopyInputs = {
        yourUsdBalance: 1000,
        traderUsdBalance: 1000,
        traderTradeUsd: 100,
        multiplier: 1.0,
      };

      const result = computeProportionalSizing(input);

      // ratio = 1000 / (1000 + 100) = 0.909
      // targetSize = 100 * 0.909 * 1.0 = 90.9
      expect(result.targetUsdSize).toBeCloseTo(90.9, 1);
      expect(result.ratio).toBeCloseTo(0.909, 3);
    });

    it('should calculate correct size when you have half the balance', () => {
      const input: CopyInputs = {
        yourUsdBalance: 500,
        traderUsdBalance: 1000,
        traderTradeUsd: 100,
        multiplier: 1.0,
      };

      const result = computeProportionalSizing(input);

      // ratio = 500 / (1000 + 100) = 0.454
      // targetSize = 100 * 0.454 * 1.0 = 45.4
      expect(result.targetUsdSize).toBeCloseTo(45.4, 1);
      expect(result.ratio).toBeCloseTo(0.454, 3);
    });

    it('should calculate correct size when you have 10x the balance', () => {
      const input: CopyInputs = {
        yourUsdBalance: 10000,
        traderUsdBalance: 1000,
        traderTradeUsd: 100,
        multiplier: 1.0,
      };

      const result = computeProportionalSizing(input);

      // ratio = 10000 / (1000 + 100) = 9.09
      // targetSize = 100 * 9.09 * 1.0 = 909
      expect(result.targetUsdSize).toBeCloseTo(909, 0);
      expect(result.ratio).toBeCloseTo(9.09, 2);
    });
  });

  describe('multiplier effects', () => {
    it('should double position size with 2x multiplier', () => {
      const input: CopyInputs = {
        yourUsdBalance: 1000,
        traderUsdBalance: 1000,
        traderTradeUsd: 100,
        multiplier: 2.0,
      };

      const result = computeProportionalSizing(input);

      // Base size would be ~90.9, doubled = ~181.8
      expect(result.targetUsdSize).toBeCloseTo(181.8, 1);
    });

    it('should halve position size with 0.5x multiplier', () => {
      const input: CopyInputs = {
        yourUsdBalance: 1000,
        traderUsdBalance: 1000,
        traderTradeUsd: 100,
        multiplier: 0.5,
      };

      const result = computeProportionalSizing(input);

      // Base size would be ~90.9, halved = ~45.4
      expect(result.targetUsdSize).toBeCloseTo(45.4, 1);
    });

    it('should handle zero multiplier by returning minimum $1', () => {
      const input: CopyInputs = {
        yourUsdBalance: 1000,
        traderUsdBalance: 1000,
        traderTradeUsd: 100,
        multiplier: 0,
      };

      const result = computeProportionalSizing(input);

      // Should return minimum $1
      expect(result.targetUsdSize).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should enforce minimum $1 trade size', () => {
      const input: CopyInputs = {
        yourUsdBalance: 1,
        traderUsdBalance: 10000,
        traderTradeUsd: 100,
        multiplier: 1.0,
      };

      const result = computeProportionalSizing(input);

      // Calculated size would be tiny, but minimum is $1
      expect(result.targetUsdSize).toBe(1);
    });

    it('should handle zero balances gracefully', () => {
      const input: CopyInputs = {
        yourUsdBalance: 0,
        traderUsdBalance: 0,
        traderTradeUsd: 100,
        multiplier: 1.0,
      };

      const result = computeProportionalSizing(input);

      expect(result.targetUsdSize).toBe(1); // Minimum
      expect(result.ratio).toBe(0);
    });

    it('should handle negative values gracefully', () => {
      const input: CopyInputs = {
        yourUsdBalance: -100, // Invalid but protected
        traderUsdBalance: 1000,
        traderTradeUsd: 100,
        multiplier: 1.0,
      };

      const result = computeProportionalSizing(input);

      // Should handle negative as 0 and return minimum
      expect(result.targetUsdSize).toBe(1);
      expect(result.ratio).toBe(0);
    });

    it('should handle very large trade sizes', () => {
      const input: CopyInputs = {
        yourUsdBalance: 100000,
        traderUsdBalance: 100000,
        traderTradeUsd: 50000,
        multiplier: 1.0,
      };

      const result = computeProportionalSizing(input);

      // ratio = 100000 / (100000 + 50000) = 0.666
      // targetSize = 50000 * 0.666 = 33333
      expect(result.targetUsdSize).toBeCloseTo(33333, 0);
    });

    it('should handle trader with zero balance', () => {
      const input: CopyInputs = {
        yourUsdBalance: 1000,
        traderUsdBalance: 0,
        traderTradeUsd: 100,
        multiplier: 1.0,
      };

      const result = computeProportionalSizing(input);

      // ratio = 1000 / (0 + 100) = 10
      // targetSize = 100 * 10 = 1000
      expect(result.targetUsdSize).toBe(1000);
    });
  });

  describe('realistic scenarios', () => {
    it('scenario: small trader, large follower', () => {
      const input: CopyInputs = {
        yourUsdBalance: 50000,
        traderUsdBalance: 5000,
        traderTradeUsd: 500,
        multiplier: 1.0,
      };

      const result = computeProportionalSizing(input);

      // ratio = 50000 / (5000 + 500) = 9.09
      // targetSize = 500 * 9.09 = 4545
      expect(result.targetUsdSize).toBeCloseTo(4545, 0);
    });

    it('scenario: conservative following with 0.5x multiplier', () => {
      const input: CopyInputs = {
        yourUsdBalance: 10000,
        traderUsdBalance: 10000,
        traderTradeUsd: 1000,
        multiplier: 0.5,
      };

      const result = computeProportionalSizing(input);

      // Base would be ~909, halved = ~454
      expect(result.targetUsdSize).toBeCloseTo(454, 0);
    });

    it('scenario: aggressive following with 2x multiplier', () => {
      const input: CopyInputs = {
        yourUsdBalance: 10000,
        traderUsdBalance: 10000,
        traderTradeUsd: 1000,
        multiplier: 2.0,
      };

      const result = computeProportionalSizing(input);

      // Base would be ~909, doubled = ~1818
      expect(result.targetUsdSize).toBeCloseTo(1818, 0);
    });
  });
});
