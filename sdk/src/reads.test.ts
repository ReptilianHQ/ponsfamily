import { getAddress, zeroAddress, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { robinhoodMainnet } from "./deployments.js";
import { GraduationPhase, readLaunchConfigs, readLaunchLifecycle } from "./reads.js";

const token = getAddress("0x1111111111111111111111111111111111111111");
const curve = getAddress("0x2222222222222222222222222222222222222222");

describe("Pons reads", () => {
  it("rejects an implausible launch config count before allocating", async () => {
    const client = {
      readContract: vi.fn().mockResolvedValue(10_001n),
    } as unknown as PublicClient;

    await expect(readLaunchConfigs(client, robinhoodMainnet)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      path: "launchConfigCount",
    });
    expect(client.readContract).toHaveBeenCalledTimes(1);
  });

  it("reads lifecycle state at one pinned block", async () => {
    const readContract = vi.fn(async ({ functionName, blockNumber }: { functionName: string; blockNumber?: bigint }) => {
      expect(blockNumber).toBe(123n);
      if (functionName === "getLaunchedToken") return {
        token,
        curve,
        deployer: token,
        creatorFeeRecipient: token,
        pairToken: zeroAddress,
        graduationThreshold: 500n,
        poolFee: 10_000,
        tickSpacing: 200,
        creatorTaxBps: 100,
        buybackEnabled: true,
        phase: GraduationPhase.PoolCreated,
        sweptQuote: 500n,
        sweptTokens: 100n,
        sweptAt: 1n,
        exists: true,
      };
      if (functionName === "token") return token;
      if (functionName === "pairToken") return zeroAddress;
      if (functionName === "feeBps") return 100n;
      if (functionName === "creatorTaxBps") return 50n;
      if (functionName === "graduationThreshold") return 500n;
      if (functionName === "sellableTokens") return 0n;
      if (functionName === "getReserves") return [1_500n, 100n];
      if (functionName === "realQuoteReserve") return 500n;
      if (functionName === "readyToGraduate") return false;
      if (functionName === "graduated") return true;
      if (functionName === "lockedPositions") return 77n;
      throw new Error(`Unexpected read ${functionName}`);
    });
    const client = { getBlockNumber: vi.fn().mockResolvedValue(123n), readContract } as unknown as PublicClient;

    const lifecycle = await readLaunchLifecycle(client, robinhoodMainnet, token);

    expect(lifecycle).toMatchObject({
      blockNumber: 123n,
      phase: GraduationPhase.PoolCreated,
      graduationProgressBps: 10_000n,
      poolPositionId: 77n,
    });
    expect(readContract).toHaveBeenCalledTimes(12);
  });
});
