import { PonsSdkError } from "./errors.js";
export type PonsCurveReserves = {
    reserveToken: bigint;
    reserveQuote: bigint;
};
export type PonsLifecyclePhase = "bonding" | "swept" | "pool_created" | "rescued";
export type PonsLifecycleTransition = Exclude<PonsLifecyclePhase, "bonding">;
/**
 * A curve sell that would drive the real quote reserve below zero.
 *
 * PonsV2BondingCurve.realQuoteReserve() is
 * `trackedQuote - quoteFeeBalance - creatorTaxBalance` and returns uint256, so
 * the protocol asserts this cannot happen. Reaching it means the event history
 * is incomplete or the on-chain invariant was violated.
 */
export declare class PonsCurveReserveUnderflowError extends PonsSdkError {
    readonly reserveQuote: bigint;
    readonly grossReleased: bigint;
    constructor(reserveQuote: bigint, grossReleased: bigint);
}
export declare class PonsLifecycleTransitionError extends PonsSdkError {
    readonly current: PonsLifecyclePhase;
    readonly next: PonsLifecycleTransition;
    constructor(current: PonsLifecyclePhase, next: PonsLifecycleTransition);
}
export declare function parsePonsLifecyclePhase(value: string): PonsLifecyclePhase;
export declare function foldPonsCurveBuy(reserves: PonsCurveReserves, trade: {
    tokensOut: bigint;
    quoteIn: bigint;
    fee: bigint;
    tax: bigint;
}): PonsCurveReserves;
export declare function foldPonsCurveSell(reserves: PonsCurveReserves, trade: {
    tokensIn: bigint;
    quoteOut: bigint;
    fee: bigint;
    tax: bigint;
}): PonsCurveReserves;
export declare function foldPonsBuyback(reserves: PonsCurveReserves, buyback: {
    quoteSpent: bigint;
    tokensLocked: bigint;
}): PonsCurveReserves;
/**
 * Applies the protocol's event-ordering rules without choosing storage or
 * attaching chain metadata. Replaying the same terminal event is idempotent.
 */
export declare function foldPonsLifecyclePhase(current: PonsLifecyclePhase, next: PonsLifecycleTransition): PonsLifecyclePhase;
