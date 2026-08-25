import { encodeAbiParameters, getAddress, keccak256 } from "viem";
import { PonsSdkError } from "./errors.js";
/**
 * Uniswap V4 pool ids are deterministic, so a Pons pool's identity can be
 * derived rather than read back over RPC:
 *
 *   poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 *
 * Consumers that already know a launch's token, pair token and launch config
 * therefore need no `eth_call` to relate a poolId to its launch. That matters
 * for indexers: reading it back required an archive-depth call pinned to a
 * historical blockHash, once per fee event.
 */
const UINT24_MAX = 0xffffffn;
const INT24_MIN = -0x800000n;
const INT24_MAX = 0x7fffffn;
function assertRange(value, min, max, path, expected) {
    if (value < min || value > max) {
        throw new PonsSdkError("INVALID_ARGUMENT", `${path} must be ${expected}`, {
            path,
            expected,
            actual: value.toString(),
        });
    }
}
/**
 * Whether the memecoin sorts as currency0, which V4 decides purely by address
 * order. This is the same value the meme hook reports as `memecoinIsCurrency0`,
 * so it never needs to be read.
 */
export function memecoinIsCurrency0(token, pairToken) {
    return getAddress(token).toLowerCase() < getAddress(pairToken).toLowerCase();
}
/** Derives the V4 pool id for a Pons launch against a deployment's meme hook. */
export function derivePonsPoolId(deployment, key) {
    assertRange(key.fee, 0n, UINT24_MAX, "fee", "a uint24");
    assertRange(key.tickSpacing, INT24_MIN, INT24_MAX, "tickSpacing", "an int24");
    const token = getAddress(key.token);
    const pairToken = getAddress(key.pairToken);
    const [currency0, currency1] = memecoinIsCurrency0(token, pairToken)
        ? [token, pairToken]
        : [pairToken, token];
    return keccak256(encodeAbiParameters([
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
    ], [currency0, currency1, Number(key.fee), Number(key.tickSpacing), deployment.contracts.memeHook]));
}
//# sourceMappingURL=pools.js.map