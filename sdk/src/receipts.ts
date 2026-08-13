import { decodeEventLog, getAddress, type Address, type Hex } from "viem";
import { ponsBuybackVaultAbi, ponsCurveAbi, ponsFactoryAbi, ponsFeeEscrowAbi, ponsForwarderAbi, ponsMemeHookAbi } from "./abis.js";
import { PonsSdkError } from "./errors.js";
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

export interface PoolFeesSweptResult extends FeesSweptResult {
  poolId: Hex;
  tokensLocked: bigint;
}

export interface NativeFeesClaimedResult { recipient: Address; amount: bigint }
export interface TokenFeesClaimedResult extends NativeFeesClaimedResult { token: Address }
export interface BuybackReleasedResult { token: Address; creatorAmount: bigint; protocolAmount: bigint }

export function assertConfirmedTransaction(
  transaction: ConfirmedTransactionLike,
  request: TransactionRequest,
  expectedSender?: Address,
): void {
  if (expectedSender !== undefined && !sameAddress(transaction.from, expectedSender)) {
    mismatch("UNEXPECTED_SENDER", "from", expectedSender, transaction.from);
  }
  if (transaction.to === null || !sameAddress(transaction.to, request.to)) {
    mismatch("UNEXPECTED_TARGET", "to", request.to, transaction.to ?? "null");
  }
  if (transaction.value !== request.value) mismatch("UNEXPECTED_VALUE", "value", String(request.value), String(transaction.value));
  if (transaction.input.toLowerCase() !== request.data.toLowerCase()) mismatch("CALLDATA_MISMATCH", "input", request.data, transaction.input);
}

export function assertSuccessfulReceipt(receipt: ReceiptLike): void {
  if (receipt.status !== "success" && receipt.status !== 1 && receipt.status !== "0x1") {
    throw new PonsSdkError("RECEIPT_REVERTED", `Pons transaction${receipt.transactionHash ? ` ${receipt.transactionHash}` : ""} reverted`, {
      path: "status",
      expected: "success",
      actual: String(receipt.status),
    });
  }
}

export function verifyLaunchReceipt(
  receipt: ReceiptLike,
  factory: Address,
  options: {
    expected?: Partial<TokenLaunchedResult>;
    forwarder?: Address;
    openingBuy?: Partial<AtomicOpeningBuyResult> & { minTokensOut?: bigint };
  } = {},
): LaunchReceiptResult {
  const launch = requireEvent<TokenLaunchedResult>(receipt, factory, ponsFactoryAbi, "TokenLaunched");
  assertFields(launch, options.expected ?? {}, new Set(["token", "curve", "deployer", "pairToken"]));
  if (options.forwarder === undefined && options.openingBuy === undefined) return { launch };
  if (options.forwarder === undefined) invalid("forwarder is required when openingBuy expectations are supplied");
  const openingBuy = requireEvent<AtomicOpeningBuyResult>(receipt, options.forwarder, ponsForwarderAbi, "Launched");
  const { minTokensOut, ...expected } = options.openingBuy ?? {};
  assertFields(openingBuy, expected, new Set(["token", "curve", "recipient", "launcher"]));
  if (!sameAddress(openingBuy.token, launch.token) || !sameAddress(openingBuy.curve, launch.curve)) {
    mismatch("RECEIPT_FIELD_MISMATCH", "openingBuy.token/curve", `${launch.token}/${launch.curve}`, `${openingBuy.token}/${openingBuy.curve}`);
  }
  if (minTokensOut !== undefined && openingBuy.tokensReceived < minTokensOut) {
    mismatch("OUTPUT_BELOW_MINIMUM", "openingBuy.tokensReceived", `>= ${minTokensOut}`, String(openingBuy.tokensReceived));
  }
  return { launch, openingBuy };
}

export function verifyCurveBuyReceipt(
  receipt: ReceiptLike,
  curve: Address,
  expected: Partial<CurveBuyResult> & { minTokensOut?: bigint; quoteOffered?: bigint } = {},
): CurveBuyResult {
  const result = requireEvent<CurveBuyResult>(receipt, curve, ponsCurveAbi, "CurveBuy");
  const { minTokensOut, quoteOffered, ...exact } = expected;
  assertFields(result, exact, new Set(["buyer", "recipient"]));
  if (quoteOffered !== undefined && result.quoteIn > quoteOffered) {
    mismatch("RECEIPT_FIELD_MISMATCH", "quoteIn", `<= ${quoteOffered}`, String(result.quoteIn));
  }
  if (minTokensOut !== undefined) {
    const satisfied = quoteOffered === undefined
      ? result.tokensOut >= minTokensOut
      : result.quoteIn * minTokensOut <= quoteOffered * result.tokensOut;
    if (!satisfied) {
      mismatch(
        "OUTPUT_BELOW_MINIMUM",
        "tokensOut",
        quoteOffered === undefined ? `>= ${minTokensOut}` : `price bound from ${quoteOffered}/${minTokensOut}`,
        `${result.quoteIn}/${result.tokensOut}`,
      );
    }
  }
  return result;
}

export function verifyCurveSellReceipt(
  receipt: ReceiptLike,
  curve: Address,
  expected: Partial<CurveSellResult> & { minQuoteOut?: bigint } = {},
): CurveSellResult {
  const result = requireEvent<CurveSellResult>(receipt, curve, ponsCurveAbi, "CurveSell");
  const { minQuoteOut, ...exact } = expected;
  assertFields(result, exact, new Set(["seller", "recipient"]));
  if (minQuoteOut !== undefined && result.quoteOut < minQuoteOut) {
    mismatch("OUTPUT_BELOW_MINIMUM", "quoteOut", `>= ${minQuoteOut}`, String(result.quoteOut));
  }
  return result;
}

export function verifyPoolGraduatedReceipt(
  receipt: ReceiptLike,
  factory: Address,
  expected: Partial<PoolGraduatedResult> = {},
): PoolGraduatedResult {
  const result = requireEvent<PoolGraduatedResult>(receipt, factory, ponsFactoryAbi, "PoolGraduated");
  assertFields(result, expected, new Set(["token"]));
  return result;
}

export function verifyFeesSweptReceipt(
  receipt: ReceiptLike,
  curve: Address,
  expected: Partial<FeesSweptResult> = {},
): FeesSweptResult {
  const result = requireEvent<FeesSweptResult>(receipt, curve, ponsCurveAbi, "FeesSwept");
  assertFields(result, expected, new Set());
  return result;
}

export function verifyBuybackLockedReceipt(
  receipt: ReceiptLike,
  curve: Address,
  expected: Partial<BuybackLockedResult> = {},
): BuybackLockedResult {
  const result = requireEvent<BuybackLockedResult>(receipt, curve, ponsCurveAbi, "BuybackLocked");
  assertFields(result, expected, new Set());
  return result;
}

export function verifyLaunchSweptReceipt(
  receipt: ReceiptLike,
  factory: Address,
  expected: Partial<LaunchSweptResult> = {},
): LaunchSweptResult {
  const result = requireEvent<LaunchSweptResult>(receipt, factory, ponsFactoryAbi, "LaunchSwept");
  assertFields(result, expected, new Set(["token"]));
  return result;
}

export function verifyCreatorFeeRecipientUpdatedReceipt(
  receipt: ReceiptLike,
  factory: Address,
  expected: Partial<CreatorFeeRecipientUpdatedResult> = {},
): CreatorFeeRecipientUpdatedResult {
  const result = requireEvent<CreatorFeeRecipientUpdatedResult>(receipt, factory, ponsFactoryAbi, "CreatorFeeRecipientUpdated");
  assertFields(result, expected, new Set(["token", "previousRecipient", "newRecipient"]));
  return result;
}

export function verifyBuybackEnabledUpdatedReceipt(
  receipt: ReceiptLike,
  factory: Address,
  expected: Partial<BuybackEnabledUpdatedResult> = {},
): BuybackEnabledUpdatedResult {
  const result = requireEvent<BuybackEnabledUpdatedResult>(receipt, factory, ponsFactoryAbi, "BuybackEnabledUpdated");
  assertFields(result, expected, new Set(["token", "controller"]));
  return result;
}

export function verifyPoolFeesSweptReceipt(
  receipt: ReceiptLike,
  memeHook: Address,
  expected: Partial<PoolFeesSweptResult> = {},
): PoolFeesSweptResult {
  const result = requireEvent<PoolFeesSweptResult>(receipt, memeHook, ponsMemeHookAbi, "PoolFeesSwept");
  assertFields(result, expected, new Set());
  return result;
}

export function verifyNativeFeesClaimedReceipt(
  receipt: ReceiptLike,
  feeEscrow: Address,
  expected: Partial<NativeFeesClaimedResult> = {},
): NativeFeesClaimedResult {
  const result = requireEvent<NativeFeesClaimedResult>(receipt, feeEscrow, ponsFeeEscrowAbi, "Claimed");
  assertFields(result, expected, new Set(["recipient"]));
  return result;
}

export function verifyTokenFeesClaimedReceipt(
  receipt: ReceiptLike,
  feeEscrow: Address,
  expected: Partial<TokenFeesClaimedResult> = {},
): TokenFeesClaimedResult {
  const result = requireEvent<TokenFeesClaimedResult>(receipt, feeEscrow, ponsFeeEscrowAbi, "ClaimedToken");
  assertFields(result, expected, new Set(["recipient", "token"]));
  return result;
}

export function verifyBuybackReleasedReceipt(
  receipt: ReceiptLike,
  buybackVault: Address,
  expected: Partial<BuybackReleasedResult> = {},
): BuybackReleasedResult {
  const result = requireEvent<BuybackReleasedResult>(receipt, buybackVault, ponsBuybackVaultAbi, "Released");
  assertFields(result, expected, new Set(["token"]));
  return result;
}

function requireEvent<T>(receipt: ReceiptLike, emitter: Address, abi: readonly unknown[], eventName: string): T {
  assertSuccessfulReceipt(receipt);
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, emitter)) continue;
    try {
      const decoded = decodeEventLog({ abi, eventName, data: log.data, topics: log.topics, strict: true } as never) as unknown as { eventName: string; args: T };
      if (decoded.eventName === eventName) return normalizeAddresses(decoded.args);
    } catch {
      // The expected emitter can produce unrelated events in the same receipt.
    }
  }
  throw new PonsSdkError("EVENT_NOT_FOUND", `Expected ${eventName} event from ${emitter}`, {
    path: "logs",
    expected: `${eventName} from ${emitter}`,
    actual: "no matching log",
  });
}

function normalizeAddresses<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    typeof child === "string" && /^0x[0-9a-fA-F]{40}$/.test(child) ? getAddress(child) : child,
  ]);
  return Object.fromEntries(entries) as T;
}

function assertFields<T extends object>(actual: T, expected: Partial<T>, addressFields: ReadonlySet<string>): void {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key as keyof T];
    const matches = addressFields.has(key) && typeof actualValue === "string" && typeof expectedValue === "string"
      ? sameAddress(actualValue as Address, expectedValue as Address)
      : actualValue === expectedValue;
    if (!matches) mismatch("RECEIPT_FIELD_MISMATCH", key, String(expectedValue), String(actualValue));
  }
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function mismatch(code: "UNEXPECTED_SENDER" | "UNEXPECTED_TARGET" | "UNEXPECTED_VALUE" | "CALLDATA_MISMATCH" | "RECEIPT_FIELD_MISMATCH" | "OUTPUT_BELOW_MINIMUM", path: string, expected: string, actual: string): never {
  throw new PonsSdkError(code, `${path} mismatch: expected ${expected}, got ${actual}`, { path, expected, actual });
}

function invalid(message: string): never {
  throw new PonsSdkError("INVALID_ARGUMENT", message);
}
