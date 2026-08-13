export declare const BASIS_POINTS = 10000n;
export declare const MAX_UINT256: bigint;
export declare function applySlippage(amount: bigint, slippageBps: number): bigint;
export declare function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps?: bigint): bigint;
export declare function getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint, feeBps?: bigint): bigint;
export interface CurveQuoteParameters {
    amountIn: bigint;
    quoteReserve: bigint;
    tokenReserve: bigint;
    feeBps: bigint;
    creatorTaxBps: bigint;
}
export interface CurveBuyExecutionQuote {
    quoteOffered: bigint;
    quoteSpent: bigint;
    quoteRefund: bigint;
    tokensOut: bigint;
    fee: bigint;
    tax: bigint;
    partialFill: boolean;
}
export interface ExactTokenBuyParameters extends Omit<CurveQuoteParameters, "amountIn"> {
    tokensOut: bigint;
    sellableTokens: bigint;
}
export declare function quoteCurveBuy(parameters: CurveQuoteParameters & {
    sellableTokens: bigint;
}): bigint;
/**
 * Mirrors PonsV2BondingCurve.buy, including independently rounded fee legs,
 * final-buy repricing, and the unused quote refund.
 */
export declare function quoteCurveBuyExecution(parameters: CurveQuoteParameters & {
    sellableTokens: bigint;
}): CurveBuyExecutionQuote;
/** Returns the smallest quote input whose on-chain execution reaches tokensOut. */
export declare function quoteCurveBuyExactTokensOut(parameters: ExactTokenBuyParameters): CurveBuyExecutionQuote;
export declare function quoteCurveSell(parameters: CurveQuoteParameters): bigint;
