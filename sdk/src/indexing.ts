import type { Address, Hex } from "viem";
import { ABI_REVISION } from "./abis.js";
import { getPonsDeployment } from "./deployments.js";

export const PONS_INDEXING_MANIFEST_VERSION = 1 as const;

export type PonsIndexingContractName =
  | "PonsV2Factory"
  | "PonsV2Curve"
  | "PonsV2MemeHook"
  | "PonsV2FeeEscrow"
  | "PonsV2BuybackVault"
  | "PonsLaunchToken"
  | "UniswapV4PoolManager";

export interface PonsIndexingContract {
  name: PonsIndexingContractName;
  artifact: string;
  events: readonly string[];
}

export interface PonsFixedIndexingSource {
  kind: "fixed";
  contract: PonsIndexingContractName;
  address: Address;
  startBlock: bigint;
  expectedRuntimeCodeHash?: Hex;
}

export interface PonsDynamicIndexingSource {
  kind: "dynamic";
  contract: PonsIndexingContractName;
  registeredBy: {
    contract: PonsIndexingContractName;
    event: string;
    addressParameter: string;
  };
}

export interface PonsIndexingManifest {
  schemaVersion: typeof PONS_INDEXING_MANIFEST_VERSION;
  abiRevision: string;
  coverage: "pons-v2-public-events";
  chainId: number;
  startBlock: bigint;
  contracts: readonly PonsIndexingContract[];
  sources: readonly (PonsFixedIndexingSource | PonsDynamicIndexingSource)[];
}

const EVENTS = {
  PonsV2Factory: [
    "TokenLaunched",
    "LaunchSwept",
    "CreatorFeeRecipientUpdated",
    "BuybackEnabledUpdated",
    "PoolGraduated",
    "LaunchGraduationRescued",
  ],
  PonsV2Curve: [
    "CurveBuy",
    "CurveBuyRefunded",
    "CurveSell",
    "FeesSwept",
    "BuybackLocked",
    "CurveCompleted",
  ],
  PonsV2MemeHook: [
    "PoolRegistered",
    "ProtocolFeeRecipientUpdated",
    "HookFeeCollected",
    "PoolFeesSwept",
    "PoolFeesRescued",
  ],
  PonsV2FeeEscrow: ["Claimed", "ClaimedToken", "Credited", "CreditedToken"],
  PonsV2BuybackVault: ["Locked", "Released", "CreatorRecipientUpdated"],
  PonsLaunchToken: ["Transfer"],
  UniswapV4PoolManager: ["Initialize", "Swap"],
} as const satisfies Record<PonsIndexingContractName, readonly string[]>;

const contracts = (Object.entries(EVENTS) as [PonsIndexingContractName, readonly string[]][])
  .map(([name, events]) => ({
    name,
    artifact: `@reptilianhq/pons-sdk/artifacts/${name}.json`,
    events,
  }));

/**
 * Returns the versioned public-event topology for a Pons deployment.
 *
 * Consumers remain responsible for Envio runtime tuning, persistence, pricing,
 * wallet attribution, and which advertised events they choose to subscribe to.
 */
export function getPonsIndexingManifest(chainId = 4663): PonsIndexingManifest {
  const deployment = getPonsDeployment(chainId);
  const { startBlock } = deployment;
  return deepFreeze({
    schemaVersion: PONS_INDEXING_MANIFEST_VERSION,
    abiRevision: ABI_REVISION,
    coverage: "pons-v2-public-events",
    chainId,
    startBlock,
    contracts,
    sources: [
      fixed("PonsV2Factory", deployment.contracts.factory, startBlock, deployment.factoryRuntimeCodeHash),
      fixed("PonsV2MemeHook", deployment.contracts.memeHook, startBlock, deployment.memeHookRuntimeCodeHash),
      fixed("PonsV2FeeEscrow", deployment.contracts.feeEscrow, startBlock, deployment.feeEscrowRuntimeCodeHash),
      fixed("PonsV2BuybackVault", deployment.contracts.buybackVault, startBlock, deployment.buybackVaultRuntimeCodeHash),
      fixed("UniswapV4PoolManager", deployment.contracts.poolManager, startBlock),
      dynamic("PonsV2Curve", "curve"),
      dynamic("PonsLaunchToken", "token"),
    ],
  });
}

function fixed(
  contract: PonsIndexingContractName,
  address: Address,
  startBlock: bigint,
  expectedRuntimeCodeHash?: Hex,
): PonsFixedIndexingSource {
  return { kind: "fixed", contract, address, startBlock, expectedRuntimeCodeHash };
}

function dynamic(contract: PonsIndexingContractName, addressParameter: string): PonsDynamicIndexingSource {
  return {
    kind: "dynamic",
    contract,
    registeredBy: { contract: "PonsV2Factory", event: "TokenLaunched", addressParameter },
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
