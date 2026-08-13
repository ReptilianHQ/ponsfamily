import { type Address, type Hex, type PublicClient } from "viem";
import type { PonsDeployment } from "./deployments.js";
export declare enum GraduationPhase {
    NotGraduated = 0,
    Swept = 1,
    PoolCreated = 2,
    Rescued = 3
}
export declare function readLaunchConfigs(client: PublicClient, deployment: PonsDeployment): Promise<{
    id: number;
    curveFeeBps: bigint;
    enabled: boolean;
    graduationThreshold: bigint;
    phantomQuote: bigint;
    poolFee: number;
    supply: bigint;
    tickSpacing: number;
}[]>;
export declare function readLaunchTerms(client: PublicClient, deployment: PonsDeployment, launcher?: Address): Promise<{
    launchFee: bigint;
    launchEnabled: boolean;
    maxCreatorTaxBps: bigint;
    snipeTaxStartBps: bigint;
    snipeTaxSeconds: bigint;
    configs: {
        id: number;
        curveFeeBps: bigint;
        enabled: boolean;
        graduationThreshold: bigint;
        phantomQuote: bigint;
        poolFee: number;
        supply: bigint;
        tickSpacing: number;
    }[];
    canLaunch: boolean | undefined;
}>;
export interface ReadAtBlockOptions {
    blockNumber?: bigint;
}
export declare function readLaunchedToken(client: PublicClient, deployment: PonsDeployment, token: Address, options?: ReadAtBlockOptions): Promise<{
    buybackEnabled: boolean;
    creatorFeeRecipient: `0x${string}`;
    creatorTaxBps: number;
    curve: `0x${string}`;
    deployer: `0x${string}`;
    exists: boolean;
    graduationThreshold: bigint;
    pairToken: `0x${string}`;
    phase: number;
    poolFee: number;
    sweptAt: bigint;
    sweptQuote: bigint;
    sweptTokens: bigint;
    tickSpacing: number;
    token: `0x${string}`;
}>;
export declare function readCurveSnapshot(client: PublicClient, curve: Address, options?: ReadAtBlockOptions): Promise<{
    curve: `0x${string}`;
    token: `0x${string}`;
    pairToken: `0x${string}`;
    quoteDecimals: number;
    tokenDecimals: number;
    feeBps: bigint;
    creatorTaxBps: bigint;
    graduationThreshold: bigint;
    sellableTokens: bigint;
    quoteReserve: bigint;
    realQuoteReserve: bigint;
    tokenReserve: bigint;
    readyToGraduate: boolean;
    graduated: boolean;
}>;
/** Reads one internally consistent launch lifecycle snapshot at a single block. */
export declare function readLaunchLifecycle(client: PublicClient, deployment: PonsDeployment, token: Address, options?: ReadAtBlockOptions): Promise<{
    blockNumber: bigint;
    token: `0x${string}`;
    curve: `0x${string}`;
    pairToken: `0x${string}`;
    phase: GraduationPhase;
    graduationThreshold: bigint;
    graduationProgressBps: bigint | undefined;
    poolPositionId: bigint;
    snapshot: {
        curve: `0x${string}`;
        token: `0x${string}`;
        pairToken: `0x${string}`;
        quoteDecimals: number;
        tokenDecimals: number;
        feeBps: bigint;
        creatorTaxBps: bigint;
        graduationThreshold: bigint;
        sellableTokens: bigint;
        quoteReserve: bigint;
        realQuoteReserve: bigint;
        tokenReserve: bigint;
        readyToGraduate: boolean;
        graduated: boolean;
    };
    launch: {
        buybackEnabled: boolean;
        creatorFeeRecipient: `0x${string}`;
        creatorTaxBps: number;
        curve: `0x${string}`;
        deployer: `0x${string}`;
        exists: boolean;
        graduationThreshold: bigint;
        pairToken: `0x${string}`;
        phase: number;
        poolFee: number;
        sweptAt: bigint;
        sweptQuote: bigint;
        sweptTokens: bigint;
        tickSpacing: number;
        token: `0x${string}`;
    };
}>;
export declare function derivePonsGraduatedPoolId(parameters: {
    token: Address;
    pairToken: Address;
    poolFee: number;
    tickSpacing: number;
    memeHook: Address;
}): Hex;
export declare function readGraduatedPoolFeeState(client: PublicClient, deployment: PonsDeployment, token: Address, options?: ReadAtBlockOptions): Promise<{
    blockNumber: bigint;
    poolId: `0x${string}`;
    launch: {
        buybackEnabled: boolean;
        creatorFeeRecipient: `0x${string}`;
        creatorTaxBps: number;
        curve: `0x${string}`;
        deployer: `0x${string}`;
        exists: boolean;
        graduationThreshold: bigint;
        pairToken: `0x${string}`;
        phase: number;
        poolFee: number;
        sweptAt: bigint;
        sweptQuote: bigint;
        sweptTokens: bigint;
        tickSpacing: number;
        token: `0x${string}`;
    };
    registration: readonly [boolean, boolean, `0x${string}`, quoteToken: `0x${string}`, creator: `0x${string}`, `0x${string}`, `0x${string}`, number, number, number, number, number, boolean];
    pending: {
        token: {
            fees: bigint;
            buyback: bigint;
            creatorTax: bigint;
        };
        quote: {
            fees: bigint;
            buyback: bigint;
            creatorTax: bigint;
        };
    };
}>;
export declare function readFeeEscrowBalances(client: PublicClient, deployment: PonsDeployment, recipient: Address, tokens?: readonly Address[], options?: ReadAtBlockOptions): Promise<{
    blockNumber: bigint;
    recipient: `0x${string}`;
    native: bigint;
    tokens: {
        token: `0x${string}`;
        balance: bigint;
    }[];
}>;
export declare function readBuybackVest(client: PublicClient, deployment: PonsDeployment, token: Address, options?: ReadAtBlockOptions): Promise<{
    blockNumber: bigint;
    token: `0x${string}`;
    totalLocked: bigint;
    totalReleased: bigint;
    vestedAmount: bigint;
    releasable: bigint;
    creatorRecipient: `0x${string}`;
    protocolRecipient: `0x${string}`;
    protocolFeeShareBps: number;
}>;
