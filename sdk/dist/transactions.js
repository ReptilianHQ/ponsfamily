import { encodeFunctionData, getAddress, isAddress, isHex, zeroAddress, } from "viem";
import { ponsBuybackVaultAbi, ponsCurveAbi, ponsFactoryAbi, ponsFeeEscrowAbi, ponsForwarderAbi, ponsMemeHookAbi, ponsTokenAbi, } from "./abis.js";
import { PonsSdkError } from "./errors.js";
export function buildLaunchTransaction(deployment, parameters) {
    const params = normalizeTokenParameters(parameters.token);
    const pairToken = normalizeAddress(parameters.pairToken ?? zeroAddress, "pairToken");
    const exemptions = [...(parameters.snipeTaxExemptions ?? [])].map((value, index) => normalizeAddress(value, `snipeTaxExemptions[${index}]`));
    assertNonNegative(parameters.launchConfigId, "launchConfigId");
    assertNonNegative(parameters.launchFee, "launchFee");
    const openingBuy = parameters.openingBuy;
    if (openingBuy !== undefined) {
        if (pairToken !== zeroAddress)
            invalid("pairToken", "zero address for an atomic opening buy", pairToken);
        assertPositive(openingBuy.quoteIn, "openingBuy.quoteIn");
        assertNonNegative(openingBuy.minTokensOut, "openingBuy.minTokensOut");
        const recipient = normalizeAddress(openingBuy.recipient, "openingBuy.recipient");
        if (exemptions.length > 31)
            invalid("snipeTaxExemptions", "at most 31 entries with an opening buy", exemptions.length);
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
    if (exemptions.length > 32)
        invalid("snipeTaxExemptions", "at most 32 entries", exemptions.length);
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
export function buildCurveBuyTransaction(parameters) {
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
export function buildCurveSellTransaction(parameters) {
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
export function buildApprovalTransaction(token, spender, amount) {
    token = normalizeAddress(token, "token");
    spender = normalizeAddress(spender, "spender");
    assertPositive(amount, "amount");
    return {
        to: token,
        data: encodeFunctionData({ abi: ponsTokenAbi, functionName: "approve", args: [spender, amount] }),
        value: 0n,
    };
}
export function buildGraduateTransaction(factory, token) {
    return factoryTransaction(factory, "graduate", [normalizeAddress(token, "token")]);
}
export function buildCreateGraduatedPoolTransaction(factory, token) {
    return factoryTransaction(factory, "createGraduatedPool", [normalizeAddress(token, "token")]);
}
export function buildTransferCreatorFeeRecipientTransaction(factory, token, newRecipient) {
    return factoryTransaction(factory, "transferCreatorFeeRecipient", [
        normalizeAddress(token, "token"),
        normalizeAddress(newRecipient, "newRecipient"),
    ]);
}
export function buildSetBuybackEnabledTransaction(factory, token, enabled) {
    return factoryTransaction(factory, "setBuybackEnabled", [normalizeAddress(token, "token"), enabled]);
}
export function buildSweepCurveFeesTransaction(curve, minBuybackTokensOut) {
    curve = normalizeAddress(curve, "curve");
    assertNonNegative(minBuybackTokensOut, "minBuybackTokensOut");
    return {
        to: curve,
        data: encodeFunctionData({ abi: ponsCurveAbi, functionName: "sweepFees", args: [minBuybackTokensOut] }),
        value: 0n,
    };
}
export function buildSweepPoolFeesTransaction(memeHook, poolId, minConversionQuoteOut, minBuybackTokensOut) {
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
export function buildClaimNativeFeesTransaction(feeEscrow, amount) {
    feeEscrow = normalizeAddress(feeEscrow, "feeEscrow");
    if (amount !== undefined)
        assertPositive(amount, "amount");
    return {
        to: feeEscrow,
        data: amount === undefined
            ? encodeFunctionData({ abi: ponsFeeEscrowAbi, functionName: "claim" })
            : encodeFunctionData({ abi: ponsFeeEscrowAbi, functionName: "claim", args: [amount] }),
        value: 0n,
    };
}
export function buildClaimTokenFeesTransaction(feeEscrow, token, amount) {
    feeEscrow = normalizeAddress(feeEscrow, "feeEscrow");
    token = normalizeAddress(token, "token");
    if (amount !== undefined)
        assertPositive(amount, "amount");
    return {
        to: feeEscrow,
        data: amount === undefined
            ? encodeFunctionData({ abi: ponsFeeEscrowAbi, functionName: "claimToken", args: [token] })
            : encodeFunctionData({ abi: ponsFeeEscrowAbi, functionName: "claimToken", args: [token, amount] }),
        value: 0n,
    };
}
export function buildReleaseBuybackTransaction(buybackVault, token) {
    buybackVault = normalizeAddress(buybackVault, "buybackVault");
    token = normalizeAddress(token, "token");
    return {
        to: buybackVault,
        data: encodeFunctionData({ abi: ponsBuybackVaultAbi, functionName: "release", args: [token] }),
        value: 0n,
    };
}
function normalizeTokenParameters(parameters) {
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
        expectedEconomics: parameters.expectedEconomics ?? ("0x" + "00".repeat(32)),
        salt: parameters.salt,
    };
    assertLength(normalized.name, 1, 64, "name");
    assertLength(normalized.symbol, 1, 16, "symbol");
    assertLength(normalized.logo, 0, 512, "logo");
    assertLength(normalized.description, 0, 2_048, "description");
    for (const [key, value] of Object.entries(normalized.socials))
        assertLength(value, 0, 256, `socials.${key}`);
    if (!Number.isInteger(normalized.creatorTaxBps) || normalized.creatorTaxBps < 0 || normalized.creatorTaxBps > 1_000) {
        invalid("creatorTaxBps", "an integer from 0 to 1000", normalized.creatorTaxBps);
    }
    assertBytes32(normalized.expectedEconomics, "expectedEconomics");
    assertBytes32(normalized.salt, "salt");
    return normalized;
}
function factoryTransaction(factory, functionName, args) {
    factory = normalizeAddress(factory, "factory");
    return {
        to: factory,
        data: encodeFunctionData({ abi: ponsFactoryAbi, functionName, args }),
        value: 0n,
    };
}
function normalizeAddress(value, path) {
    if (!isAddress(value))
        invalid(path, "a valid EVM address", value);
    return getAddress(value);
}
function assertBytes32(value, path) {
    if (!isHex(value) || value.length !== 66)
        invalid(path, "32 bytes", value);
}
function assertLength(value, min, max, path) {
    const length = new TextEncoder().encode(value).length;
    if (length < min || length > max)
        invalid(path, `${min}-${max} UTF-8 bytes`, length);
}
function assertPositive(value, path) {
    if (value <= 0n)
        invalid(path, "greater than zero", value);
}
function assertNonNegative(value, path) {
    if (value < 0n)
        invalid(path, "zero or greater", value);
}
function invalid(path, expected, actual) {
    throw new PonsSdkError("INVALID_ARGUMENT", `${path} must be ${expected}`, {
        path,
        expected,
        actual: String(actual),
    });
}
//# sourceMappingURL=transactions.js.map