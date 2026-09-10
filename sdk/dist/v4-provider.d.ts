import { type Address, type Hex, type PublicClient } from 'viem';
import { type V4PoolKey, type V4PoolReference } from '@reptilianhq/uniswap-sdk/v4';
import { type PonsDeployment } from './deployments.js';
declare const registrationSignature: 'PoolRegistered(bytes32,address,address,address)';
/** Portable provider composition v1. Shared SDK consumers use structural typing.
 * Pons owns membership semantics; a hook-address match is not membership proof.
 */
export declare function getPonsV4Provider(chainId?: number): {
    schemaVersion: 1;
    providerId: 'pons';
    substrate: 'uniswap-v4';
    deploymentId: string;
    chainId: number;
    poolManager: `0x${string}`;
    startBlock: bigint;
    hooks: `0x${string}`[];
    discovery: {
        address: `0x${string}`;
        eventSignature: "PoolRegistered(bytes32,address,address,address)";
        poolIdParameter: string;
        expectedRuntimeCodeHash: `0x${string}`;
    };
    poolEvents: readonly ['Swap'];
};
export interface PonsV4PoolReference extends V4PoolReference {
    providerId: 'pons';
    deploymentId: string;
    token: Address;
    quoteToken: Address;
    creator: Address;
    membership: {
        sourceAddress: Address;
        eventSignature: typeof registrationSignature;
        blockNumber: bigint;
        blockHash: Hex;
        transactionHash: Hex;
        logIndex: number;
    };
}
/** This describes the Pons graduation position, not every position in its pool.
 * Existing Pons curve transaction/receipt APIs remain separate protocol capabilities.
 */
export declare const ponsV4GraduationCapabilities: Readonly<{
    readPool: true;
    observeLockedPosition: true;
    withdrawGraduationPrincipal: false;
    swap: Readonly<{
        supported: false;
        reason: "No reviewed Pons v4 router/hook execution path in this SDK release";
    }>;
    manageIndependentPosition: Readonly<{
        supported: false;
        reason: "Independent v4 position execution has not been verified";
    }>;
}>;
/** Verify supplied canonical registration content. Does not establish receipt finality,
 * deployment bytecode or RPC provenance; use readPonsV4PoolRegistrations for those reads.
 */
export declare function verifyPonsV4PoolRegistration(deployment: PonsDeployment, log: {
    chainId: number;
    address: Address;
    topics: readonly Hex[];
    data: Hex;
    blockNumber: bigint;
    blockHash: Hex;
    transactionHash: Hex;
    logIndex: number;
    removed?: boolean;
}, key: V4PoolKey): PonsV4PoolReference;
/** Resolve only registrations from one supplied transaction, never scan all v4 pools.
 * Rechecks reviewed deployment code/pointers and canonical block hash. Hosts select
 * finality policy and must revalidate membership/compatibility before future writes.
 */
export declare function readPonsV4PoolRegistrations(client: PublicClient, transactionHash: Hex, options: {
    chainId?: number;
    minimumConfirmations: bigint;
}): Promise<PonsV4PoolReference[]>;
export {};
