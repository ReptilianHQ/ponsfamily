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

  it("keeps slippage floors bounded and monotonic", () => {
    hegel.test((tc) => {
      const amount = tc.draw(gs.bigIntegers({ minValue: 0n, maxValue: MAX_AMOUNT }));
      const firstBps = tc.draw(gs.integers({ minValue: 0, maxValue: 10_000 }));
      const secondBps = tc.draw(gs.integers({ minValue: 0, maxValue: 10_000 }));
      const lowerBps = Math.min(firstBps, secondBps);
      const higherBps = Math.max(firstBps, secondBps);
      const lowerSlippageMinimum = applySlippage(amount, lowerBps);
      const higherSlippageMinimum = applySlippage(amount, higherBps);

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

  it("produces partial fills that satisfy the contract price-bound equation", () => {
    hegel.test((tc) => {
      const quoteReserve = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: 10n ** 12n }));
      const reserveScale = BigInt(tc.draw(gs.integers({ minValue: 10, maxValue: 1_000_000 })));
      const tokenReserve = quoteReserve * reserveScale;
      const amountIn = quoteReserve * 10n;
      const feeBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const creatorTaxBps = BigInt(tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 })));
      const sellableTokens = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: tokenReserve / 2n }));

      const quote = quoteCurveBuyExecution({ amountIn, quoteReserve, tokenReserve, sellableTokens, feeBps, creatorTaxBps });
      const maximumMinTokensOut = quote.quoteOffered * quote.tokensOut / quote.quoteSpent;

      expect(quote.partialFill).toBe(true);
      expect(quote.quoteSpent * maximumMinTokensOut).toBeLessThanOrEqual(quote.quoteOffered * quote.tokensOut);
      expect(quote.quoteSpent * (maximumMinTokensOut + 1n)).toBeGreaterThan(quote.quoteOffered * quote.tokensOut);
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
