import { describe, expect, it } from "vitest";
import {
  PonsCurveReserveUnderflowError,
  PonsLifecycleTransitionError,
  foldPonsBuyback,
  foldPonsCurveBuy,
  foldPonsCurveSell,
  foldPonsLifecyclePhase,
  parsePonsLifecyclePhase,
} from "./projection.js";

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to throw");
}

describe("Pons projection", () => {
  it("folds curve buys, sells, and buybacks with exact bigint accounting", () => {
    const bought = foldPonsCurveBuy(
      { reserveToken: 1_000n, reserveQuote: 200n },
      { tokensOut: 100n, quoteIn: 70n, fee: 5n, tax: 2n },
    );
    expect(bought).toEqual({ reserveToken: 900n, reserveQuote: 263n });
    expect(foldPonsBuyback(bought, { quoteSpent: 20n, tokensLocked: 30n }))
      .toEqual({ reserveToken: 870n, reserveQuote: 283n });
    expect(foldPonsCurveSell(
      bought,
      { tokensIn: 100n, quoteOut: 50n, fee: 5n, tax: 2n },
    )).toEqual({ reserveToken: 1_000n, reserveQuote: 206n });
  });

  it("fails closed on impossible reserve updates with machine-readable errors", () => {
    expect(captureError(() => foldPonsCurveBuy(
      { reserveToken: 10n, reserveQuote: 0n },
      { tokensOut: 11n, quoteIn: 2n, fee: 1n, tax: 0n },
    ))).toMatchObject({ code: "PROJECTION_INVARIANT" });
    expect(captureError(() => foldPonsBuyback(
      { reserveToken: 10n, reserveQuote: 0n },
      { quoteSpent: 1n, tokensLocked: 11n },
    ))).toMatchObject({ code: "PROJECTION_INVARIANT" });

    const thrown = captureError(() => {
      foldPonsCurveSell(
        { reserveToken: 10n, reserveQuote: 2n },
        { tokensIn: 1n, quoteOut: 2n, fee: 1n, tax: 0n },
      );
    });
    expect(thrown).toBeInstanceOf(PonsCurveReserveUnderflowError);
    expect(thrown).toMatchObject({
      code: "PROJECTION_RESERVE_UNDERFLOW",
      reserveQuote: 2n,
      grossReleased: 3n,
    });
  });

  it("allows exact reserve drains", () => {
    expect(foldPonsCurveSell(
      { reserveToken: 10n, reserveQuote: 3n },
      { tokensIn: 1n, quoteOut: 2n, fee: 1n, tax: 0n },
    )).toEqual({ reserveToken: 11n, reserveQuote: 0n });
  });

  it("folds legal lifecycle transitions and idempotent event replays", () => {
    expect(foldPonsLifecyclePhase("bonding", "swept")).toBe("swept");
    expect(foldPonsLifecyclePhase("swept", "pool_created")).toBe("pool_created");
    expect(foldPonsLifecyclePhase("swept", "rescued")).toBe("rescued");
    expect(foldPonsLifecyclePhase("pool_created", "pool_created")).toBe("pool_created");
  });

  it("rejects lifecycle transitions that contradict event order", () => {
    expect(() => foldPonsLifecyclePhase("bonding", "pool_created"))
      .toThrow(PonsLifecycleTransitionError);
    expect(captureError(() => foldPonsLifecyclePhase("rescued", "pool_created"))).toMatchObject({
      code: "PROJECTION_LIFECYCLE_TRANSITION",
      current: "rescued",
      next: "pool_created",
    });
  });

  it("validates lifecycle phases read from persistence", () => {
    expect(parsePonsLifecyclePhase("bonding")).toBe("bonding");
    expect(captureError(() => parsePonsLifecyclePhase("graduated"))).toMatchObject({
      code: "PROJECTION_INVARIANT",
      path: "launch.lifecyclePhase",
    });
  });
});
