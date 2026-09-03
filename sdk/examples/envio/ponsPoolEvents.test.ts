import { describe, expect, it, vi } from "vitest";
import { captureKnownPonsPoolEvent } from "./src/ponsPoolEvents.js";

describe("Pons PoolManager event filtering", () => {
  it("captures only pool IDs registered by the Pons hook", async () => {
    const knownPoolId = "0xABC";
    const capture = vi.fn();
    const loadPool = vi.fn(async (poolId: string) => (
      poolId === knownPoolId.toLowerCase() ? { id: poolId } : undefined
    ));

    await expect(captureKnownPonsPoolEvent(knownPoolId, loadPool, capture)).resolves.toBe(true);
    await expect(captureKnownPonsPoolEvent("0xDEF", loadPool, capture)).resolves.toBe(false);

    expect(loadPool).toHaveBeenNthCalledWith(1, "0xabc");
    expect(loadPool).toHaveBeenNthCalledWith(2, "0xdef");
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
