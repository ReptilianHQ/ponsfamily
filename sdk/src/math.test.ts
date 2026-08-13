import { describe, expect, it } from "vitest";
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

describe("Pons curve math", () => {
  it("mirrors the integration quote for buys", () => {
    expect(quoteCurveBuy({
      amountIn: 1_000n,
      quoteReserve: 10_000n,
      tokenReserve: 1_000_000n,
      sellableTokens: 500_000n,
      feeBps: 100n,
      creatorTaxBps: 50n,
    })).toBe(89_667n);
  });

  it("takes sell fees from gross quote output", () => {
    expect(quoteCurveSell({
      amountIn: 100_000n,
      quoteReserve: 10_000n,
      tokenReserve: 1_000_000n,
      feeBps: 100n,
      creatorTaxBps: 50n,
    })).toBe(896n);
  });

  it("caps buys at the sellable allocation", () => {
    expect(quoteCurveBuy({
      amountIn: 1_000_000n,
      quoteReserve: 10_000n,
      tokenReserve: 1_000_000n,
      sellableTokens: 12_345n,
      feeBps: 0n,
      creatorTaxBps: 0n,
    })).toBe(12_345n);
  });

  it("returns final-buy spend and refund evidence", () => {
    const quote = quoteCurveBuyExecution({
      amountIn: 1_000n,
      quoteReserve: 1_000n,
      tokenReserve: 2_000n,
      sellableTokens: 100n,
      feeBps: 100n,
      creatorTaxBps: 100n,
    });
    expect(quote.tokensOut).toBe(100n);
    expect(quote.quoteSpent).toBeLessThan(quote.quoteOffered);
    expect(quote.quoteRefund).toBe(quote.quoteOffered - quote.quoteSpent);
    expect(quote.partialFill).toBe(true);
  });

  it("finds the minimum input for an exact token target", () => {
    const parameters = {
      tokensOut: 250n,
      quoteReserve: 1_000n,
      tokenReserve: 2_000n,
      sellableTokens: 1_500n,
      feeBps: 100n,
      creatorTaxBps: 125n,
    };
    const quote = quoteCurveBuyExactTokensOut(parameters);
    expect(quote.tokensOut).toBeGreaterThanOrEqual(parameters.tokensOut);
    expect(quoteCurveBuy({ ...parameters, amountIn: quote.quoteOffered - 1n })).toBeLessThan(parameters.tokensOut);
  });

  it("rounds exact-output input upward", () => {
    const input = getAmountIn(100n, 10_000n, 1_000n, 100n);
    expect(getAmountOut(input, 10_000n, 1_000n, 100n)).toBeGreaterThanOrEqual(100n);
  });

  it("mirrors separate fee-leg flooring", () => {
    expect(quoteCurveBuy({
      amountIn: 67n,
      quoteReserve: 10_000n,
      tokenReserve: 1_000_000n,
      sellableTokens: 1_000_000n,
      feeBps: 100n,
      creatorTaxBps: 100n,
    })).toBe(getAmountOut(67n, 10_000n, 1_000_000n));
  });

  it("applies integer slippage floors", () => {
    expect(applySlippage(10_001n, 100)).toBe(9_900n);
  });

  it("fails explicitly where Solidity checked arithmetic would overflow", () => {
    expect(() => getAmountOut(MAX_UINT256, 1n, 1n)).toThrow(/uint256/);
    expect(() => applySlippage(MAX_UINT256 + 1n, 100)).toThrow(/uint256/);
  });
});
