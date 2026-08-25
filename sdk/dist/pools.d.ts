import { type Address, type Hex } from "viem";
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
/**
 * Whether the memecoin sorts as currency0, which V4 decides purely by address
 * order. This is the same value the meme hook reports as `memecoinIsCurrency0`,
 * so it never needs to be read.
 */
export declare function memecoinIsCurrency0(token: Address, pairToken: Address): boolean;
/** Derives the V4 pool id for a Pons launch against a deployment's meme hook. */
export declare function derivePonsPoolId(deployment: PonsDeployment, key: PonsPoolKey): Hex;
