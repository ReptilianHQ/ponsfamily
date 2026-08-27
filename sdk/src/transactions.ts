import {
  encodeFunctionData,
  getAddress,
  isAddress,
  isHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  ponsBuybackVaultAbi,
  ponsCurveAbi,
  ponsFactoryAbi,
  ponsFeeEscrowAbi,
  ponsForwarderAbi,
  ponsMemeHookAbi,
  ponsTokenAbi,
} from "./abis.js";
import type { PonsDeployment } from "./deployments.js";
import { PonsSdkError } from "./errors.js";

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

export type PonsTokenParameters = PonsTokenMetadata & (
  | {
    /** Nonzero digest returned by `previewLaunchEconomics`. */
    expectedEconomics: Hex;
    unsafeAllowUnpinnedEconomics?: false;
  }
  | {
    expectedEconomics?: never;
    /** Explicitly waive the on-chain launch-economics consistency check. */
    unsafeAllowUnpinnedEconomics: true;
  }
);

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

export function buildLaunchTransaction(
  deployment: PonsDeployment,
  parameters: BuildLaunchParameters,
): TransactionRequest {
  const params = normalizeTokenParameters(parameters.token);
  const pairToken = normalizeAddress(parameters.pairToken ?? zeroAddress, "pairToken");
  const exemptions = [...(parameters.snipeTaxExemptions ?? [])].map((value, index) =>
    normalizeAddress(value, `snipeTaxExemptions[${index}]`));
  assertNonNegative(parameters.launchConfigId, "launchConfigId");
  assertNonNegative(parameters.launchFee, "launchFee");
  const openingBuy = parameters.openingBuy;

  if (openingBuy !== undefined) {
    if (pairToken !== zeroAddress) invalid("pairToken", "zero address for an atomic opening buy", pairToken);
    assertPositive(openingBuy.quoteIn, "openingBuy.quoteIn");
    assertNonNegative(openingBuy.minTokensOut, "openingBuy.minTokensOut");
    const recipient = normalizeAddress(openingBuy.recipient, "openingBuy.recipient");
    if (exemptions.length > 31) invalid("snipeTaxExemptions", "at most 31 entries with an opening buy", exemptions.length);
    return {
      to: deployment.contracts.forwarder,
      data: encodeFunctionData({
        abi: ponsForwarderAbi,
        functionName: "launchAndBuy",
        args: [params, parameters.launchConfigId, pairToken, openingBuy.quoteIn, openingBuy.minTokensOut, recipient, exemptions],
      }),
      value: parameters.launchFee + openingBuy.quoteIn,
    };
  }

  if (exemptions.length > 32) invalid("snipeTaxExemptions", "at most 32 entries", exemptions.length);
  return {
    to: deployment.contracts.factory,
    data: encodeFunctionData({
      abi: ponsFactoryAbi,
      functionName: "launchToken",
      args: [params, parameters.launchConfigId, pairToken, exemptions],
    }),
    value: parameters.launchFee,
  };
}

export interface BuildBuyParameters {
  curve: Address;
  pairToken: Address;
  quoteIn: bigint;
  minTokensOut: bigint;
  recipient: Address;
}

export function buildCurveBuyTransaction(parameters: BuildBuyParameters): TransactionRequest {
  const curve = normalizeAddress(parameters.curve, "curve");
  const pairToken = normalizeAddress(parameters.pairToken, "pairToken");
  const recipient = normalizeAddress(parameters.recipient, "recipient");
  assertPositive(parameters.quoteIn, "quoteIn");
  assertNonNegative(parameters.minTokensOut, "minTokensOut");
  return {
    to: curve,
    data: encodeFunctionData({
      abi: ponsCurveAbi,
      functionName: "buy",
      args: [parameters.quoteIn, parameters.minTokensOut, recipient],
    }),
    value: pairToken === zeroAddress ? parameters.quoteIn : 0n,
  };
}

export interface BuildSellParameters {
  curve: Address;
  tokensIn: bigint;
  minQuoteOut: bigint;
  recipient: Address;
}

export function buildCurveSellTransaction(parameters: BuildSellParameters): TransactionRequest {
  const curve = normalizeAddress(parameters.curve, "curve");
  const recipient = normalizeAddress(parameters.recipient, "recipient");
  assertPositive(parameters.tokensIn, "tokensIn");
  assertNonNegative(parameters.minQuoteOut, "minQuoteOut");
  return {
    to: curve,
    data: encodeFunctionData({
      abi: ponsCurveAbi,
      functionName: "sell",
      args: [parameters.tokensIn, parameters.minQuoteOut, recipient],
    }),
    value: 0n,
  };
}

export function buildApprovalTransaction(token: Address, spender: Address, amount: bigint): TransactionRequest {
  token = normalizeAddress(token, "token");
  spender = normalizeAddress(spender, "spender");
  assertPositive(amount, "amount");
  return {
    to: token,
    data: encodeFunctionData({ abi: ponsTokenAbi, functionName: "approve", args: [spender, amount] }),
    value: 0n,
  };
}

export function buildGraduateTransaction(factory: Address, token: Address): TransactionRequest {
  return factoryTransaction(factory, "graduate", [normalizeAddress(token, "token")]);
}

export function buildCreateGraduatedPoolTransaction(factory: Address, token: Address): TransactionRequest {
  return factoryTransaction(factory, "createGraduatedPool", [normalizeAddress(token, "token")]);
}

export function buildTransferCreatorFeeRecipientTransaction(
  factory: Address,
  token: Address,
  newRecipient: Address,
): TransactionRequest {
  return factoryTransaction(factory, "transferCreatorFeeRecipient", [
    normalizeAddress(token, "token"),
    normalizeAddress(newRecipient, "newRecipient"),
  ]);
}

export function buildSetBuybackEnabledTransaction(
  factory: Address,
  token: Address,
  enabled: boolean,
): TransactionRequest {
  return factoryTransaction(factory, "setBuybackEnabled", [normalizeAddress(token, "token"), enabled]);
}

export function buildSweepCurveFeesTransaction(curve: Address, minBuybackTokensOut: bigint): TransactionRequest {
  curve = normalizeAddress(curve, "curve");
  assertNonNegative(minBuybackTokensOut, "minBuybackTokensOut");
  return {
    to: curve,
    data: encodeFunctionData({ abi: ponsCurveAbi, functionName: "sweepFees", args: [minBuybackTokensOut] }),
    value: 0n,
  };
}

export function buildSweepPoolFeesTransaction(
  memeHook: Address,
  poolId: Hex,
  minConversionQuoteOut: bigint,
  minBuybackTokensOut: bigint,
): TransactionRequest {
  memeHook = normalizeAddress(memeHook, "memeHook");
  assertBytes32(poolId, "poolId");
  assertNonNegative(minConversionQuoteOut, "minConversionQuoteOut");
  assertNonNegative(minBuybackTokensOut, "minBuybackTokensOut");
  return {
    to: memeHook,
    data: encodeFunctionData({
      abi: ponsMemeHookAbi,
      functionName: "sweepPoolFees",
      args: [poolId, minConversionQuoteOut, minBuybackTokensOut],
    }),
    value: 0n,
  };
}

export function buildClaimNativeFeesTransaction(feeEscrow: Address, amount?: bigint): TransactionRequest {
  feeEscrow = normalizeAddress(feeEscrow, "feeEscrow");
  if (amount !== undefined) assertPositive(amount, "amount");
  return {
    to: feeEscrow,
    data: amount === undefined
      ? encodeFunctionData({ abi: ponsFeeEscrowAbi, functionName: "claim" })
      : encodeFunctionData({ abi: ponsFeeEscrowAbi, functionName: "claim", args: [amount] }),
    value: 0n,
  };
}

export function buildClaimTokenFeesTransaction(feeEscrow: Address, token: Address, amount?: bigint): TransactionRequest {
  feeEscrow = normalizeAddress(feeEscrow, "feeEscrow");
  token = normalizeAddress(token, "token");
  if (amount !== undefined) assertPositive(amount, "amount");
  return {
    to: feeEscrow,
    data: amount === undefined
      ? encodeFunctionData({ abi: ponsFeeEscrowAbi, functionName: "claimToken", args: [token] })
      : encodeFunctionData({ abi: ponsFeeEscrowAbi, functionName: "claimToken", args: [token, amount] }),
    value: 0n,
  };
}

export function buildReleaseBuybackTransaction(buybackVault: Address, token: Address): TransactionRequest {
  buybackVault = normalizeAddress(buybackVault, "buybackVault");
  token = normalizeAddress(token, "token");
  return {
    to: buybackVault,
    data: encodeFunctionData({ abi: ponsBuybackVaultAbi, functionName: "release", args: [token] }),
    value: 0n,
  };
}

function normalizeTokenParameters(parameters: PonsTokenParameters) {
  const expectedEconomics = normalizeExpectedEconomics(parameters);
  const socials = parameters.socials ?? {};
  const normalized = {
    name: parameters.name.trim(),
    symbol: parameters.symbol.trim(),
    logo: parameters.logo?.trim() ?? "",
    description: parameters.description?.trim() ?? "",
    socials: {
      twitter: socials.twitter?.trim() ?? "",
      telegram: socials.telegram?.trim() ?? "",
      discord: socials.discord?.trim() ?? "",
      website: socials.website?.trim() ?? "",
      farcaster: socials.farcaster?.trim() ?? "",
    },
    creatorFeeRecipient: normalizeAddress(parameters.creatorFeeRecipient ?? zeroAddress, "creatorFeeRecipient"),
    creatorTaxBps: parameters.creatorTaxBps ?? 0,
    buybackEnabled: parameters.buybackEnabled ?? false,
    expectedEconomics,
    salt: parameters.salt,
  };
  assertLength(normalized.name, 1, 64, "name");
  assertLength(normalized.symbol, 1, 16, "symbol");
  assertLength(normalized.logo, 0, 512, "logo");
  assertLength(normalized.description, 0, 2_048, "description");
  for (const [key, value] of Object.entries(normalized.socials)) assertLength(value, 0, 256, `socials.${key}`);
  if (!Number.isInteger(normalized.creatorTaxBps) || normalized.creatorTaxBps < 0 || normalized.creatorTaxBps > 1_000) {
    invalid("creatorTaxBps", "an integer from 0 to 1000", normalized.creatorTaxBps);
  }
  assertBytes32(normalized.expectedEconomics, "expectedEconomics");
  assertBytes32(normalized.salt, "salt");
  return normalized;
}

const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;

function normalizeExpectedEconomics(parameters: PonsTokenParameters): Hex {
  const unsafeAllowUnpinnedEconomics = (
    parameters as { unsafeAllowUnpinnedEconomics?: unknown }
  ).unsafeAllowUnpinnedEconomics;
  if (parameters.expectedEconomics === undefined) {
    if (unsafeAllowUnpinnedEconomics !== true) {
      invalid("expectedEconomics", "a nonzero previewLaunchEconomics digest or an explicit unsafe waiver", "missing");
    }
    return ZERO_BYTES32;
  }
  assertBytes32(parameters.expectedEconomics, "expectedEconomics");
  if (parameters.expectedEconomics.toLowerCase() === ZERO_BYTES32) {
    invalid("expectedEconomics", "a nonzero previewLaunchEconomics digest", parameters.expectedEconomics);
  }
  if (unsafeAllowUnpinnedEconomics === true) {
    invalid("unsafeAllowUnpinnedEconomics", "false when expectedEconomics is supplied", true);
  }
  return parameters.expectedEconomics;
}

function factoryTransaction(factory: Address, functionName: "graduate" | "createGraduatedPool" | "transferCreatorFeeRecipient" | "setBuybackEnabled", args: readonly unknown[]): TransactionRequest {
  factory = normalizeAddress(factory, "factory");
  return {
    to: factory,
    data: encodeFunctionData({ abi: ponsFactoryAbi, functionName, args } as never),
    value: 0n,
  };
}

function normalizeAddress(value: string, path: string): Address {
  if (!isAddress(value)) invalid(path, "a valid EVM address", value);
  return getAddress(value);
}

function assertBytes32(value: Hex, path: string): void {
  if (!isHex(value) || value.length !== 66) invalid(path, "32 bytes", value);
}

function assertLength(value: string, min: number, max: number, path: string): void {
  const length = new TextEncoder().encode(value).length;
  if (length < min || length > max) invalid(path, `${min}-${max} UTF-8 bytes`, length);
}

function assertPositive(value: bigint, path: string): void {
  if (value <= 0n) invalid(path, "greater than zero", value);
}

function assertNonNegative(value: bigint, path: string): void {
  if (value < 0n) invalid(path, "zero or greater", value);
}

function invalid(path: string, expected: string, actual: unknown): never {
  throw new PonsSdkError("INVALID_ARGUMENT", `${path} must be ${expected}`, {
    path,
    expected,
    actual: String(actual),
  });
}
