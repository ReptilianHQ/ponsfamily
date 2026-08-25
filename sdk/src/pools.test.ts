import { describe, expect, it } from "vitest";
import { derivePonsPoolId, memecoinIsCurrency0 } from "./pools.js";
import { robinhoodMainnet } from "./deployments.js";
import { PonsSdkError } from "./errors.js";

/**
 * The mainnet fixture is a real pool: the poolId was taken from a
 * HookFeeCollected log, and the key inputs from `launches(poolId)` on the meme
 * hook and `getLaunchedToken(token)` on the factory. The derivation was checked
 * against 12 live pools before being written down here.
 */
const MAINNET_POOL = {
  poolId: "0x9556da332cbd81cb7c9dd4116137bb04a29bb054bcce58cc8258ade304090965",
  token: "0xD928A068d2B90798373a470c9D9bA562322ACdeF",
  pairToken: "0x0000000000000000000000000000000000000000",
  fee: 0n,
  tickSpacing: 200n,
} as const;

describe("derivePonsPoolId", () => {
  it("reproduces a live mainnet pool id", () => {
    expect(derivePonsPoolId(robinhoodMainnet, {
      token: MAINNET_POOL.token,
      pairToken: MAINNET_POOL.pairToken,
      fee: MAINNET_POOL.fee,
      tickSpacing: MAINNET_POOL.tickSpacing,
    })).toBe(MAINNET_POOL.poolId);
  });

  it("does not accept wrapped native in place of the native currency", () => {
    // The trap this exists to prevent: indexers store wrapped native as the
    // quote token for valuation, and substituting it here produces a pool id
    // that does not exist on chain.
    expect(derivePonsPoolId(robinhoodMainnet, {
      token: MAINNET_POOL.token,
      pairToken: "0x4200000000000000000000000000000000000006",
      fee: MAINNET_POOL.fee,
      tickSpacing: MAINNET_POOL.tickSpacing,
    })).not.toBe(MAINNET_POOL.poolId);
  });

  it("is insensitive to address casing", () => {
    const lower = derivePonsPoolId(robinhoodMainnet, {
      token: MAINNET_POOL.token.toLowerCase() as `0x${string}`,
      pairToken: MAINNET_POOL.pairToken,
      fee: MAINNET_POOL.fee, tickSpacing: MAINNET_POOL.tickSpacing,
    });
    expect(lower).toBe(MAINNET_POOL.poolId);
  });

  it("sorts currencies, so token and pairToken may be given either way round", () => {
    const a = "0x1111111111111111111111111111111111111111" as const;
    const b = "0x2222222222222222222222222222222222222222" as const;
    expect(derivePonsPoolId(robinhoodMainnet, { token: a, pairToken: b, fee: 3_000n, tickSpacing: 60n }))
      .toBe(derivePonsPoolId(robinhoodMainnet, { token: b, pairToken: a, fee: 3_000n, tickSpacing: 60n }));
  });

  it("separates pools differing only in fee or tick spacing", () => {
    const base = {
      token: "0x1111111111111111111111111111111111111111",
      pairToken: "0x2222222222222222222222222222222222222222",
    } as const;
    const ids = new Set([
      derivePonsPoolId(robinhoodMainnet, { ...base, fee: 3_000n, tickSpacing: 60n }),
      derivePonsPoolId(robinhoodMainnet, { ...base, fee: 10_000n, tickSpacing: 60n }),
      derivePonsPoolId(robinhoodMainnet, { ...base, fee: 3_000n, tickSpacing: 200n }),
    ]);
    expect(ids.size).toBe(3);
  });

  it("accepts a negative tick spacing", () => {
    // int24 is signed. Encoding it unsigned would not throw, it would silently
    // produce a different id.
    expect(() => derivePonsPoolId(robinhoodMainnet, {
      token: "0x1111111111111111111111111111111111111111",
      pairToken: "0x2222222222222222222222222222222222222222",
      fee: 3_000n, tickSpacing: -60n,
    })).not.toThrow();
  });

  it("rejects out-of-range fee and tick spacing rather than truncating", () => {
    const base = {
      token: "0x1111111111111111111111111111111111111111",
      pairToken: "0x2222222222222222222222222222222222222222",
    } as const;
    expect(() => derivePonsPoolId(robinhoodMainnet, { ...base, fee: 0x1000000n, tickSpacing: 60n }))
      .toThrow(PonsSdkError);
    expect(() => derivePonsPoolId(robinhoodMainnet, { ...base, fee: 3_000n, tickSpacing: 0x800000n }))
      .toThrow(PonsSdkError);
  });
});

describe("memecoinIsCurrency0", () => {
  it("is address ordering", () => {
    expect(memecoinIsCurrency0(
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    )).toBe(true);
  });

  it("matches the hook for the live native-quote pool", () => {
    // The hook reports false for this pool: the memecoin sorts above 0x0.
    expect(memecoinIsCurrency0(MAINNET_POOL.token, MAINNET_POOL.pairToken)).toBe(false);
  });
});
