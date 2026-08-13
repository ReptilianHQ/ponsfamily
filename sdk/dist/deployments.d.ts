import { type Address, type Hex } from "viem";
export declare const ROBINHOOD_CHAIN_ID = 4663;
export declare const ROBINHOOD_CHAIN_TESTNET_ID = 46630;
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
export declare const robinhoodMainnet: PonsDeployment;
export declare function getPonsDeployment(chainId: number): PonsDeployment;
export declare function listPonsDeployments(): readonly PonsDeployment[];
