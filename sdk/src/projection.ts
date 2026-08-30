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
export class PonsCurveReserveUnderflowError extends PonsSdkError {
  public readonly reserveQuote: bigint;
  public readonly grossReleased: bigint;

  constructor(reserveQuote: bigint, grossReleased: bigint) {
    super(
      "PROJECTION_RESERVE_UNDERFLOW",
      `pons curve sell releases ${grossReleased} against a real quote reserve of ${reserveQuote}`,
      {
        path: "curve.reserveQuote",
        expected: `>=${grossReleased}`,
        actual: reserveQuote.toString(),
      },
    );
    this.name = "PonsCurveReserveUnderflowError";
    this.reserveQuote = reserveQuote;
    this.grossReleased = grossReleased;
  }
}

export class PonsLifecycleTransitionError extends PonsSdkError {
  public readonly current: PonsLifecyclePhase;
  public readonly next: PonsLifecycleTransition;

  constructor(current: PonsLifecyclePhase, next: PonsLifecycleTransition) {
    super(
      "PROJECTION_LIFECYCLE_TRANSITION",
      `pons launch cannot transition from ${current} to ${next}`,
      { path: "launch.lifecyclePhase", expected: next, actual: current },
    );
    this.name = "PonsLifecycleTransitionError";
    this.current = current;
    this.next = next;
  }
}

function projectionInvariant(message: string, path: string): never {
  throw new PonsSdkError("PROJECTION_INVARIANT", message, { path });
}

export function parsePonsLifecyclePhase(value: string): PonsLifecyclePhase {
  if (value === "bonding" || value === "swept" || value === "pool_created" || value === "rescued") {
    return value;
  }
  projectionInvariant(`unsupported pons lifecycle phase: ${value}`, "launch.lifecyclePhase");
}

export function foldPonsCurveBuy(
  reserves: PonsCurveReserves,
  trade: { tokensOut: bigint; quoteIn: bigint; fee: bigint; tax: bigint },
): PonsCurveReserves {
  const deductions = trade.fee + trade.tax;
  if (deductions > trade.quoteIn) {
    projectionInvariant("pons curve buy deductions exceed quote input", "trade.quoteIn");
  }
  if (trade.tokensOut > reserves.reserveToken) {
    projectionInvariant("pons curve buy exceeds token reserve", "curve.reserveToken");
  }
  return {
    reserveToken: reserves.reserveToken - trade.tokensOut,
    reserveQuote: reserves.reserveQuote + trade.quoteIn - deductions,
  };
}

export function foldPonsCurveSell(
  reserves: PonsCurveReserves,
  trade: { tokensIn: bigint; quoteOut: bigint; fee: bigint; tax: bigint },
): PonsCurveReserves {
  const grossReleased = trade.quoteOut + trade.fee + trade.tax;
  if (grossReleased > reserves.reserveQuote) {
    throw new PonsCurveReserveUnderflowError(reserves.reserveQuote, grossReleased);
  }
  return {
    reserveToken: reserves.reserveToken + trade.tokensIn,
    reserveQuote: reserves.reserveQuote - grossReleased,
  };
}

export function foldPonsBuyback(
  reserves: PonsCurveReserves,
  buyback: { quoteSpent: bigint; tokensLocked: bigint },
): PonsCurveReserves {
  if (buyback.tokensLocked > reserves.reserveToken) {
    projectionInvariant("pons buyback exceeds token reserve", "curve.reserveToken");
  }
  return {
    reserveToken: reserves.reserveToken - buyback.tokensLocked,
    reserveQuote: reserves.reserveQuote + buyback.quoteSpent,
  };
}

/**
 * Applies the protocol's event-ordering rules without choosing storage or
 * attaching chain metadata. Replaying the same terminal event is idempotent.
 */
export function foldPonsLifecyclePhase(
  current: PonsLifecyclePhase,
  next: PonsLifecycleTransition,
): PonsLifecyclePhase {
  const allowed = next === "swept"
    ? current === "bonding" || current === "swept"
    : current === "swept" || current === next;
  if (!allowed) throw new PonsLifecycleTransitionError(current, next);
  return next;
}
