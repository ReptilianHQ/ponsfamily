import { describe, expect, it } from "vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import {
  applySlippage,
  getAmountIn,
  getAmountOut,
  MAX_UINT256,
  quoteCurveBuy,
  quoteCurveBuyExactTokensOut,
  quoteCurveBuyExecution,
  quoteCurveSell,
} from "./math.js";

const MAX_AMOUNT = 10n ** 24n;
const HEGEL_SETTINGS = {
  testCases: 500,
  derandomize: true,
  database: hegel.Database.disabled,
} as const;

describe("Pons curve math properties", () => {
  it("returns a contract-compatible input that reaches an exact output", () => {
    hegel.test((tc) => {
      const reserveIn = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const reserveOut = tc.draw(gs.bigIntegers({ minValue: 2n, maxValue: MAX_AMOUNT }));
      const amountOut = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: reserveOut - 1n }));
      const feeBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 2_000 })));

      const amountIn = getAmountIn(amountOut, reserveIn, reserveOut, feeBps);

      expect(getAmountOut(amountIn, reserveIn, reserveOut, feeBps)).toBeGreaterThanOrEqual(amountOut);
    }, HEGEL_SETTINGS);
  });

  it("keeps final-buy spend, refund, fees, and inventory internally consistent", () => {
    hegel.test((tc) => {
      const amountIn = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const quoteReserve = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const tokenReserve = tc.draw(gs.bigIntegers({ minValue: 2n, maxValue: MAX_AMOUNT }));
      const sellableTokens = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: tokenReserve - 1n }));
      const feeBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const creatorTaxBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));

      const quote = quoteCurveBuyExecution({
        amountIn,
        quoteReserve,
        tokenReserve,
        sellableTokens,
        feeBps,
        creatorTaxBps,
      });

      expect(quote.quoteOffered).toBe(amountIn);
      expect(quote.quoteSpent + quote.quoteRefund).toBe(amountIn);
      expect(quote.quoteSpent).toBeLessThanOrEqual(amountIn);
      expect(quote.tokensOut).toBeLessThanOrEqual(sellableTokens);
      expect(quote.fee + quote.tax).toBeLessThanOrEqual(quote.quoteSpent);
      expect(quote.partialFill).toBe(quote.quoteSpent < amountIn);
    }, HEGEL_SETTINGS);
  });

  it("finds a minimal live quote input for every attainable token target", () => {
    hegel.test((tc) => {
      const quoteReserve = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const tokenReserve = tc.draw(gs.bigIntegers({ minValue: 2n, maxValue: MAX_AMOUNT }));
      const sellableTokens = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: tokenReserve - 1n }));
      const tokensOut = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: sellableTokens }));
      const feeBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const creatorTaxBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const parameters = { tokensOut, quoteReserve, tokenReserve, sellableTokens, feeBps, creatorTaxBps };

      const quote = quoteCurveBuyExactTokensOut(parameters);

      expect(quote.tokensOut).toBeGreaterThanOrEqual(tokensOut);
      if (quote.quoteOffered === 1n) {
        expect(quote.quoteOffered).toBe(1n);
      } else {
        expect(quoteCurveBuy({ ...parameters, amountIn: quote.quoteOffered - 1n })).toBeLessThan(tokensOut);
      }
    }, HEGEL_SETTINGS);
  });

  it("never lets independently rounded sell fees increase gross output", () => {
    hegel.test((tc) => {
      const amountIn = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const quoteReserve = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const tokenReserve = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const feeBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const creatorTaxBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const gross = getAmountOut(amountIn, tokenReserve, quoteReserve);

      const net = quoteCurveSell({ amountIn, quoteReserve, tokenReserve, feeBps, creatorTaxBps });

      expect(net).toBeGreaterThanOrEqual(0n);
      expect(net).toBeLessThanOrEqual(gross);
    }, HEGEL_SETTINGS);
  });

  it("floors slippage exactly and decreases the minimum as slippage increases", () => {
    hegel.test((tc) => {
      const amount = tc.draw(gs.bigIntegers({ minValue: 0n, maxValue: MAX_AMOUNT }));
      const firstBps = tc.draw(gs.integers({ minValue: 0, maxValue: 10_000 }));
      const secondBps = tc.draw(gs.integers({ minValue: 0, maxValue: 10_000 }));
      const lowerBps = Math.min(firstBps, secondBps);
      const higherBps = Math.max(firstBps, secondBps);
      const lowerSlippageMinimum = applySlippage(amount, lowerBps);
      const higherSlippageMinimum = applySlippage(amount, higherBps);

      // 1 bps forces remainders 9,999, 1, and 0 for the small mandatory amounts.
      for (const input of [0n, 1n, 9_999n, 10_000n, MAX_UINT256, amount]) {
        for (const bps of [0, 1, 10_000, lowerBps, higherBps]) {
          const minimum = applySlippage(input, bps);
          const numerator = input * BigInt(10_000 - bps);
          expect(minimum * 10_000n).toBeLessThanOrEqual(numerator);
          expect((minimum + 1n) * 10_000n).toBeGreaterThan(numerator);
        }
      }

      expect(lowerSlippageMinimum).toBeGreaterThanOrEqual(0n);
      expect(lowerSlippageMinimum).toBeLessThanOrEqual(amount);
      expect(higherSlippageMinimum).toBeLessThanOrEqual(lowerSlippageMinimum);
    }, HEGEL_SETTINGS);
  });

  it("keeps buy output monotonic until it reaches the sellable cap", () => {
    hegel.test((tc) => {
      const firstAmount = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const secondAmount = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const quoteReserve = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const tokenReserve = tc.draw(gs.bigIntegers({ minValue: 2n, maxValue: MAX_AMOUNT }));
      const sellableTokens = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: tokenReserve - 1n }));
      const feeBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const creatorTaxBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const lowerAmount = firstAmount < secondAmount ? firstAmount : secondAmount;
      const higherAmount = firstAmount < secondAmount ? secondAmount : firstAmount;
      const parameters = { quoteReserve, tokenReserve, sellableTokens, feeBps, creatorTaxBps };

      const lowerOutput = quoteCurveBuy({ ...parameters, amountIn: lowerAmount });
      const higherOutput = quoteCurveBuy({ ...parameters, amountIn: higherAmount });

      expect(higherOutput).toBeGreaterThanOrEqual(lowerOutput);
      expect(higherOutput).toBeLessThanOrEqual(sellableTokens);
    }, HEGEL_SETTINGS);
  });

  it("preserves the constant-product invariant across rounded buys and sells", () => {
    hegel.test((tc) => {
      const amountIn = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const quoteReserve = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const tokenReserve = tc.draw(gs.bigIntegers({ minValue: 2n, maxValue: MAX_AMOUNT }));
      const feeBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const creatorTaxBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const before = quoteReserve * tokenReserve;

      const buy = quoteCurveBuyExecution({
        amountIn,
        quoteReserve,
        tokenReserve,
        sellableTokens: tokenReserve,
        feeBps,
        creatorTaxBps,
      });
      const buyNet = buy.quoteSpent - buy.fee - buy.tax;
      expect((quoteReserve + buyNet) * (tokenReserve - buy.tokensOut)).toBeGreaterThanOrEqual(before);

      const grossSellOutput = getAmountOut(amountIn, tokenReserve, quoteReserve);
      expect((tokenReserve + amountIn) * (quoteReserve - grossSellOutput)).toBeGreaterThanOrEqual(before);
    }, HEGEL_SETTINGS);
  });

  it("matches independently floored fee and tax legs exactly", () => {
    hegel.test((tc) => {
      const amountIn = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const quoteReserve = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const tokenReserve = tc.draw(gs.bigIntegers({ minValue: 2n, maxValue: MAX_AMOUNT }));
      const sellableTokens = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: tokenReserve - 1n }));
      const feeBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const creatorTaxBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));

      const quote = quoteCurveBuyExecution({ amountIn, quoteReserve, tokenReserve, sellableTokens, feeBps, creatorTaxBps });

      expect(quote.fee).toBe(quote.quoteSpent * feeBps / 10_000n);
      expect(quote.tax).toBe(quote.quoteSpent * creatorTaxBps / 10_000n);
    }, HEGEL_SETTINGS);
  });

  it("prices capped fills with the contract rounding and refunds the unspent input", () => {
    hegel.test((tc) => {
      const quoteReserve = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: 10n ** 12n }));
      const reserveScale = BigInt(tc.draw(gs.integers({ minValue: 10, maxValue: 1_000_000 })));
      const tokenReserve = quoteReserve * reserveScale;
      const amountIn = quoteReserve * 10n;
      const feeBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const creatorTaxBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const sellableTokens = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: tokenReserve / 2n }));

      // Keep arbitrary reserve parity and caps; a doubled reserve with a half
      // cap additionally forces exact division. All fills cost less than the offer.
      const fills = [
        { reserve: tokenReserve, cap: 1n },
        { reserve: tokenReserve, cap: sellableTokens },
        { reserve: tokenReserve * 2n, cap: tokenReserve },
      ];
      for (const { reserve, cap } of fills) {
        const quote = quoteCurveBuyExecution({
          amountIn, quoteReserve, tokenReserve: reserve, sellableTokens: cap, feeBps, creatorTaxBps,
        });
        // Independent integer search over the constant-product inequality.
        // PonsV2BondingCurveMath.getAmountIn uses floor + 1, so equality is
        // deliberately insufficient, including at an exactly divisible cap.
        const remaining = reserve - cap;
        const product = cap * quoteReserve;
        let low = 1n, high = quoteReserve + 1n;
        while (low < high) {
          const middle = (low + high) / 2n;
          if (middle * remaining > product) high = middle;
          else low = middle + 1n;
        }
        const requiredNet = low;
        expect(requiredNet * remaining).toBeGreaterThan(product);
        expect((requiredNet - 1n) * remaining).toBeLessThanOrEqual(product);

        // The contract then grosses up with ceil. These inequalities uniquely
        // determine spend without calling SDK pricing helpers in the oracle.
        const retainedBps = 10_000n - feeBps - creatorTaxBps;
        expect(quote.quoteSpent * retainedBps).toBeGreaterThanOrEqual(requiredNet * 10_000n);
        expect((quote.quoteSpent - 1n) * retainedBps).toBeLessThan(requiredNet * 10_000n);
        expect(quote.tokensOut).toBe(cap);
        expect(quote.quoteOffered).toBe(amountIn);
        expect(quote.quoteRefund).toBe(amountIn - quote.quoteSpent);
        expect(quote.partialFill).toBe(true);
      }
    }, HEGEL_SETTINGS);
  });

  it("accepts uint256 values where safe and rejects values or intermediates that Solidity cannot represent", () => {
    hegel.test((tc) => {
      const slippageBps = tc.draw(gs.integers({ minValue: 0, maxValue: 10_000 }));
      const excess = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const overflowingInput = MAX_UINT256 / 10_000n + excess;

      expect(applySlippage(MAX_UINT256, slippageBps)).toBeLessThanOrEqual(MAX_UINT256);
      expect(() => applySlippage(MAX_UINT256 + excess, slippageBps)).toThrow(/uint256/);
      expect(() => getAmountOut(overflowingInput, 1n, 1n)).toThrow(/uint256/);
    }, HEGEL_SETTINGS);
  });
});
