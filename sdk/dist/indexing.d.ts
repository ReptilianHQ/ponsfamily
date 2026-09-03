import type { Address, Hex } from "viem";
export declare const PONS_INDEXING_MANIFEST_VERSION: 1;
export type PonsIndexingContractName = "PonsV2Factory" | "PonsV2Curve" | "PonsV2MemeHook" | "PonsV2FeeEscrow" | "PonsV2BuybackVault" | "PonsLaunchToken" | "UniswapV4PoolManager";
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
/**
 * Returns the versioned public-event topology for a Pons deployment.
 *
 * Consumers remain responsible for Envio runtime tuning, persistence, pricing,
 * wallet attribution, and which advertised events they choose to subscribe to.
 */
export declare function getPonsIndexingManifest(chainId?: number): PonsIndexingManifest;
