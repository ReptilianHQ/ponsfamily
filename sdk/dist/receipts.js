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
    const launch = requireEvent(receipt, factory, ponsFactoryAbi, "TokenLaunched", options.expected ?? {}, new Set(["token", "curve", "deployer", "pairToken"]));
    if (options.forwarder === undefined && options.openingBuy === undefined)
        return { launch };
    if (options.forwarder === undefined)
        invalid("forwarder is required when openingBuy expectations are supplied");
    const { minTokensOut, ...expected } = options.openingBuy ?? {};
    const openingBuy = requireEvent(receipt, options.forwarder, ponsForwarderAbi, "Launched", { ...expected, token: launch.token, curve: launch.curve }, new Set(["token", "curve", "recipient", "launcher"]));
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
    const { minTokensOut, quoteOffered, ...exact } = expected;
    const result = requireEvent(receipt, curve, ponsCurveAbi, "CurveBuy", exact, new Set(["buyer", "recipient"]));
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
    const { minQuoteOut, ...exact } = expected;
    const result = requireEvent(receipt, curve, ponsCurveAbi, "CurveSell", exact, new Set(["seller", "recipient"]));
    if (minQuoteOut !== undefined && result.quoteOut < minQuoteOut) {
        mismatch("OUTPUT_BELOW_MINIMUM", "quoteOut", `>= ${minQuoteOut}`, String(result.quoteOut));
    }
    return result;
}
export function verifyPoolGraduatedReceipt(receipt, factory, expected = {}) {
    const result = requireEvent(receipt, factory, ponsFactoryAbi, "PoolGraduated", expected, new Set(["token"]));
    return result;
}
export function verifyFeesSweptReceipt(receipt, curve, expected = {}) {
    const result = requireEvent(receipt, curve, ponsCurveAbi, "FeesSwept", expected);
    return result;
}
export function verifyBuybackLockedReceipt(receipt, curve, expected = {}) {
    const result = requireEvent(receipt, curve, ponsCurveAbi, "BuybackLocked", expected);
    return result;
}
export function verifyLaunchSweptReceipt(receipt, factory, expected = {}) {
    const result = requireEvent(receipt, factory, ponsFactoryAbi, "LaunchSwept", expected, new Set(["token"]));
    return result;
}
export function verifyCreatorFeeRecipientUpdatedReceipt(receipt, factory, expected = {}) {
    const result = requireEvent(receipt, factory, ponsFactoryAbi, "CreatorFeeRecipientUpdated", expected, new Set(["token", "previousRecipient", "newRecipient"]));
    return result;
}
export function verifyBuybackEnabledUpdatedReceipt(receipt, factory, expected = {}) {
    const result = requireEvent(receipt, factory, ponsFactoryAbi, "BuybackEnabledUpdated", expected, new Set(["token", "controller"]));
    return result;
}
export function verifyPoolFeesSweptReceipt(receipt, memeHook, expected = {}) {
    const result = requireEvent(receipt, memeHook, ponsMemeHookAbi, "PoolFeesSwept", expected);
    return result;
}
export function verifyNativeFeesClaimedReceipt(receipt, feeEscrow, expected = {}) {
    const result = requireEvent(receipt, feeEscrow, ponsFeeEscrowAbi, "Claimed", expected, new Set(["recipient"]));
    return result;
}
export function verifyTokenFeesClaimedReceipt(receipt, feeEscrow, expected = {}) {
    const result = requireEvent(receipt, feeEscrow, ponsFeeEscrowAbi, "ClaimedToken", expected, new Set(["recipient", "token"]));
    return result;
}
export function verifyBuybackReleasedReceipt(receipt, buybackVault, expected = {}) {
    const result = requireEvent(receipt, buybackVault, ponsBuybackVaultAbi, "Released", expected, new Set(["token"]));
    return result;
}
function requireEvent(receipt, emitter, abi, eventName, expected = {}, addressFields = new Set()) {
    assertSuccessfulReceipt(receipt);
    const matches = [];
    let firstMismatch;
    for (const log of receipt.logs) {
        if (!sameAddress(log.address, emitter))
            continue;
        let result;
        try {
            const decoded = decodeEventLog({ abi, eventName, data: log.data, topics: log.topics, strict: true });
            if (decoded.eventName !== eventName)
                continue;
            result = normalizeAddresses(decoded.args);
        }
        catch {
            // The expected emitter can produce unrelated or malformed logs.
            continue;
        }
        try {
            assertFields(result, expected, addressFields);
            matches.push(result);
        }
        catch (error) {
            if (!(error instanceof PonsSdkError) || error.code !== "RECEIPT_FIELD_MISMATCH")
                throw error;
            firstMismatch ??= error;
        }
    }
    if (matches.length === 1)
        return matches[0];
    if (matches.length > 1) {
        throw new PonsSdkError("AMBIGUOUS_EVENT", `Multiple ${eventName} events match the supplied expectations`, {
            path: "logs", expected: "one matching event", actual: String(matches.length),
        });
    }
    if (firstMismatch)
        throw firstMismatch;
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