import { getPonsV4Provider } from './v4-provider.js';
import { type Abi, type AbiEvent, type Address, type Hex } from "viem";
export declare const PONS_INDEXING_MANIFEST_VERSION: 2;
export type PonsIndexingContractName = "PonsV2Forwarder" | "PonsV2Factory" | "PonsV2Curve" | "PonsV2MemeHook" | "PonsV2FeeEscrow" | "PonsV2BuybackVault" | "PonsLaunchToken";
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
export interface PonsSharedIndexingSource {
    kind: 'shared';
    contract: 'UniswapV4PoolManager';
    address: Address;
    startBlock: bigint;
    selection: 'verified-pool-ids';
    filterAt: 'ingestion';
    emptySelection: 'no-subscription';
}
export interface PonsIndexingManifest {
    schemaVersion: typeof PONS_INDEXING_MANIFEST_VERSION;
    composition: ReturnType<typeof getPonsV4Provider>;
    abiRevision: string;
    coverage: "pons-v2-public-events";
    chainId: number;
    startBlock: bigint;
    catalog: readonly PonsIndexingEvent[];
    materializations: readonly PonsMaterialization[];
    contracts: readonly PonsIndexingContract[];
    dependencies: readonly PonsIndexingDependency[];
    sources: readonly (PonsFixedIndexingSource | PonsDynamicIndexingSource | PonsSharedIndexingSource)[];
}
export declare const ponsIndexingAbis: Readonly<Record<PonsIndexingSourceName, Abi>>;
export interface PonsParameterSemantic {
    unit: "address" | "identifier" | "boolean" | "raw-amount" | "seconds" | "basis-points" | "integer" | "tick" | "ppm" | "sqrt-price-x96" | "liquidity";
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
    parameters: readonly {
        name: string;
        type: string;
        indexed: boolean;
        semantic: PonsParameterSemantic;
    }[];
}
export declare const ponsIndexingCatalog: readonly PonsIndexingEvent[];
/** Restricted data expressions keep owner intent independent of generated TypeScript. */
export type PonsIndexingValue = {
    parameter: string;
    lowercase?: boolean;
} | {
    event: "srcAddress" | "block.number";
    lowercase?: boolean;
};
export interface PonsMaterialization {
    name: "PonsLaunch" | "PonsPool";
    description: string;
    fields: Readonly<Record<string, {
        type: "String" | "BigInt";
        required?: boolean;
        index?: boolean;
    }>>;
    updates: readonly {
        contract: PonsIndexingSourceName;
        event: string;
        key: PonsIndexingValue;
        when?: {
            parameter: string;
            equals: string;
        };
        set: Readonly<Record<string, PonsIndexingValue>>;
        assertUnchanged?: readonly string[];
    }[];
}
export declare const ponsIndexingMaterializations: readonly PonsMaterialization[];
/**
 * Returns the versioned public-event topology for a Pons deployment.
 *
 * Consumers remain responsible for Envio runtime tuning, persistence, pricing,
 * wallet attribution, and which advertised events they choose to subscribe to.
 */
export declare function getPonsIndexingManifest(chainId?: number): PonsIndexingManifest;
