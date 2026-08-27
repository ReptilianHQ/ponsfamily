import { type Address, type Hex } from "viem";
import type { PonsDeployment } from "./deployments.js";
export interface TransactionRequest {
    to: Address;
    data: Hex;
    value: bigint;
}
export interface PonsSocials {
    twitter?: string;
    telegram?: string;
    discord?: string;
    website?: string;
    farcaster?: string;
}
interface PonsTokenMetadata {
    name: string;
    symbol: string;
    logo?: string;
    description?: string;
    socials?: PonsSocials;
    /** Zero address selects the initiating wallet on chain. */
    creatorFeeRecipient?: Address;
    creatorTaxBps?: number;
    buybackEnabled?: boolean;
    salt: Hex;
}
export type PonsTokenParameters = PonsTokenMetadata & ({
    /** Nonzero digest returned by `previewLaunchEconomics`. */
    expectedEconomics: Hex;
    unsafeAllowUnpinnedEconomics?: false;
} | {
    expectedEconomics?: never;
    /** Explicitly waive the on-chain launch-economics consistency check. */
    unsafeAllowUnpinnedEconomics: true;
});
export interface BuildLaunchParameters {
    token: PonsTokenParameters;
    launchConfigId: bigint;
    /** Zero address selects native ETH. */
    pairToken?: Address;
    snipeTaxExemptions?: readonly Address[];
    launchFee: bigint;
    /** Native ETH atomic opening buy through the reviewed forwarder. */
    openingBuy?: {
        quoteIn: bigint;
        minTokensOut: bigint;
        recipient: Address;
    };
}
export declare function buildLaunchTransaction(deployment: PonsDeployment, parameters: BuildLaunchParameters): TransactionRequest;
export interface BuildBuyParameters {
    curve: Address;
    pairToken: Address;
    quoteIn: bigint;
    minTokensOut: bigint;
    recipient: Address;
}
export declare function buildCurveBuyTransaction(parameters: BuildBuyParameters): TransactionRequest;
export interface BuildSellParameters {
    curve: Address;
    tokensIn: bigint;
    minQuoteOut: bigint;
    recipient: Address;
}
export declare function buildCurveSellTransaction(parameters: BuildSellParameters): TransactionRequest;
export declare function buildApprovalTransaction(token: Address, spender: Address, amount: bigint): TransactionRequest;
export declare function buildGraduateTransaction(factory: Address, token: Address): TransactionRequest;
export declare function buildCreateGraduatedPoolTransaction(factory: Address, token: Address): TransactionRequest;
export declare function buildTransferCreatorFeeRecipientTransaction(factory: Address, token: Address, newRecipient: Address): TransactionRequest;
export declare function buildSetBuybackEnabledTransaction(factory: Address, token: Address, enabled: boolean): TransactionRequest;
export declare function buildSweepCurveFeesTransaction(curve: Address, minBuybackTokensOut: bigint): TransactionRequest;
export declare function buildSweepPoolFeesTransaction(memeHook: Address, poolId: Hex, minConversionQuoteOut: bigint, minBuybackTokensOut: bigint): TransactionRequest;
export declare function buildClaimNativeFeesTransaction(feeEscrow: Address, amount?: bigint): TransactionRequest;
export declare function buildClaimTokenFeesTransaction(feeEscrow: Address, token: Address, amount?: bigint): TransactionRequest;
export declare function buildReleaseBuybackTransaction(buybackVault: Address, token: Address): TransactionRequest;
export {};
