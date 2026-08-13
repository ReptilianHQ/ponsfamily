import { getAddress, type Address, type Hex } from "viem";
import { ABI_REVISION } from "./abis.js";
import { PonsSdkError } from "./errors.js";

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_TESTNET_ID = 46630;

export interface PonsV2Contracts {
  factory: Address;
  forwarder: Address;
  launchDeployer: Address;
  graduationExecutor: Address;
  graduationGuard: Address;
  poolManager: Address;
  positionManager: Address;
  permit2: Address;
  locker: Address;
  memeHook: Address;
  feeEscrow: Address;
  buybackVault: Address;
}

export interface PonsDeployment {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  abiRevision: string;
  sourceCommit: string;
  startBlock: bigint;
  factoryRuntimeCodeHash: Hex;
  forwarderRuntimeCodeHash: Hex;
  memeHookRuntimeCodeHash: Hex;
  feeEscrowRuntimeCodeHash: Hex;
  buybackVaultRuntimeCodeHash: Hex;
  contracts: PonsV2Contracts;
}

export const robinhoodMainnet: PonsDeployment = deepFreeze({
  name: "Robinhood Chain Mainnet",
  chainId: ROBINHOOD_CHAIN_ID,
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: "https://robinhoodchain.blockscout.com",
  abiRevision: ABI_REVISION,
  sourceCommit: "836f0f97f9a9569855876570d6778501c163c883",
  startBlock: 26_841_846n,
  factoryRuntimeCodeHash: "0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84",
  forwarderRuntimeCodeHash: "0xed9065184519eaa24a22c2556403d5d8bbb230ff94dbc5c414cf5028e20e52e7",
  memeHookRuntimeCodeHash: "0xc21b1e6c1b45403e81a581f22ed6d9c747997af1cfdac1b1dc9f4b1d346a10db",
  feeEscrowRuntimeCodeHash: "0xf25f75cfbc1637ba068dc34f69098fa4e8a80f8ee8fe7bf7820594e0b3fed2f1",
  buybackVaultRuntimeCodeHash: "0x5de8480874faffefa539648f1a7d6c1e69b39da3fa34de22fc95eb7586aece03",
  contracts: {
    factory: getAddress("0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e"),
    forwarder: getAddress("0xe33E9E479dF8802cb0866d5d05258bEc4cF62948"),
    launchDeployer: getAddress("0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42"),
    graduationExecutor: getAddress("0xC7819B64A1dAECD7eC19856d026cb14EfBd89046"),
    graduationGuard: getAddress("0xf5695117b99B6f6401e67d4195BD653628176C6C"),
    poolManager: getAddress("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
    positionManager: getAddress("0x58daec3116aae6D93017bAAea7749052E8a04fA7"),
    permit2: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
    locker: getAddress("0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952"),
    memeHook: getAddress("0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044"),
    feeEscrow: getAddress("0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e"),
    buybackVault: getAddress("0x42df2a798f82289E177311362e8f5ccC45c1219c"),
  },
});

const deployments = [robinhoodMainnet] as const;

export function getPonsDeployment(chainId: number): PonsDeployment {
  const deployment = deployments.find((candidate) => candidate.chainId === chainId);
  if (!deployment) {
    throw new PonsSdkError("UNSUPPORTED_CHAIN", `Unsupported Pons chain ID ${chainId}`, {
      path: "chainId",
      actual: String(chainId),
    });
  }
  return deployment;
}

export function listPonsDeployments(): readonly PonsDeployment[] {
  return deployments;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
