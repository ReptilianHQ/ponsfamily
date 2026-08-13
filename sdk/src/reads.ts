import { getAddress, zeroAddress, type Address, type PublicClient } from "viem";
import { ponsCurveAbi, ponsFactoryAbi, ponsLockerAbi, ponsTokenAbi } from "./abis.js";
import type { PonsDeployment } from "./deployments.js";
import { PonsSdkError } from "./errors.js";

export enum GraduationPhase {
  NotGraduated = 0,
  Swept = 1,
  PoolCreated = 2,
  Rescued = 3,
}

export async function readLaunchConfigs(client: PublicClient, deployment: PonsDeployment) {
  const count = await client.readContract({
    address: deployment.contracts.factory,
    abi: ponsFactoryAbi,
    functionName: "launchConfigCount",
  });
  return Promise.all(Array.from({ length: Number(count) }, (_, id) => client.readContract({
    address: deployment.contracts.factory,
    abi: ponsFactoryAbi,
    functionName: "getLaunchConfig",
    args: [BigInt(id)],
  }).then((config) => ({ id, ...config }))));
}

export async function readLaunchTerms(client: PublicClient, deployment: PonsDeployment, launcher?: Address) {
  const factory = deployment.contracts.factory;
  const [launchFee, launchEnabled, maxCreatorTaxBps, snipeTaxStartBps, snipeTaxSeconds, configs, canLaunch] =
    await Promise.all([
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

export interface ReadAtBlockOptions {
  blockNumber?: bigint;
}

export async function readLaunchedToken(
  client: PublicClient,
  deployment: PonsDeployment,
  token: Address,
  options: ReadAtBlockOptions = {},
) {
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

export async function readCurveSnapshot(
  client: PublicClient,
  curve: Address,
  options: ReadAtBlockOptions = {},
) {
  curve = getAddress(curve);
  const readOptions = { address: curve, abi: ponsCurveAbi, blockNumber: options.blockNumber } as const;
  const [token, pairToken, feeBps, creatorTaxBps, graduationThreshold, sellableTokens, reserves, realQuoteReserve, readyToGraduate, graduated] =
    await Promise.all([
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
export async function readLaunchLifecycle(
  client: PublicClient,
  deployment: PonsDeployment,
  token: Address,
  options: ReadAtBlockOptions = {},
) {
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
    : minBigint(10_000n, snapshot.realQuoteReserve * 10_000n / launch.graduationThreshold);

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

function minBigint(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function graduationPhase(value: number): GraduationPhase {
  if (value < GraduationPhase.NotGraduated || value > GraduationPhase.Rescued || !Number.isInteger(value)) {
    throw new PonsSdkError("INVALID_ARGUMENT", `Unknown Pons graduation phase ${value}`, {
      path: "phase",
      expected: "an integer from 0 to 3",
      actual: String(value),
    });
  }
  return value;
}
