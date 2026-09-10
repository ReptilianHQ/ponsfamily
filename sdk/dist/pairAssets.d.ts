import { type Address, type PublicClient } from 'viem';
import type { PonsDeployment } from './deployments.js';
export interface PonsPairAsset {
    address: Address;
    name: string;
    symbol: string;
    decimals: number;
    phantomQuote: bigint;
    graduationThreshold: bigint;
}
/** Enumerate candidates from factory events; current approval is always read separately. */
export declare function readPairTokenCandidates(client: PublicClient, deployment: PonsDeployment, fromBlock: bigint, toBlock: bigint): Promise<Address[]>;
/** Returns null for a revoked asset. Reads approval, economics and metadata at one block. */
export declare function readPairAsset(client: PublicClient, deployment: PonsDeployment, token: Address, blockNumber: bigint): Promise<PonsPairAsset | null>;
