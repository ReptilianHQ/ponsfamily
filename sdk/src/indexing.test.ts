import { describe, expect, it } from "vitest";
import { ABI_REVISION } from "./abis.js";
import { robinhoodMainnet } from "./deployments.js";
import { getPonsIndexingManifest, PONS_INDEXING_MANIFEST_VERSION } from "./indexing.js";

describe("Pons indexing manifest", () => {
  it("pins the complete source topology to deployment provenance", () => {
    const manifest = getPonsIndexingManifest(robinhoodMainnet.chainId);
    expect(manifest).toMatchObject({
      schemaVersion: PONS_INDEXING_MANIFEST_VERSION,
      abiRevision: ABI_REVISION,
      coverage: "pons-v2-public-events",
      chainId: robinhoodMainnet.chainId,
      startBlock: robinhoodMainnet.startBlock,
    });
    expect(manifest.contracts.map(({ name }) => name)).toEqual([
      "PonsV2Factory",
      "PonsV2Curve",
      "PonsV2MemeHook",
      "PonsV2FeeEscrow",
      "PonsV2BuybackVault",
      "PonsLaunchToken",
      "UniswapV4PoolManager",
    ]);
    expect(manifest.sources).toContainEqual(expect.objectContaining({
      kind: "fixed",
      contract: "UniswapV4PoolManager",
      address: robinhoodMainnet.contracts.poolManager,
    }));
    expect(manifest.sources).toContainEqual({
      kind: "dynamic",
      contract: "PonsV2Curve",
      registeredBy: { contract: "PonsV2Factory", event: "TokenLaunched", addressParameter: "curve" },
    });
  });

  it("is deeply immutable", () => {
    const manifest = getPonsIndexingManifest();
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.contracts)).toBe(true);
    expect(Object.isFrozen(manifest.sources[0])).toBe(true);
  });
});
