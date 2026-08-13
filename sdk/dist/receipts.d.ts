import { type Address, type Hex } from "viem";
import type { TransactionRequest } from "./transactions.js";
export interface LogLike {
    address: Address;
    data: Hex;
    topics: [] | [Hex, ...Hex[]];
}
export interface ReceiptLike {
    status: "success" | "reverted" | 0 | 1 | Hex;
    logs: readonly LogLike[];
    transactionHash?: Hex;
}
export interface ConfirmedTransactionLike {
    from: Address;
    to: Address | null;
    value: bigint;
    input: Hex;
}
export interface TokenLaunchedResult {
    token: Address;
    curve: Address;
    deployer: Address;
    pairToken: Address;
    launchConfigId: bigint;
    graduationThreshold: bigint;
}
export interface AtomicOpeningBuyResult {
    token: Address;
    curve: Address;
    recipient: Address;
    launcher: Address;
    quoteSpent: bigint;
    tokensReceived: bigint;
}
export interface LaunchReceiptResult {
    launch: TokenLaunchedResult;
    openingBuy?: AtomicOpeningBuyResult;
}
export interface CurveBuyResult {
    buyer: Address;
    recipient: Address;
    quoteIn: bigint;
    tokensOut: bigint;
    fee: bigint;
    tax: bigint;
}
export interface CurveSellResult {
    seller: Address;
    recipient: Address;
    tokensIn: bigint;
    quoteOut: bigint;
    fee: bigint;
    tax: bigint;
}
export interface PoolGraduatedResult {
    token: Address;
    positionId: bigint;
    tokenAmount: bigint;
    pairTokenAmount: bigint;
}
export interface FeesSweptResult {
    protocolAmount: bigint;
    buybackAmount: bigint;
    creatorAmount: bigint;
}
export interface BuybackLockedResult {
    quoteSpent: bigint;
    tokensLocked: bigint;
}
export interface LaunchSweptResult {
    token: Address;
    quoteOut: bigint;
    tokenOut: bigint;
}
export interface CreatorFeeRecipientUpdatedResult {
    token: Address;
    previousRecipient: Address;
    newRecipient: Address;
}
export interface BuybackEnabledUpdatedResult {
    token: Address;
    enabled: boolean;
    controller: Address;
}
export declare function assertConfirmedTransaction(transaction: ConfirmedTransactionLike, request: TransactionRequest, expectedSender?: Address): void;
export declare function assertSuccessfulReceipt(receipt: ReceiptLike): void;
export declare function verifyLaunchReceipt(receipt: ReceiptLike, factory: Address, options?: {
    expected?: Partial<TokenLaunchedResult>;
    forwarder?: Address;
    openingBuy?: Partial<AtomicOpeningBuyResult> & {
        minTokensOut?: bigint;
    };
}): LaunchReceiptResult;
export declare function verifyCurveBuyReceipt(receipt: ReceiptLike, curve: Address, expected?: Partial<CurveBuyResult> & {
    minTokensOut?: bigint;
    quoteOffered?: bigint;
}): CurveBuyResult;
export declare function verifyCurveSellReceipt(receipt: ReceiptLike, curve: Address, expected?: Partial<CurveSellResult> & {
    minQuoteOut?: bigint;
}): CurveSellResult;
export declare function verifyPoolGraduatedReceipt(receipt: ReceiptLike, factory: Address, expected?: Partial<PoolGraduatedResult>): PoolGraduatedResult;
export declare function verifyFeesSweptReceipt(receipt: ReceiptLike, curve: Address, expected?: Partial<FeesSweptResult>): FeesSweptResult;
export declare function verifyBuybackLockedReceipt(receipt: ReceiptLike, curve: Address, expected?: Partial<BuybackLockedResult>): BuybackLockedResult;
export declare function verifyLaunchSweptReceipt(receipt: ReceiptLike, factory: Address, expected?: Partial<LaunchSweptResult>): LaunchSweptResult;
export declare function verifyCreatorFeeRecipientUpdatedReceipt(receipt: ReceiptLike, factory: Address, expected?: Partial<CreatorFeeRecipientUpdatedResult>): CreatorFeeRecipientUpdatedResult;
export declare function verifyBuybackEnabledUpdatedReceipt(receipt: ReceiptLike, factory: Address, expected?: Partial<BuybackEnabledUpdatedResult>): BuybackEnabledUpdatedResult;
