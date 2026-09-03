import type { Address, Hex } from "viem";
export declare const PONS_INDEXING_MANIFEST_VERSION: 1;
export type PonsIndexingContractName = "PonsV2Factory" | "PonsV2Curve" | "PonsV2MemeHook" | "PonsV2FeeEscrow" | "PonsV2BuybackVault" | "PonsLaunchToken";
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
    dependencies: readonly PonsIndexingDependency[];
    sources: readonly (PonsFixedIndexingSource | PonsDynamicIndexingSource)[];
}
/**
 * Returns the versioned public-event topology for a Pons deployment.
 *
 * Consumers remain responsible for Envio runtime tuning, persistence, pricing,
 * wallet attribution, and which advertised events they choose to subscribe to.
 */
export declare function getPonsIndexingManifest(chainId?: number): PonsIndexingManifest;
