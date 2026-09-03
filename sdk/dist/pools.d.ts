import { type Address, type Hex } from "viem";
import { PonsSdkError } from "./errors.js";
import type { PonsDeployment } from "./deployments.js";
export interface PonsPoolKey {
    /** The launched memecoin. */
    token: Address;
    /**
     * The PoolKey currency, exactly as the launch recorded it.
     *
     * A native-quote launch keys on the zero address. Substituting wrapped native
     * — which indexers commonly store for valuation — yields a pool id that does
     * not exist on chain, silently.
     */
    pairToken: Address;
    fee: bigint;
    tickSpacing: bigint;
}
export interface PonsV4SwapDeltas {
    amount0: bigint;
    amount1: bigint;
}
export interface OrientedPonsV4Swap {
    side: "buy" | "sell";
    tokenAmount: bigint;
    quoteAmount: bigint;
}
export declare class PonsV4SwapShapeError extends PonsSdkError {
    constructor(amount0: bigint, amount1: bigint);
}
/**
 * Whether the memecoin sorts as currency0, which V4 decides purely by address
 * order. This is the same value the meme hook reports as `memecoinIsCurrency0`,
 * so it never needs to be read.
 */
export declare function memecoinIsCurrency0(token: Address, pairToken: Address): boolean;
/** Splits PoolManager deltas into the launched token and quote asset. */
export declare function orientPonsV4Swap(swap: PonsV4SwapDeltas, tokenIsCurrency0: boolean): OrientedPonsV4Swap;
/** Derives the V4 pool id for a Pons launch against a deployment's meme hook. */
export declare function derivePonsPoolId(deployment: PonsDeployment, key: PonsPoolKey): Hex;
