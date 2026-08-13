import { getAddress, zeroAddress, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { robinhoodMainnet } from "./deployments.js";
import { GraduationPhase, derivePonsGraduatedPoolId, readBuybackVest, readFeeEscrowBalances, readLaunchConfigs, readLaunchLifecycle } from "./reads.js";

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

  it("derives one token-order-independent graduated pool identity", () => {
    const left = derivePonsGraduatedPoolId({
      token, pairToken: zeroAddress, poolFee: 10_000, tickSpacing: 200,
      memeHook: robinhoodMainnet.contracts.memeHook,
    });
    const right = derivePonsGraduatedPoolId({
      token: zeroAddress, pairToken: token, poolFee: 10_000, tickSpacing: 200,
      memeHook: robinhoodMainnet.contracts.memeHook,
    });
    expect(left).toMatch(/^0x[0-9a-f]{64}$/);
    expect(left).toBe(right);
  });

  it("reads escrow claims and buyback vesting at a pinned block", async () => {
    const quote = getAddress("0x3333333333333333333333333333333333333333");
    const readContract = vi.fn(async ({ functionName, args, blockNumber }: { functionName: string; args: readonly unknown[]; blockNumber?: bigint }) => {
      expect(blockNumber).toBe(123n);
      if (functionName === "balanceOf") return 5n;
      if (functionName === "balanceOfToken") return args[1] === quote ? 7n : 0n;
      if (functionName === "totalLocked") return 100n;
      if (functionName === "totalReleased") return 20n;
      if (functionName === "vestedAmount") return 30n;
      if (functionName === "releasable") return 10n;
      if (functionName === "vestingTerms") return [account, quote, 3_000];
      throw new Error(`Unexpected read ${functionName}`);
    });
    const account = getAddress("0x4444444444444444444444444444444444444444");
    const client = { readContract } as unknown as PublicClient;
    await expect(readFeeEscrowBalances(client, robinhoodMainnet, account, [quote], { blockNumber: 123n })).resolves.toEqual({
      recipient: account, native: 5n, tokens: [{ token: quote, balance: 7n }],
    });
    await expect(readBuybackVest(client, robinhoodMainnet, token, { blockNumber: 123n })).resolves.toMatchObject({
      token, totalLocked: 100n, totalReleased: 20n, vestedAmount: 30n, releasable: 10n,
      creatorRecipient: account, protocolRecipient: quote, protocolFeeShareBps: 3_000,
    });
  });
});
