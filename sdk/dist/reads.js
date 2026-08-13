import { getAddress, zeroAddress } from "viem";
import { ponsCurveAbi, ponsFactoryAbi, ponsLockerAbi, ponsTokenAbi } from "./abis.js";
import { PonsSdkError } from "./errors.js";
export var GraduationPhase;
(function (GraduationPhase) {
    GraduationPhase[GraduationPhase["NotGraduated"] = 0] = "NotGraduated";
    GraduationPhase[GraduationPhase["Swept"] = 1] = "Swept";
    GraduationPhase[GraduationPhase["PoolCreated"] = 2] = "PoolCreated";
    GraduationPhase[GraduationPhase["Rescued"] = 3] = "Rescued";
})(GraduationPhase || (GraduationPhase = {}));
const MAX_LAUNCH_CONFIGS = 10000n;
export async function readLaunchConfigs(client, deployment) {
    const count = await client.readContract({
        address: deployment.contracts.factory,
        abi: ponsFactoryAbi,
        functionName: "launchConfigCount",
    });
    if (count > MAX_LAUNCH_CONFIGS) {
        throw new PonsSdkError("INVALID_ARGUMENT", `Factory returned an implausible launch config count ${count}`, {
            path: "launchConfigCount",
            expected: `0..${MAX_LAUNCH_CONFIGS}`,
            actual: String(count),
        });
    }
    return Promise.all(Array.from({ length: Number(count) }, (_, id) => client.readContract({
        address: deployment.contracts.factory,
        abi: ponsFactoryAbi,
        functionName: "getLaunchConfig",
        args: [BigInt(id)],
    }).then((config) => ({ id, ...config }))));
}
export async function readLaunchTerms(client, deployment, launcher) {
    const factory = deployment.contracts.factory;
    const [launchFee, launchEnabled, maxCreatorTaxBps, snipeTaxStartBps, snipeTaxSeconds, configs, canLaunch] = await Promise.all([
        client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: "launchFee" }),
        client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: "launchEnabled" }),
        client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: "maxCreatorTaxBps" }),
        client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: "snipeTaxStartBps" }),
        client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: "snipeTaxSeconds" }),
        readLaunchConfigs(client, deployment),
        launcher === undefined ? Promise.resolve(undefined) : client.readContract({
            address: factory,
            abi: ponsFactoryAbi,
            functionName: "canLaunch",
            args: [getAddress(launcher)],
        }),
    ]);
    return { launchFee, launchEnabled, maxCreatorTaxBps, snipeTaxStartBps, snipeTaxSeconds, configs, canLaunch };
}
export async function readLaunchedToken(client, deployment, token, options = {}) {
    const launch = await client.readContract({
        address: deployment.contracts.factory,
        abi: ponsFactoryAbi,
        functionName: "getLaunchedToken",
        args: [getAddress(token)],
        blockNumber: options.blockNumber,
    });
    if (!launch.exists || launch.curve === zeroAddress) {
        throw new PonsSdkError("DEPLOYMENT_NOT_FOUND", `Token ${token} was not launched by this Pons factory`, {
            path: "token",
            actual: token,
        });
    }
    return launch;
}
export async function readCurveSnapshot(client, curve, options = {}) {
    curve = getAddress(curve);
    const readOptions = { address: curve, abi: ponsCurveAbi, blockNumber: options.blockNumber };
    const [token, pairToken, feeBps, creatorTaxBps, graduationThreshold, sellableTokens, reserves, realQuoteReserve, readyToGraduate, graduated] = await Promise.all([
        client.readContract({ ...readOptions, functionName: "token" }),
        client.readContract({ ...readOptions, functionName: "pairToken" }),
        client.readContract({ ...readOptions, functionName: "feeBps" }),
        client.readContract({ ...readOptions, functionName: "creatorTaxBps" }),
        client.readContract({ ...readOptions, functionName: "graduationThreshold" }),
        client.readContract({ ...readOptions, functionName: "sellableTokens" }),
        client.readContract({ ...readOptions, functionName: "getReserves" }),
        client.readContract({ ...readOptions, functionName: "realQuoteReserve" }),
        client.readContract({ ...readOptions, functionName: "readyToGraduate" }),
        client.readContract({ ...readOptions, functionName: "graduated" }),
    ]);
    const quoteDecimals = pairToken === zeroAddress ? 18 : await client.readContract({
        address: pairToken,
        abi: ponsTokenAbi,
        functionName: "decimals",
        blockNumber: options.blockNumber,
    });
    return {
        curve,
        token,
        pairToken,
        quoteDecimals: Number(quoteDecimals),
        tokenDecimals: 18,
        feeBps,
        creatorTaxBps,
        graduationThreshold,
        sellableTokens,
        quoteReserve: reserves[0],
        realQuoteReserve,
        tokenReserve: reserves[1],
        readyToGraduate,
        graduated,
    };
}
/** Reads one internally consistent launch lifecycle snapshot at a single block. */
export async function readLaunchLifecycle(client, deployment, token, options = {}) {
    const blockNumber = options.blockNumber ?? await client.getBlockNumber();
    const launch = await readLaunchedToken(client, deployment, token, { blockNumber });
    const snapshot = await readCurveSnapshot(client, launch.curve, { blockNumber });
    const phase = graduationPhase(launch.phase);
    const poolPositionId = phase === GraduationPhase.PoolCreated
        ? await client.readContract({
            address: deployment.contracts.locker,
            abi: ponsLockerAbi,
            functionName: "lockedPositions",
            args: [getAddress(token)],
            blockNumber,
        })
        : 0n;
    const graduationProgressBps = launch.graduationThreshold === 0n
        ? undefined
        : minBigint(10000n, snapshot.realQuoteReserve * 10000n / launch.graduationThreshold);
    return {
        blockNumber,
        token: getAddress(token),
        curve: getAddress(launch.curve),
        pairToken: getAddress(launch.pairToken),
        phase,
        graduationThreshold: launch.graduationThreshold,
        graduationProgressBps,
        poolPositionId,
        snapshot,
        launch,
    };
}
function minBigint(left, right) {
    return left < right ? left : right;
}
function graduationPhase(value) {
    if (value < GraduationPhase.NotGraduated || value > GraduationPhase.Rescued || !Number.isInteger(value)) {
        throw new PonsSdkError("INVALID_ARGUMENT", `Unknown Pons graduation phase ${value}`, {
            path: "phase",
            expected: "an integer from 0 to 3",
            actual: String(value),
        });
    }
    return value;
}
//# sourceMappingURL=reads.js.map