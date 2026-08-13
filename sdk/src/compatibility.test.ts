import { getAddress, keccak256, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { ABI_REVISION } from "./abis.js";
import { assertCompatibleDeployment } from "./compatibility.js";
import { robinhoodMainnet, type PonsDeployment } from "./deployments.js";

const factoryBytecode = "0x6000" as const;
const forwarderBytecode = "0x6001" as const;

function deployment(overrides: Partial<PonsDeployment> = {}): PonsDeployment {
  return {
    ...robinhoodMainnet,
    factoryRuntimeCodeHash: keccak256(factoryBytecode),
    forwarderRuntimeCodeHash: keccak256(forwarderBytecode),
    ...overrides,
  };
}

function compatibleClient(target = deployment()) {
  const readContract = vi.fn(async ({ functionName }: { functionName: string }) => {
    if (functionName === "factory") return target.contracts.factory;
    const key = functionName === "launchForwarder" ? "forwarder" : functionName;
    return target.contracts[key as keyof typeof target.contracts];
  });
  return {
    getChainId: vi.fn().mockResolvedValue(target.chainId),
    getBlockNumber: vi.fn().mockResolvedValue(123n),
    getBytecode: vi.fn(async ({ address }) => address === target.contracts.forwarder ? forwarderBytecode : factoryBytecode),
    readContract,
  } as unknown as PublicClient;
}

describe("deployment compatibility", () => {
  it("verifies code and every dependency pointer at one block", async () => {
    const target = deployment();
    const client = compatibleClient(target);

    const report = await assertCompatibleDeployment(client, target);

    expect(report).toEqual({
      chainId: target.chainId,
      blockNumber: 123n,
      abiRevision: ABI_REVISION,
      factoryCodeHash: keccak256(factoryBytecode),
      forwarderCodeHash: keccak256(forwarderBytecode),
      pointers: target.contracts,
    });
    expect(client.readContract).toHaveBeenCalledTimes(12);
    for (const call of vi.mocked(client.readContract).mock.calls) {
      expect(call[0]).toMatchObject({ blockNumber: 123n });
    }
  });

  it("fails closed on the wrong chain before reading bytecode", async () => {
    const target = deployment();
    const client = compatibleClient(target);
    vi.mocked(client.getChainId).mockResolvedValue(target.chainId + 1);

    await expect(assertCompatibleDeployment(client, target)).rejects.toMatchObject({ code: "CHAIN_MISMATCH" });
    expect(client.getBytecode).not.toHaveBeenCalled();
  });

  it("fails closed on missing or changed factory code", async () => {
    const target = deployment();
    const missingClient = compatibleClient(target);
    vi.mocked(missingClient.getBytecode).mockResolvedValue(undefined);
    await expect(assertCompatibleDeployment(missingClient, target)).rejects.toMatchObject({ code: "CODE_MISSING" });

    const changedClient = compatibleClient(target);
    vi.mocked(changedClient.getBytecode).mockResolvedValue("0x6001");
    await expect(assertCompatibleDeployment(changedClient, target)).rejects.toMatchObject({ code: "CODE_HASH_MISMATCH" });

    const changedForwarderClient = compatibleClient(target);
    vi.mocked(changedForwarderClient.getBytecode).mockImplementation(async ({ address }) =>
      address === target.contracts.forwarder ? "0x6002" : factoryBytecode);
    await expect(assertCompatibleDeployment(changedForwarderClient, target)).rejects.toMatchObject({
      code: "CODE_HASH_MISMATCH",
      path: "contracts.forwarder",
    });
  });

  it("reports a changed factory dependency by its stable path", async () => {
    const target = deployment();
    const client = compatibleClient(target);
    vi.mocked(client.readContract).mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === "factory") return target.contracts.factory;
      if (functionName === "locker") return getAddress("0x9999999999999999999999999999999999999999");
      const key = functionName === "launchForwarder" ? "forwarder" : functionName;
      return target.contracts[key as keyof typeof target.contracts];
    });

    await expect(assertCompatibleDeployment(client, target)).rejects.toMatchObject({
      code: "POINTER_MISMATCH",
      path: "contracts.locker",
    });
  });
});
