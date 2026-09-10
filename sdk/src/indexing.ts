import { parseAbi, toEventSignature, type Abi, type AbiEvent, type Address, type Hex } from "viem";
import { ponsFactoryAbi, ponsForwarderAbi, ponsCurveAbi, ponsMemeHookAbi, ponsFeeEscrowAbi, ponsBuybackVaultAbi, ponsTokenAbi } from "./abis.js";
import { PonsSdkError } from "./errors.js";
import { ABI_REVISION } from "./abis.js";
import { getPonsDeployment } from "./deployments.js";

export const PONS_INDEXING_MANIFEST_VERSION = 1 as const;

export type PonsIndexingContractName =
  | "PonsV2Forwarder"
  | "PonsV2Factory"
  | "PonsV2Curve"
  | "PonsV2MemeHook"
  | "PonsV2FeeEscrow"
  | "PonsV2BuybackVault"
  | "PonsLaunchToken";

export type PonsIndexingDependencyName = "UniswapV4PoolManager";
export type PonsIndexingSourceName = PonsIndexingContractName | PonsIndexingDependencyName;

export interface PonsIndexingContract {
  name: PonsIndexingContractName;
  artifact: string;
  events: readonly string[];
}

export interface PonsIndexingDependency {
  name: PonsIndexingDependencyName;
  artifact: string;
  events: readonly string[];
  filters: readonly {
    event: "Swap";
    parameter: "id";
    includeWhenRegisteredBy: {
      contract: "PonsV2MemeHook";
      event: "PoolRegistered";
      parameter: "poolId";
    };
  }[];
}

export interface PonsFixedIndexingSource {
  kind: "fixed";
  contract: PonsIndexingSourceName;
  address: Address;
  startBlock: bigint;
  expectedRuntimeCodeHash?: Hex;
}

export interface PonsDynamicIndexingSource {
  kind: "dynamic";
  contract: PonsIndexingContractName;
  startFrom: "discovery-block";
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
  catalog: readonly PonsIndexingEvent[];
  materializations: readonly PonsMaterialization[];
  contracts: readonly PonsIndexingContract[];
  dependencies: readonly PonsIndexingDependency[];
  sources: readonly (PonsFixedIndexingSource | PonsDynamicIndexingSource)[];
}

/** Each supported ABI is checked in full; dependency selection is deliberately narrower. */
const catalogAbis = {
  PonsV2Factory: ponsFactoryAbi,
  PonsV2Curve: ponsCurveAbi,
  PonsV2MemeHook: ponsMemeHookAbi,
  PonsV2FeeEscrow: ponsFeeEscrowAbi,
  PonsV2BuybackVault: ponsBuybackVaultAbi,
  PonsLaunchToken: ponsTokenAbi,
  PonsV2Forwarder: ponsForwarderAbi,
  UniswapV4PoolManager: parseAbi([
    "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
    "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  ]),
} as const satisfies Record<PonsIndexingSourceName, Abi>;

export const ponsIndexingAbis: Readonly<Record<PonsIndexingSourceName, Abi>> = deepFreeze(catalogAbis);

export interface PonsParameterSemantic {
  unit: "address" | "identifier" | "boolean" | "raw-amount" | "seconds" | "tick" | "ppm" | "sqrt-price-x96" | "liquidity";
  description: string;
  asset?: string;
  decimals?: string;
}
export interface PonsIndexingEvent {
  contract: PonsIndexingSourceName;
  name: string;
  signature: string;
  description: string;
  abi: AbiEvent;
  parameters: readonly { name: string; type: string; indexed: boolean; semantic: PonsParameterSemantic }[];
}
type EventMetadata<A extends Abi> = {
  [E in Extract<A[number], { type: "event" }> as E["name"]]: {
    description: string;
    parameters: { [P in E["inputs"][number] as P["name"] & string]: PonsParameterSemantic };
  };
};
const address = (description: string): PonsParameterSemantic => ({ unit: "address", description });
const identifier = (description: string): PonsParameterSemantic => ({ unit: "identifier", description });
const amount = (asset: string, description: string): PonsParameterSemantic => ({
  unit: "raw-amount", description, asset,
  decimals: asset === "native currency" ? "18" : `ERC-20 decimals of ${asset}; native currency sentinel uses 18`,
});
const quote = (description: string) => amount("launch pairToken (pool quoteToken for hook events)", description);
const token = (description: string) => amount("launch token (emitter for Transfer; token parameter for vault)", description);

const metadata = {
  PonsV2Factory: {
    LaunchConfigUpdated: { description: "Factory configuration replaced; read the configuration at this block for its final values.", parameters: { id: identifier("Factory launch configuration ID") } },
    TokenLaunched: { description: "Launch identity and dynamic curve/token discovery.", parameters: { token: address("Launched token"), curve: address("Bonding curve"), deployer: address("Launch deployer"), pairToken: address("Quote asset"), launchConfigId: identifier("Factory launch configuration ID"), graduationThreshold: quote("Graduation threshold") } },
    LaunchSwept: { description: "Assets swept from a completed curve.", parameters: { token: address("Launch token"), quoteOut: quote("Quote swept"), tokenOut: token("Tokens swept") } },
    CreatorFeeRecipientUpdated: { description: "Creator fee recipient changed.", parameters: { token: address("Launch token"), previousRecipient: address("Previous recipient"), newRecipient: address("New recipient") } },
    BuybackEnabledUpdated: { description: "Launch buyback setting changed.", parameters: { token: address("Launch token"), enabled: { unit: "boolean", description: "Buyback enabled" }, controller: address("Authorizing controller") } },
    PoolGraduated: { description: "Launch graduated into a liquidity position.", parameters: { token: address("Launch token"), positionId: identifier("Liquidity position NFT ID"), tokenAmount: token("Tokens deposited"), pairTokenAmount: quote("Quote deposited") } },
    LaunchGraduationRescued: { description: "Graduation assets rescued to a recipient.", parameters: { token: address("Launch token"), recipient: address("Rescue recipient"), quoteAmount: quote("Quote rescued"), tokenAmount: token("Tokens rescued") } },
  },
  PonsV2Curve: {
    CurveBuy: { description: "Bonding curve purchase.", parameters: { buyer: address("Buyer"), recipient: address("Token recipient"), quoteIn: quote("Quote input"), tokensOut: token("Tokens output"), fee: quote("Curve fee"), tax: quote("Creator trade tax") } },
    CurveBuyRefunded: { description: "Unused buy quote refunded.", parameters: { buyer: address("Refund recipient"), refund: quote("Quote refunded") } },
    CurveSell: { description: "Bonding curve sale.", parameters: { seller: address("Seller"), recipient: address("Quote recipient"), tokensIn: token("Tokens input"), quoteOut: quote("Quote output"), fee: quote("Curve fee"), tax: quote("Creator trade tax") } },
    FeesSwept: { description: "Curve quote fees distributed.", parameters: { protocolAmount: quote("Protocol fees"), buybackAmount: quote("Buyback budget"), creatorAmount: quote("Creator fees") } },
    BuybackLocked: { description: "Buyback tokens locked from curve quote spending.", parameters: { quoteSpent: quote("Quote spent"), tokensLocked: token("Tokens locked") } },
    CurveCompleted: { description: "Completed curve assets transferred.", parameters: { recipient: address("Asset recipient"), quoteOut: quote("Quote output"), tokenOut: token("Tokens output") } },
  },
  PonsV2MemeHook: {
    PoolRegistered: { description: "Hook proves pool membership in Pons.", parameters: { poolId: identifier("Uniswap v4 pool ID"), memecoin: address("Launch token"), quoteToken: address("Quote asset"), creator: address("Creator") } },
    ProtocolFeeRecipientUpdated: { description: "Hook protocol fee recipient changed.", parameters: { recipient: address("New protocol recipient") } },
    HookFeeCollected: { description: "Hook fee and tax collected in the stated currency.", parameters: { poolId: identifier("Pool ID"), currency: address("Fee currency"), feeAmount: amount("currency parameter", "Hook fee"), taxAmount: amount("currency parameter", "Hook tax") } },
    PoolFeesSwept: { description: "Pool quote fees distributed and buyback tokens locked.", parameters: { poolId: identifier("Pool ID"), protocolAmount: quote("Protocol fees"), buybackAmount: quote("Quote spent on buyback"), creatorAmount: quote("Creator fees"), tokensLocked: token("Tokens locked") } },
    PoolFeesRescued: { description: "Pool quote fees rescued.", parameters: { poolId: identifier("Pool ID"), quoteToken: address("Quote asset"), protocolAmount: amount("quoteToken parameter", "Protocol fees rescued"), creatorAmount: amount("quoteToken parameter", "Creator fees rescued") } },
  },
  PonsV2FeeEscrow: {
    Claimed: { description: "Native escrow balance claimed.", parameters: { recipient: address("Recipient"), amount: amount("native currency", "Amount claimed") } },
    ClaimedToken: { description: "Token escrow balance claimed.", parameters: { recipient: address("Recipient"), token: address("Escrow asset"), amount: amount("token parameter", "Amount claimed") } },
    Credited: { description: "Native escrow balance credited.", parameters: { recipient: address("Recipient"), depositor: address("Depositor"), amount: amount("native currency", "Amount credited") } },
    CreditedToken: { description: "Token escrow balance credited.", parameters: { recipient: address("Recipient"), token: address("Escrow asset"), depositor: address("Depositor"), amount: amount("token parameter", "Amount credited") } },
  },
  PonsV2BuybackVault: {
    Locked: { description: "Bought-back launch tokens locked with a vesting start.", parameters: { token: address("Locked token"), depositor: address("Depositor"), amount: amount("token parameter", "Amount locked"), newVestingStart: { unit: "seconds", description: "Unix vesting start timestamp" } } },
    Released: { description: "Vested tokens released to creator and protocol.", parameters: { token: address("Released token"), creatorAmount: amount("token parameter", "Creator token amount"), protocolAmount: amount("token parameter", "Protocol token amount") } },
    CreatorRecipientUpdated: { description: "Vault creator recipient changed.", parameters: { token: address("Launch token"), previousRecipient: address("Previous recipient"), newRecipient: address("New recipient") } },
  },
  PonsLaunchToken: {
    Transfer: { description: "Launch token transfer; zero-address sender proves full-supply mint.", parameters: { from: address("Sender; zero for mint"), to: address("Recipient"), value: amount("emitting launch token", "Transferred token amount") } },
  },
  PonsV2Forwarder: {
    Launched: { description: "Forwarded launch and initial purchase completed.", parameters: { token: address("Launch token"), curve: address("Curve"), recipient: address("Token recipient"), launcher: address("Launcher"), quoteSpent: quote("Quote spent"), tokensReceived: token("Tokens received") } },
  },
  UniswapV4PoolManager: {
    Swap: { description: "Swap retained only for a pool registered by the Pons hook.", parameters: { id: identifier("Pool ID"), sender: address("Swap sender"), amount0: amount("pool currency0 (address-sorted currency)", "Signed PoolManager currency0 delta"), amount1: amount("pool currency1 (address-sorted currency)", "Signed PoolManager currency1 delta"), sqrtPriceX96: { unit: "sqrt-price-x96", description: "Square root of raw currency1/currency0 price scaled by 2^96" }, liquidity: { unit: "liquidity", description: "Active Uniswap v4 liquidity, not a token balance" }, tick: { unit: "tick", description: "Post-swap price tick" }, fee: { unit: "ppm", description: "Swap fee in millionths" } } },
  },
} satisfies {
  [C in PonsIndexingContractName]: EventMetadata<typeof catalogAbis[C]>
} & { UniswapV4PoolManager: Pick<EventMetadata<typeof catalogAbis.UniswapV4PoolManager>, "Swap"> };

export const ponsIndexingCatalog: readonly PonsIndexingEvent[] = deepFreeze(
  Object.entries(catalogAbis).flatMap(([contract, abi]) => {
    const descriptions: Record<string, { description: string; parameters: Record<string, PonsParameterSemantic> }> = metadata[contract as PonsIndexingSourceName];
    return abi.filter((item): item is Extract<typeof item, { type: "event" }> => item.type === "event")
      .filter(item => contract !== "UniswapV4PoolManager" || item.name === "Swap")
      .map(event => {
        const info = descriptions[event.name];
        if (!info) throw new PonsSdkError("INVALID_ARGUMENT", `Missing indexing metadata for ${contract}.${event.name}`);
        return {
          contract: contract as PonsIndexingSourceName, name: event.name,
          signature: toEventSignature(event), description: info.description, abi: event,
          parameters: event.inputs.map(input => {
            const semantic = info.parameters[input.name];
            if (!semantic) throw new PonsSdkError("INVALID_ARGUMENT", `Missing indexing semantic for ${contract}.${event.name}.${input.name}`);
            return { name: input.name, type: input.type, indexed: "indexed" in input && input.indexed === true, semantic };
          }),
        };
      });
  }),
);
const EVENTS = Object.fromEntries(
  Object.keys(ponsIndexingAbis).filter(name => name !== "UniswapV4PoolManager")
    .map(name => [name, ponsIndexingCatalog.filter(event => event.contract === name).map(event => event.name)]),
);

/** Restricted data expressions keep owner intent independent of generated TypeScript. */
export type PonsIndexingValue =
  | { parameter: string; lowercase?: boolean }
  | { event: "srcAddress" | "block.number"; lowercase?: boolean };
export interface PonsMaterialization {
  name: "PonsLaunch" | "PonsPool";
  description: string;
  fields: Readonly<Record<string, { type: "String" | "BigInt"; required?: boolean; index?: boolean }>>;
  updates: readonly {
    contract: PonsIndexingSourceName;
    event: string;
    key: PonsIndexingValue;
    when?: { parameter: string; equals: string };
    set: Readonly<Record<string, PonsIndexingValue>>;
    assertUnchanged?: readonly string[];
  }[];
}
const param = (parameter: string, lowercase = false): PonsIndexingValue => ({ parameter, lowercase });
const block: PonsIndexingValue = { event: "block.number" };
const source: PonsIndexingValue = { event: "srcAddress", lowercase: true };
export const ponsIndexingMaterializations: readonly PonsMaterialization[] = deepFreeze<PonsMaterialization[]>([
  {
    name: "PonsLaunch", description: "Chain-scoped launch identity and exact full-supply mint evidence; preserve partial state in either event order.",
    fields: {
      token: { type: "String", required: true, index: true }, curve: { type: "String", index: true }, deployer: { type: "String", index: true }, pairToken: { type: "String" },
      launchConfigId: { type: "BigInt" }, graduationThreshold: { type: "BigInt" }, canonicalSupply: { type: "BigInt" }, createdBlock: { type: "BigInt" }, supplyMintBlock: { type: "BigInt" },
    },
    updates: [
      { contract: "PonsV2Factory", event: "TokenLaunched", key: param("token", true), set: { token: param("token", true), curve: param("curve", true), deployer: param("deployer", true), pairToken: param("pairToken", true), launchConfigId: param("launchConfigId"), graduationThreshold: param("graduationThreshold"), createdBlock: block } },
      { contract: "PonsLaunchToken", event: "Transfer", key: source, when: { parameter: "from", equals: "0x0000000000000000000000000000000000000000" }, assertUnchanged: ["canonicalSupply"], set: { token: source, canonicalSupply: param("value"), supplyMintBlock: block } },
    ],
  },
  {
    name: "PonsPool", description: "Chain-scoped pool membership proven by the deployed Pons hook; unknown PoolManager pools are excluded.",
    fields: { token: { type: "String", required: true, index: true }, quoteToken: { type: "String", required: true, index: true }, creator: { type: "String", required: true, index: true }, registeredBlock: { type: "BigInt", required: true } },
    updates: [{ contract: "PonsV2MemeHook", event: "PoolRegistered", key: param("poolId", true), set: { token: param("memecoin", true), quoteToken: param("quoteToken", true), creator: param("creator", true), registeredBlock: block } }],
  },
]);

const contracts = (Object.entries(EVENTS) as [PonsIndexingContractName, readonly string[]][])
  .map(([name, events]) => ({
    name,
    artifact: `@reptilianhq/pons-sdk/artifacts/${name}.json`,
    events,
  }));

const dependencies: readonly PonsIndexingDependency[] = [{
  name: "UniswapV4PoolManager",
  artifact: "@reptilianhq/pons-sdk/artifacts/UniswapV4PoolManager.json",
  events: ["Swap"],
  filters: [{
    event: "Swap",
    parameter: "id",
    includeWhenRegisteredBy: {
      contract: "PonsV2MemeHook",
      event: "PoolRegistered",
      parameter: "poolId",
    },
  }],
}];

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
    catalog: ponsIndexingCatalog,
    materializations: ponsIndexingMaterializations,
    contracts,
    dependencies,
    sources: [
      fixed("PonsV2Forwarder", deployment.contracts.forwarder, startBlock, deployment.forwarderRuntimeCodeHash),
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
  contract: PonsIndexingSourceName,
  address: Address,
  startBlock: bigint,
  expectedRuntimeCodeHash?: Hex,
): PonsFixedIndexingSource {
  return { kind: "fixed", contract, address, startBlock, expectedRuntimeCodeHash };
}

function dynamic(contract: PonsIndexingContractName, addressParameter: string): PonsDynamicIndexingSource {
  return {
    kind: "dynamic",
    startFrom: "discovery-block",
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
