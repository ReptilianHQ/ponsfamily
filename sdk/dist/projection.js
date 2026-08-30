import { PonsSdkError } from "./errors.js";
import { MAX_UINT256 } from "./math.js";
/**
 * A curve sell that would drive the real quote reserve below zero.
 *
 * PonsV2BondingCurve.realQuoteReserve() is
 * `trackedQuote - quoteFeeBalance - creatorTaxBalance` and returns uint256, so
 * the protocol asserts this cannot happen. Reaching it means the event history
 * is incomplete or the on-chain invariant was violated.
 */
export class PonsCurveReserveUnderflowError extends PonsSdkError {
    reserveQuote;
    grossReleased;
    constructor(reserveQuote, grossReleased) {
        super("PROJECTION_RESERVE_UNDERFLOW", `pons curve sell releases ${grossReleased} against a real quote reserve of ${reserveQuote}`, {
            path: "curve.reserveQuote",
            expected: `>=${grossReleased}`,
            actual: reserveQuote.toString(),
        });
        this.name = "PonsCurveReserveUnderflowError";
        this.reserveQuote = reserveQuote;
        this.grossReleased = grossReleased;
    }
}
export class PonsLifecycleTransitionError extends PonsSdkError {
    current;
    next;
    constructor(current, next) {
        super("PROJECTION_LIFECYCLE_TRANSITION", `pons launch cannot transition from ${current} to ${next}`, { path: "launch.lifecyclePhase", expected: next, actual: current });
        this.name = "PonsLifecycleTransitionError";
        this.current = current;
        this.next = next;
    }
}
function projectionInvariant(message, path) {
    throw new PonsSdkError("PROJECTION_INVARIANT", message, { path });
}
function assertProjectionUint256(value, path) {
    if (value < 0n) {
        throw new PonsSdkError("INVALID_ARGUMENT", `${path} must be zero or greater`, {
            path,
            expected: "zero or greater",
            actual: value.toString(),
        });
    }
    if (value > MAX_UINT256) {
        throw new PonsSdkError("ARITHMETIC_OVERFLOW", `${path} exceeds uint256`, {
            path,
            expected: `at most ${MAX_UINT256}`,
            actual: value.toString(),
        });
    }
}
function checkedProjectionAdd(left, right, path) {
    const result = left + right;
    assertProjectionUint256(result, path);
    return result;
}
function assertPonsCurveReserves(reserves) {
    assertProjectionUint256(reserves.reserveToken, "curve.reserveToken");
    assertProjectionUint256(reserves.reserveQuote, "curve.reserveQuote");
}
export function parsePonsLifecyclePhase(value) {
    if (value === "bonding" || value === "swept" || value === "pool_created" || value === "rescued") {
        return value;
    }
    projectionInvariant(`unsupported pons lifecycle phase: ${value}`, "launch.lifecyclePhase");
}
export function foldPonsCurveBuy(reserves, trade) {
    assertPonsCurveReserves(reserves);
    assertProjectionUint256(trade.tokensOut, "trade.tokensOut");
    assertProjectionUint256(trade.quoteIn, "trade.quoteIn");
    assertProjectionUint256(trade.fee, "trade.fee");
    assertProjectionUint256(trade.tax, "trade.tax");
    const deductions = checkedProjectionAdd(trade.fee, trade.tax, "trade.deductions");
    if (deductions > trade.quoteIn) {
        projectionInvariant("pons curve buy deductions exceed quote input", "trade.quoteIn");
    }
    if (trade.tokensOut > reserves.reserveToken) {
        projectionInvariant("pons curve buy exceeds token reserve", "curve.reserveToken");
    }
    return {
        reserveToken: reserves.reserveToken - trade.tokensOut,
        reserveQuote: checkedProjectionAdd(reserves.reserveQuote, trade.quoteIn, "curve.reserveQuoteAfterInput") - deductions,
    };
}
export function foldPonsCurveSell(reserves, trade) {
    assertPonsCurveReserves(reserves);
    assertProjectionUint256(trade.tokensIn, "trade.tokensIn");
    assertProjectionUint256(trade.quoteOut, "trade.quoteOut");
    assertProjectionUint256(trade.fee, "trade.fee");
    assertProjectionUint256(trade.tax, "trade.tax");
    const grossReleased = checkedProjectionAdd(checkedProjectionAdd(trade.quoteOut, trade.fee, "trade.quoteOutWithFee"), trade.tax, "trade.grossReleased");
    if (grossReleased > reserves.reserveQuote) {
        throw new PonsCurveReserveUnderflowError(reserves.reserveQuote, grossReleased);
    }
    return {
        reserveToken: checkedProjectionAdd(reserves.reserveToken, trade.tokensIn, "curve.reserveTokenAfterInput"),
        reserveQuote: reserves.reserveQuote - grossReleased,
    };
}
export function foldPonsBuyback(reserves, buyback) {
    assertPonsCurveReserves(reserves);
    assertProjectionUint256(buyback.quoteSpent, "buyback.quoteSpent");
    assertProjectionUint256(buyback.tokensLocked, "buyback.tokensLocked");
    if (buyback.tokensLocked > reserves.reserveToken) {
        projectionInvariant("pons buyback exceeds token reserve", "curve.reserveToken");
    }
    return {
        reserveToken: reserves.reserveToken - buyback.tokensLocked,
        reserveQuote: checkedProjectionAdd(reserves.reserveQuote, buyback.quoteSpent, "curve.reserveQuoteAfterBuyback"),
    };
}
/**
 * Applies the protocol's event-ordering rules without choosing storage or
 * attaching chain metadata. Replaying the same terminal event is idempotent.
 */
export function foldPonsLifecyclePhase(current, next) {
    const allowed = next === "swept"
        ? current === "bonding" || current === "swept"
        : current === "swept" || current === next;
    if (!allowed)
        throw new PonsLifecycleTransitionError(current, next);
    return next;
}
//# sourceMappingURL=projection.js.map