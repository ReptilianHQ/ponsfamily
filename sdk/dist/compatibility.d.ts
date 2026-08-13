import { type Hex, type PublicClient } from "viem";
import type { PonsDeployment } from "./deployments.js";
export interface PonsCompatibilityReport {
    chainId: number;
    blockNumber: bigint;
    abiRevision: string;
    factoryCodeHash: Hex;
    forwarderCodeHash: Hex;
    pointers: PonsDeployment["contracts"];
}
export declare function assertCompatibleDeployment(client: PublicClient, deployment: PonsDeployment, options?: {
    blockNumber?: bigint;
}): Promise<PonsCompatibilityReport>;
