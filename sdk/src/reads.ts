import { encodeAbiParameters, getAddress, keccak256, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { ponsBuybackVaultAbi, ponsCurveAbi, ponsFactoryAbi, ponsFeeEscrowAbi, ponsLockerAbi, ponsMemeHookAbi, ponsTokenAbi, uniswapV4PositionReadAbi } from "./abis.js";
import type { PonsDeployment } from "./deployments.js";
import { PonsSdkError } from "./errors.js";

export enum GraduationPhase {
  NotGraduated = 0,
  Swept = 1,
  PoolCreated = 2,
  Rescued = 3,
}

const MAX_LAUNCH_CONFIGS = 10_000n;

export async function readLaunchConfigs(client: PublicClient, deployment: PonsDeployment, options: ReadAtBlockOptions = {}) {
  const blockNumber = options.blockNumber ?? await client.getBlockNumber();
  const count = await client.readContract({
    address: deployment.contracts.factory,
    abi: ponsFactoryAbi,
    functionName: "launchConfigCount",
    blockNumber,
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
    blockNumber,
  }).then((config) => ({ id, ...config }))));
}

export async function readLaunchTerms(client: PublicClient, deployment: PonsDeployment, launcher?: Address, options: ReadAtBlockOptions = {}) {
  const blockNumber = options.blockNumber ?? await client.getBlockNumber();
  const factory = deployment.contracts.factory;
  const [launchFee, launchEnabled, maxCreatorTaxBps, snipeTaxStartBps, snipeTaxSeconds, configs, canLaunch] =
    await Promise.all([
      client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: "launchFee", blockNumber }),
      client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: "launchEnabled", blockNumber }),
      client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: "maxCreatorTaxBps", blockNumber }),
      client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: "snipeTaxStartBps", blockNumber }),
      client.readContract({ address: factory, abi: ponsFactoryAbi, functionName: "snipeTaxSeconds", blockNumber }),
      readLaunchConfigs(client, deployment, { blockNumber }),
      launcher === undefined ? Promise.resolve(undefined) : client.readContract({
        address: factory,
        abi: ponsFactoryAbi,
        functionName: "canLaunch",
        args: [getAddress(launcher)],
        blockNumber,
      }),
    ]);
  return { blockNumber, launchFee, launchEnabled, maxCreatorTaxBps, snipeTaxStartBps, snipeTaxSeconds, configs, canLaunch };
}

export interface ReadAtBlockOptions {
  blockNumber?: bigint;
}

export async function readCurveIdentityAtBlock(
  client: PublicClient,
  curve: Address,
  options: ReadAtBlockOptions = {},
) {
  const blockNumber = options.blockNumber ?? await client.getBlockNumber();
  const address = getAddress(curve);
  const read = { address, abi: ponsCurveAbi, blockNumber } as const;
  const [token, pairToken] = await Promise.all([
    client.readContract({ ...read, functionName: "token" }),
    client.readContract({ ...read, functionName: "pairToken" }),
  ]);
  return { blockNumber, curve: address, token: getAddress(token), pairToken: getAddress(pairToken) };
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

/**
 * Reads and cross-checks the factory, launch-config, fee-policy, and curve facts
 * an indexer needs to initialize one launch at a single historical block.
 */
export async function readLaunchIndexingSnapshotAtBlock(
  client: PublicClient,
  deployment: PonsDeployment,
  token: Address,
  launchConfigId: bigint,
  options: ReadAtBlockOptions = {},
) {
  const blockNumber = options.blockNumber ?? await client.getBlockNumber();
  const canonicalToken = getAddress(token);
  const launch = await readLaunchedToken(client, deployment, canonicalToken, { blockNumber });
  const factory = deployment.contracts.factory;
  const curve = getAddress(launch.curve);
  const [config, policy, identity, feeBps, phantomQuote, graduationThreshold] = await Promise.all([
    client.readContract({
      address: factory, abi: ponsFactoryAbi, functionName: "getLaunchConfig",
      args: [launchConfigId], blockNumber,
    }),
    client.readContract({
      address: factory, abi: ponsFactoryAbi, functionName: "getLaunchFeePolicy",
      args: [canonicalToken], blockNumber,
    }),
    readCurveIdentityAtBlock(client, curve, { blockNumber }),
    client.readContract({ address: curve, abi: ponsCurveAbi, functionName: "feeBps", blockNumber }),
    client.readContract({ address: curve, abi: ponsCurveAbi, functionName: "phantomQuote", blockNumber }),
    client.readContract({ address: curve, abi: ponsCurveAbi, functionName: "graduationThreshold", blockNumber }),
  ]);

  const fail = (message: string, path: string, expected: unknown, actual: unknown): never => {
    throw new PonsSdkError("POINTER_MISMATCH", message, {
      path, expected: String(expected), actual: String(actual),
    });
  };
  if (identity.token !== canonicalToken) {
    fail("Pons curve token does not match its factory launch", "curve.token", canonicalToken, identity.token);
  }
  if (identity.pairToken !== getAddress(launch.pairToken)) {
    fail("Pons curve pair token does not match its factory launch", "curve.pairToken", launch.pairToken, identity.pairToken);
  }
  if (BigInt(feeBps) !== BigInt(config.curveFeeBps)) {
    fail("Pons curve fee does not match its launch configuration", "curve.feeBps", config.curveFeeBps, feeBps);
  }
  if (BigInt(graduationThreshold) !== BigInt(launch.graduationThreshold)) {
    fail(
      "Pons curve graduation threshold does not match its factory launch",
      "curve.graduationThreshold",
      launch.graduationThreshold,
      graduationThreshold,
    );
  }
  if (BigInt(launch.poolFee) !== BigInt(config.poolFee) || BigInt(launch.tickSpacing) !== BigInt(config.tickSpacing)) {
    fail(
      "Pons graduated pool parameters do not match the launch configuration",
      "launch.poolKey",
      `${config.poolFee}:${config.tickSpacing}`,
      `${launch.poolFee}:${launch.tickSpacing}`,
    );
  }
  if (
    identity.pairToken === zeroAddress
    && (BigInt(phantomQuote) !== BigInt(config.phantomQuote)
      || BigInt(graduationThreshold) !== BigInt(config.graduationThreshold))
  ) {
    fail(
      "Pons native curve economics do not match the launch configuration",
      "curve.economics",
      `${config.phantomQuote}:${config.graduationThreshold}`,
      `${phantomQuote}:${graduationThreshold}`,
    );
  }

  return {
    blockNumber,
    launchConfigId,
    token: canonicalToken,
    curve,
    pairToken: identity.pairToken,
    launch,
    config,
    policy,
    curveEconomics: { feeBps, phantomQuote, graduationThreshold },
  };
}

export async function readCurveSnapshot(
  client: PublicClient,
  curve: Address,
  options: ReadAtBlockOptions = {},
) {
  const blockNumber = options.blockNumber ?? await client.getBlockNumber();
  curve = getAddress(curve);
  const readOptions = { address: curve, abi: ponsCurveAbi, blockNumber } as const;
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
    blockNumber,
  });
  return {
    blockNumber,
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

export function derivePonsGraduatedPoolId(parameters: {
  token: Address;
  pairToken: Address;
  poolFee: number;
  tickSpacing: number;
  memeHook: Address;
}): Hex {
  const token = getAddress(parameters.token);
  const pairToken = getAddress(parameters.pairToken);
  const [currency0, currency1] = BigInt(token) < BigInt(pairToken)
    ? [token, pairToken]
    : [pairToken, token];
  if (!Number.isInteger(parameters.poolFee) || parameters.poolFee < 0 || parameters.poolFee > 0xffffff) {
    throw new PonsSdkError("INVALID_ARGUMENT", `Invalid Pons pool fee ${parameters.poolFee}`, { path: "poolFee" });
  }
  if (!Number.isInteger(parameters.tickSpacing) || parameters.tickSpacing < -0x800000 || parameters.tickSpacing > 0x7fffff) {
    throw new PonsSdkError("INVALID_ARGUMENT", `Invalid Pons tick spacing ${parameters.tickSpacing}`, { path: "tickSpacing" });
  }
  return keccak256(encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
    [currency0, currency1, parameters.poolFee, parameters.tickSpacing, getAddress(parameters.memeHook)],
  ));
}

export async function readGraduatedPoolFeeState(
  client: PublicClient,
  deployment: PonsDeployment,
  token: Address,
  options: ReadAtBlockOptions = {},
) {
  const blockNumber = options.blockNumber ?? await client.getBlockNumber();
  const launch = await readLaunchedToken(client, deployment, token, { blockNumber });
  if (graduationPhase(launch.phase) !== GraduationPhase.PoolCreated) {
    throw new PonsSdkError("INVALID_ARGUMENT", `Pons token ${token} has no graduated pool`, { path: "phase", actual: String(launch.phase) });
  }
  const poolId = derivePonsGraduatedPoolId({
    token: getAddress(token), pairToken: launch.pairToken, poolFee: launch.poolFee,
    tickSpacing: launch.tickSpacing, memeHook: deployment.contracts.memeHook,
  });
  const read = { address: deployment.contracts.memeHook, abi: ponsMemeHookAbi, blockNumber } as const;
  const currencies = [getAddress(token), getAddress(launch.pairToken)] as const;
  const [registration, tokenFees, quoteFees, tokenBuyback, quoteBuyback, tokenTax, quoteTax] = await Promise.all([
    client.readContract({ ...read, functionName: "launches", args: [poolId] }),
    client.readContract({ ...read, functionName: "pendingFees", args: [poolId, currencies[0]] }),
    client.readContract({ ...read, functionName: "pendingFees", args: [poolId, currencies[1]] }),
    client.readContract({ ...read, functionName: "pendingBuyback", args: [poolId, currencies[0]] }),
    client.readContract({ ...read, functionName: "pendingBuyback", args: [poolId, currencies[1]] }),
    client.readContract({ ...read, functionName: "pendingCreatorTax", args: [poolId, currencies[0]] }),
    client.readContract({ ...read, functionName: "pendingCreatorTax", args: [poolId, currencies[1]] }),
  ]);
  if (!registration[0] || getAddress(registration[2]) !== getAddress(token)) {
    throw new PonsSdkError("DEPLOYMENT_NOT_FOUND", `Pons hook has no matching pool for ${token}`, { path: "poolId", actual: poolId });
  }
  return {
    blockNumber,
    poolId,
    launch,
    registration,
    pending: {
      token: { fees: tokenFees, buyback: tokenBuyback, creatorTax: tokenTax },
      quote: { fees: quoteFees, buyback: quoteBuyback, creatorTax: quoteTax },
    },
  };
}

export async function readFeeEscrowBalances(
  client: PublicClient,
  deployment: PonsDeployment,
  recipient: Address,
  tokens: readonly Address[] = [],
  options: ReadAtBlockOptions = {},
) {
  const blockNumber = options.blockNumber ?? await client.getBlockNumber();
  recipient = getAddress(recipient);
  const read = { address: deployment.contracts.feeEscrow, abi: ponsFeeEscrowAbi, blockNumber } as const;
  const [native, tokenBalances] = await Promise.all([
    client.readContract({ ...read, functionName: "balanceOf", args: [recipient] }),
    Promise.all(tokens.map(async (token) => {
      const address = getAddress(token);
      const balance = await client.readContract({ ...read, functionName: "balanceOfToken", args: [recipient, address] });
      return { token: address, balance };
    })),
  ]);
  return { blockNumber, recipient, native, tokens: tokenBalances };
}

export async function readBuybackVest(
  client: PublicClient,
  deployment: PonsDeployment,
  token: Address,
  options: ReadAtBlockOptions = {},
) {
  const blockNumber = options.blockNumber ?? await client.getBlockNumber();
  token = getAddress(token);
  const read = { address: deployment.contracts.buybackVault, abi: ponsBuybackVaultAbi, blockNumber } as const;
  const [totalLocked, totalReleased, vestedAmount, releasable, terms] = await Promise.all([
    client.readContract({ ...read, functionName: "totalLocked", args: [token] }),
    client.readContract({ ...read, functionName: "totalReleased", args: [token] }),
    client.readContract({ ...read, functionName: "vestedAmount", args: [token] }),
    client.readContract({ ...read, functionName: "releasable", args: [token] }),
    client.readContract({ ...read, functionName: "vestingTerms", args: [token] }),
  ]);
  return {
    blockNumber, token, totalLocked, totalReleased, vestedAmount, releasable,
    creatorRecipient: terms[0], protocolRecipient: terms[1], protocolFeeShareBps: terms[2],
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

function requireMatch(condition: boolean, message: string) {
  if (!condition) throw new PonsSdkError("POSITION_OBSERVATION_MISMATCH", message);
}
const sameAddress = (a: Address, b: Address) => getAddress(a) === getAddress(b);

/** Read Pons launch NFT custody and pool facts at a caller-selected block.
 * Call assertCompatibleDeployment separately when establishing deployment trust.
 * Number-pinned reads bracketed by hash checks detect observed reorgs, but are
 * not an atomic snapshot or a guarantee against a future reorganization.
 */
export async function readGraduatedPosition(client: PublicClient, deployment: PonsDeployment,
  token: Address, { blockNumber }: { blockNumber: bigint }) {
  token = getAddress(token);
  if (typeof blockNumber !== 'bigint' || blockNumber < deployment.startBlock) {
    throw new PonsSdkError('INVALID_ARGUMENT', 'Checkpoint must be at or after the reviewed Pons deployment start');
  }
  if (await client.getChainId() !== deployment.chainId) {
    throw new PonsSdkError("CHAIN_MISMATCH", "RPC chainId is incompatible with the deployment");
  }
  const before = await client.getBlock({ blockNumber });
  if (!before.hash) throw new PonsSdkError('CHECKPOINT_UNAVAILABLE', 'Checkpoint block hash is unavailable');
  const launch = await readLaunchedToken(client, deployment, token, { blockNumber });
  requireMatch(sameAddress(launch.token, token), 'Factory launch token does not match the requested token');
  const base = {
    chainId: deployment.chainId,
    token,
    blockNumber,
    blockHash: before.hash,
    abiRevision: deployment.abiRevision,
  };
  const finish = async <T extends object>(result: T) => {
    // All reads use the same block number. Detect a changed canonical hash over
    // the read window; this is an observation, not a guarantee against reorgs.
    const after = await client.getBlock({ blockNumber });
    if (after.hash !== before.hash) throw new PonsSdkError('CHECKPOINT_CHANGED', 'Checkpoint reorganized during the observation; rerun at a stable block');
    return { ...base, ...result };
  };
  if (launch.phase !== GraduationPhase.PoolCreated) {
    requireMatch([GraduationPhase.NotGraduated, GraduationPhase.Swept, GraduationPhase.Rescued].includes(launch.phase),
      'Factory returned an unrecognized lifecycle phase');
    return finish({ status: 'no_graduated_position' as const, lifecyclePhase: launch.phase, position: null });
  }

  const locker = deployment.contracts.locker;
  const manager = deployment.contracts.positionManager;
  const [locked, positionId, lockerManager, lockerFactory] = await Promise.all([
    client.readContract({ address: locker, abi: ponsLockerAbi, functionName: 'isLocked', args: [token], blockNumber }),
    client.readContract({ address: locker, abi: ponsLockerAbi, functionName: 'lockedPositions', args: [token], blockNumber }),
    client.readContract({ address: locker, abi: ponsLockerAbi, functionName: 'positionManager', blockNumber }),
    client.readContract({ address: locker, abi: ponsLockerAbi, functionName: 'factory', blockNumber }),
  ]);
  requireMatch(locked === true, 'Graduated Pons launch is not registered as locked');
  requireMatch(sameAddress(lockerManager, manager) && sameAddress(lockerFactory, deployment.contracts.factory),
    'Locker is not wired to the reviewed factory and V4 position manager');
  const read = { address: manager, abi: uniswapV4PositionReadAbi, args: [positionId], blockNumber } as const;
  const [owner, liquidity, [key, info]] = await Promise.all([
    client.readContract({ ...read, functionName: 'ownerOf' }),
    client.readContract({ ...read, functionName: 'getPositionLiquidity' }),
    client.readContract({ ...read, functionName: 'getPoolAndPositionInfo' }),
  ]);
  requireMatch(sameAddress(owner, locker), 'Graduated position NFT is not held by the reviewed Pons locker');
  const currencies = [token, getAddress(launch.pairToken)].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  requireMatch(sameAddress(key.currency0, currencies[0]) && sameAddress(key.currency1, currencies[1])
    && key.fee === launch.poolFee && key.tickSpacing === launch.tickSpacing
    && sameAddress(key.hooks, deployment.contracts.memeHook),
  'Position pool key differs from the Pons launch currencies, fee, spacing, or hook');
  const tickLower = Number(BigInt.asIntN(24, info >> 8n));
  const tickUpper = Number(BigInt.asIntN(24, info >> 32n));
  requireMatch(tickLower < tickUpper && tickLower >= -887272 && tickUpper <= 887272,
    'Position tick range is invalid');
  const poolId = derivePonsGraduatedPoolId({ token, pairToken: launch.pairToken,
    poolFee: launch.poolFee, tickSpacing: launch.tickSpacing, memeHook: deployment.contracts.memeHook });
  requireMatch(info >> 56n === BigInt(poolId) >> 56n, 'Packed position pool ID differs from the returned pool key');
  return finish({
    status: 'observed' as const,
    lifecyclePhase: GraduationPhase.PoolCreated as const,
    position: {
      positionManager: getAddress(manager), tokenId: positionId, poolId,
      owner: getAddress(owner), locker: getAddress(locker), locked: true as const,
      liquidity, tickLower, tickUpper,
      poolKey: key,
    },
  });
}
