import { type Address, type Hex, type PublicClient } from 'viem';
import { type PonsV4PoolReference } from './v4-provider.js';
/** An observation anchor, never transaction execution authorization. This proof
 * version is specific to the reviewed immutable factory/hook implementation.
 */
export interface PonsV4HistoryAnchor {
    proofVersion: 'pons-v2-836f0f97/history-v1';
    chainId: number;
    deploymentId: string;
    blockNumber: bigint;
    blockHash: Hex;
    factoryCodeHash: Hex;
    hookCodeHash: Hex;
}
export interface PonsV4HistoryLog {
    chainId: number;
    address: Address;
    topics: readonly Hex[];
    data: Hex;
    blockNumber: bigint;
    blockHash: Hex;
    transactionHash: Hex;
    transactionStatus: 'success';
    logIndex: number;
    removed?: boolean;
}
/** Establish compatibility once for a historical scan. The reviewed factory and
 * hook have no upgrade/delegatecall/selfdestruct path; the hook's factory wiring
 * is one-time. Verify their code at deployment AND at the canonical anchor.
 * Consumers own the trusted canonical event source, page completeness and anchor
 * revalidation. This does not authenticate arbitrary caller-supplied log JSON.
 */
export declare function readPonsV4HistoryAnchor(client: PublicClient, options: {
    chainId?: number;
    blockNumber: bigint;
    minimumConfirmations: bigint;
}): Promise<PonsV4HistoryAnchor>;
/** Join three canonical successful-transaction events. In the pinned factory,
 * createGraduatedPool checks the launch exists, marks it PoolCreated, initializes
 * the exact stored key, registers it through the factory-only hook, then emits
 * PoolGraduated. A reverted mint emits none of these canonical logs. Requiring
 * all three events preserves launch/key/graduation evidence without per-pool
 * eth_call or receipt RPC. This is historical indexing evidence, not permission
 * to trade, withdraw locked liquidity or skip current execution compatibility.
 */
export declare function verifyPonsV4HistoryMembership(anchor: PonsV4HistoryAnchor, evidence: {
    registration: PonsV4HistoryLog;
    initialization: PonsV4HistoryLog;
    graduation: PonsV4HistoryLog;
}): PonsV4PoolReference;
