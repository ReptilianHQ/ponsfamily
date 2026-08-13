import { PonsSdkError } from "./errors.js";
export const BASIS_POINTS = 10000n;
export const MAX_UINT256 = (1n << 256n) - 1n;
export function applySlippage(amount, slippageBps) {
    assertUint256(amount, "amount");
    assertBps(slippageBps, "slippageBps");
    return amount * (BASIS_POINTS - BigInt(slippageBps)) / BASIS_POINTS;
}
export function getAmountOut(amountIn, reserveIn, reserveOut, feeBps = 0n) {
    assertPositive(amountIn, "amountIn");
    assertPositive(reserveIn, "reserveIn");
    assertPositive(reserveOut, "reserveOut");
    assertBigintBps(feeBps, "feeBps");
    const amountInWithFee = checkedMul(amountIn, BASIS_POINTS - feeBps, "amountInWithFee");
    const numerator = checkedMul(amountInWithFee, reserveOut, "amountOut.numerator");
    const denominator = checkedAdd(checkedMul(reserveIn, BASIS_POINTS, "amountOut.reserveInScaled"), amountInWithFee, "amountOut.denominator");
    return numerator / denominator;
}
export function getAmountIn(amountOut, reserveIn, reserveOut, feeBps = 0n) {
    assertPositive(amountOut, "amountOut");
    assertPositive(reserveIn, "reserveIn");
    assertPositive(reserveOut, "reserveOut");
    assertBigintBps(feeBps, "feeBps");
    if (amountOut >= reserveOut)
        invalid("amountOut", "less than reserveOut", amountOut);
    const numerator = checkedMul(checkedMul(amountOut, reserveIn, "amountIn.outputReserveProduct"), BASIS_POINTS, "amountIn.numerator");
    const denominator = checkedMul(reserveOut - amountOut, BASIS_POINTS - feeBps, "amountIn.denominator");
    return checkedAdd(numerator / denominator, 1n, "amountIn.result");
}
export function quoteCurveBuy(parameters) {
    return quoteCurveBuyExecution(parameters).tokensOut;
}
/**
 * Mirrors PonsV2BondingCurve.buy, including independently rounded fee legs,
 * final-buy repricing, and the unused quote refund.
 */
export function quoteCurveBuyExecution(parameters) {
    totalTradeFee(parameters.feeBps, parameters.creatorTaxBps);
    assertPositive(parameters.amountIn, "amountIn");
    assertPositive(parameters.quoteReserve, "quoteReserve");
    assertPositive(parameters.tokenReserve, "tokenReserve");
    assertPositive(parameters.sellableTokens, "sellableTokens");
    let quoteSpent = parameters.amountIn;
    let fee = feeLeg(quoteSpent, parameters.feeBps, "buy.fee");
    let tax = feeLeg(quoteSpent, parameters.creatorTaxBps, "buy.tax");
    const net = quoteSpent - fee - tax;
    let tokensOut = getAmountOut(net, parameters.quoteReserve, parameters.tokenReserve);
    if (tokensOut > parameters.sellableTokens) {
        tokensOut = parameters.sellableTokens;
        const requiredNet = getAmountIn(tokensOut, parameters.quoteReserve, parameters.tokenReserve);
        const grossedUp = mulDivCeil(requiredNet, BASIS_POINTS, BASIS_POINTS - parameters.feeBps - parameters.creatorTaxBps);
        quoteSpent = grossedUp < parameters.amountIn ? grossedUp : parameters.amountIn;
        fee = feeLeg(quoteSpent, parameters.feeBps, "buy.fee");
        tax = feeLeg(quoteSpent, parameters.creatorTaxBps, "buy.tax");
    }
    return {
        quoteOffered: parameters.amountIn,
        quoteSpent,
        quoteRefund: parameters.amountIn - quoteSpent,
        tokensOut,
        fee,
        tax,
        partialFill: quoteSpent < parameters.amountIn,
    };
}
/** Returns the smallest quote input whose on-chain execution reaches tokensOut. */
export function quoteCurveBuyExactTokensOut(parameters) {
    totalTradeFee(parameters.feeBps, parameters.creatorTaxBps);
    assertPositive(parameters.tokensOut, "tokensOut");
    assertPositive(parameters.sellableTokens, "sellableTokens");
    if (parameters.tokensOut > parameters.sellableTokens) {
        invalid("tokensOut", "less than or equal to sellableTokens", parameters.tokensOut);
    }
    const requiredNet = getAmountIn(parameters.tokensOut, parameters.quoteReserve, parameters.tokenReserve);
    let low = 1n;
    let high = mulDivCeil(requiredNet, BASIS_POINTS, BASIS_POINTS - parameters.feeBps - parameters.creatorTaxBps);
    while (low < high) {
        const midpoint = (low + high) / 2n;
        const quoted = quoteCurveBuyExecution({ ...parameters, amountIn: midpoint });
        if (quoted.tokensOut >= parameters.tokensOut)
            high = midpoint;
        else
            low = midpoint + 1n;
    }
    return quoteCurveBuyExecution({ ...parameters, amountIn: low });
}
export function quoteCurveSell(parameters) {
    const gross = getAmountOut(parameters.amountIn, parameters.tokenReserve, parameters.quoteReserve);
    totalTradeFee(parameters.feeBps, parameters.creatorTaxBps);
    return gross
        - feeLeg(gross, parameters.feeBps, "sell.fee")
        - feeLeg(gross, parameters.creatorTaxBps, "sell.tax");
}
function totalTradeFee(feeBps, creatorTaxBps) {
    assertBigintBps(feeBps, "feeBps");
    assertBigintBps(creatorTaxBps, "creatorTaxBps");
    const total = feeBps + creatorTaxBps;
    if (total >= BASIS_POINTS)
        invalid("totalFeeBps", "less than 10000", total);
    return total;
}
function mulDivCeil(value, multiplier, divisor) {
    assertUint256(value, "mulDiv.value");
    assertUint256(multiplier, "mulDiv.multiplier");
    assertUint256(divisor, "mulDiv.divisor");
    const result = (value * multiplier + divisor - 1n) / divisor;
    assertUint256(result, "mulDiv.result");
    return result;
}
function feeLeg(amount, bps, path) {
    return checkedMul(amount, bps, path) / BASIS_POINTS;
}
function checkedMul(left, right, path) {
    const result = left * right;
    assertUint256(result, path);
    return result;
}
function checkedAdd(left, right, path) {
    const result = left + right;
    assertUint256(result, path);
    return result;
}
function assertBps(value, path) {
    if (!Number.isInteger(value) || value < 0 || value > 10_000)
        invalid(path, "an integer from 0 to 10000", value);
}
function assertBigintBps(value, path) {
    if (value < 0n || value >= BASIS_POINTS)
        invalid(path, "from 0 to 9999", value);
}
function assertPositive(value, path) {
    if (value <= 0n)
        invalid(path, "greater than zero", value);
    assertUint256(value, path);
}
function assertUint256(value, path) {
    if (value < 0n)
        invalid(path, "zero or greater", value);
    if (value > MAX_UINT256) {
        throw new PonsSdkError("ARITHMETIC_OVERFLOW", `${path} exceeds uint256`, {
            path,
            expected: `at most ${MAX_UINT256}`,
            actual: String(value),
        });
    }
}
function invalid(path, expected, actual) {
    throw new PonsSdkError("INVALID_ARGUMENT", `${path} must be ${expected}`, {
        path,
        expected,
        actual: String(actual),
    });
}
//# sourceMappingURL=math.js.map