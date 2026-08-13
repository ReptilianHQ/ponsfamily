import { decodeEventLog, getAddress } from "viem";
import { ponsBuybackVaultAbi, ponsCurveAbi, ponsFactoryAbi, ponsFeeEscrowAbi, ponsForwarderAbi, ponsMemeHookAbi } from "./abis.js";
import { PonsSdkError } from "./errors.js";
export function assertConfirmedTransaction(transaction, request, expectedSender) {
    if (expectedSender !== undefined && !sameAddress(transaction.from, expectedSender)) {
        mismatch("UNEXPECTED_SENDER", "from", expectedSender, transaction.from);
    }
    if (transaction.to === null || !sameAddress(transaction.to, request.to)) {
        mismatch("UNEXPECTED_TARGET", "to", request.to, transaction.to ?? "null");
    }
    if (transaction.value !== request.value)
        mismatch("UNEXPECTED_VALUE", "value", String(request.value), String(transaction.value));
    if (transaction.input.toLowerCase() !== request.data.toLowerCase())
        mismatch("CALLDATA_MISMATCH", "input", request.data, transaction.input);
}
export function assertSuccessfulReceipt(receipt) {
    if (receipt.status !== "success" && receipt.status !== 1 && receipt.status !== "0x1") {
        throw new PonsSdkError("RECEIPT_REVERTED", `Pons transaction${receipt.transactionHash ? ` ${receipt.transactionHash}` : ""} reverted`, {
            path: "status",
            expected: "success",
            actual: String(receipt.status),
        });
    }
}
export function verifyLaunchReceipt(receipt, factory, options = {}) {
    const launch = requireEvent(receipt, factory, ponsFactoryAbi, "TokenLaunched");
    assertFields(launch, options.expected ?? {}, new Set(["token", "curve", "deployer", "pairToken"]));
    if (options.forwarder === undefined && options.openingBuy === undefined)
        return { launch };
    if (options.forwarder === undefined)
        invalid("forwarder is required when openingBuy expectations are supplied");
    const openingBuy = requireEvent(receipt, options.forwarder, ponsForwarderAbi, "Launched");
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
export function verifyCurveBuyReceipt(receipt, curve, expected = {}) {
    const result = requireEvent(receipt, curve, ponsCurveAbi, "CurveBuy");
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
            mismatch("OUTPUT_BELOW_MINIMUM", "tokensOut", quoteOffered === undefined ? `>= ${minTokensOut}` : `price bound from ${quoteOffered}/${minTokensOut}`, `${result.quoteIn}/${result.tokensOut}`);
        }
    }
    return result;
}
export function verifyCurveSellReceipt(receipt, curve, expected = {}) {
    const result = requireEvent(receipt, curve, ponsCurveAbi, "CurveSell");
    const { minQuoteOut, ...exact } = expected;
    assertFields(result, exact, new Set(["seller", "recipient"]));
    if (minQuoteOut !== undefined && result.quoteOut < minQuoteOut) {
        mismatch("OUTPUT_BELOW_MINIMUM", "quoteOut", `>= ${minQuoteOut}`, String(result.quoteOut));
    }
    return result;
}
export function verifyPoolGraduatedReceipt(receipt, factory, expected = {}) {
    const result = requireEvent(receipt, factory, ponsFactoryAbi, "PoolGraduated");
    assertFields(result, expected, new Set(["token"]));
    return result;
}
export function verifyFeesSweptReceipt(receipt, curve, expected = {}) {
    const result = requireEvent(receipt, curve, ponsCurveAbi, "FeesSwept");
    assertFields(result, expected, new Set());
    return result;
}
export function verifyBuybackLockedReceipt(receipt, curve, expected = {}) {
    const result = requireEvent(receipt, curve, ponsCurveAbi, "BuybackLocked");
    assertFields(result, expected, new Set());
    return result;
}
export function verifyLaunchSweptReceipt(receipt, factory, expected = {}) {
    const result = requireEvent(receipt, factory, ponsFactoryAbi, "LaunchSwept");
    assertFields(result, expected, new Set(["token"]));
    return result;
}
export function verifyCreatorFeeRecipientUpdatedReceipt(receipt, factory, expected = {}) {
    const result = requireEvent(receipt, factory, ponsFactoryAbi, "CreatorFeeRecipientUpdated");
    assertFields(result, expected, new Set(["token", "previousRecipient", "newRecipient"]));
    return result;
}
export function verifyBuybackEnabledUpdatedReceipt(receipt, factory, expected = {}) {
    const result = requireEvent(receipt, factory, ponsFactoryAbi, "BuybackEnabledUpdated");
    assertFields(result, expected, new Set(["token", "controller"]));
    return result;
}
export function verifyPoolFeesSweptReceipt(receipt, memeHook, expected = {}) {
    const result = requireEvent(receipt, memeHook, ponsMemeHookAbi, "PoolFeesSwept");
    assertFields(result, expected, new Set());
    return result;
}
export function verifyNativeFeesClaimedReceipt(receipt, feeEscrow, expected = {}) {
    const result = requireEvent(receipt, feeEscrow, ponsFeeEscrowAbi, "Claimed");
    assertFields(result, expected, new Set(["recipient"]));
    return result;
}
export function verifyTokenFeesClaimedReceipt(receipt, feeEscrow, expected = {}) {
    const result = requireEvent(receipt, feeEscrow, ponsFeeEscrowAbi, "ClaimedToken");
    assertFields(result, expected, new Set(["recipient", "token"]));
    return result;
}
export function verifyBuybackReleasedReceipt(receipt, buybackVault, expected = {}) {
    const result = requireEvent(receipt, buybackVault, ponsBuybackVaultAbi, "Released");
    assertFields(result, expected, new Set(["token"]));
    return result;
}
function requireEvent(receipt, emitter, abi, eventName) {
    assertSuccessfulReceipt(receipt);
    for (const log of receipt.logs) {
        if (!sameAddress(log.address, emitter))
            continue;
        try {
            const decoded = decodeEventLog({ abi, eventName, data: log.data, topics: log.topics, strict: true });
            if (decoded.eventName === eventName)
                return normalizeAddresses(decoded.args);
        }
        catch {
            // The expected emitter can produce unrelated events in the same receipt.
        }
    }
    throw new PonsSdkError("EVENT_NOT_FOUND", `Expected ${eventName} event from ${emitter}`, {
        path: "logs",
        expected: `${eventName} from ${emitter}`,
        actual: "no matching log",
    });
}
function normalizeAddresses(value) {
    if (!value || typeof value !== "object")
        return value;
    const entries = Object.entries(value).map(([key, child]) => [
        key,
        typeof child === "string" && /^0x[0-9a-fA-F]{40}$/.test(child) ? getAddress(child) : child,
    ]);
    return Object.fromEntries(entries);
}
function assertFields(actual, expected, addressFields) {
    for (const [key, expectedValue] of Object.entries(expected)) {
        const actualValue = actual[key];
        const matches = addressFields.has(key) && typeof actualValue === "string" && typeof expectedValue === "string"
            ? sameAddress(actualValue, expectedValue)
            : actualValue === expectedValue;
        if (!matches)
            mismatch("RECEIPT_FIELD_MISMATCH", key, String(expectedValue), String(actualValue));
    }
}
function sameAddress(left, right) {
    return left.toLowerCase() === right.toLowerCase();
}
function mismatch(code, path, expected, actual) {
    throw new PonsSdkError(code, `${path} mismatch: expected ${expected}, got ${actual}`, { path, expected, actual });
}
function invalid(message) {
    throw new PonsSdkError("INVALID_ARGUMENT", message);
}
//# sourceMappingURL=receipts.js.map