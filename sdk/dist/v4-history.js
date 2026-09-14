import { decodeEventLog, keccak256, parseAbi } from 'viem';
import { v4PoolManagerAbi } from '@reptilianhq/uniswap-sdk/abis';
import { ponsFactoryAbi } from './abis.js';
import { assertCompatibleDeployment } from './compatibility.js';
import { getPonsDeployment } from './deployments.js';
import { PonsSdkError } from './errors.js';
import { getPonsV4Provider, verifyPonsV4PoolRegistration } from './v4-provider.js';
function match(value, path) {
    if (!value)
        throw new PonsSdkError('RECEIPT_FIELD_MISMATCH', 'Pons history evidence does not match reviewed membership', { path });
}
const validHash = (value) => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value) && !/^0x0{64}$/i.test(value);
/** Establish compatibility once for a historical scan. The reviewed factory and
 * hook have no upgrade/delegatecall/selfdestruct path; the hook's factory wiring
 * is one-time. Verify their code at deployment AND at the canonical anchor.
 * Consumers own the trusted canonical event source, page completeness and anchor
 * revalidation. This does not authenticate arbitrary caller-supplied log JSON.
 */
export async function readPonsV4HistoryAnchor(client, options) {
    const deployment = getPonsDeployment(options.chainId ?? 4663);
    match(typeof options.blockNumber === 'bigint' && options.blockNumber >= deployment.startBlock, 'anchor.blockNumber');
    match(typeof options.minimumConfirmations === 'bigint' && options.minimumConfirmations > 0n, 'minimumConfirmations');
    match(await client.getChainId() === deployment.chainId, 'chainId');
    const head = await client.getBlockNumber({ cacheTime: 0 });
    match(head >= options.blockNumber && head - options.blockNumber + 1n >= options.minimumConfirmations, 'confirmations');
    const before = await client.getBlock({ blockNumber: options.blockNumber });
    match(validHash(before.hash), 'anchor.blockHash');
    const compatibility = await assertCompatibleDeployment(client, deployment, { blockNumber: options.blockNumber });
    const [factoryAtCreation, hookAtCreation, hookFactory] = await Promise.all([
        client.getBytecode({ address: deployment.contracts.factory, blockNumber: deployment.startBlock }),
        client.getBytecode({ address: deployment.contracts.memeHook, blockNumber: deployment.startBlock }),
        client.readContract({ address: deployment.contracts.memeHook, abi: parseAbi(['function factory() view returns (address)']), functionName: 'factory', blockNumber: options.blockNumber }),
    ]);
    match(!!factoryAtCreation && keccak256(factoryAtCreation) === deployment.factoryRuntimeCodeHash, 'factory.creationCode');
    match(!!hookAtCreation && keccak256(hookAtCreation) === deployment.memeHookRuntimeCodeHash, 'hook.creationCode');
    match(hookFactory.toLowerCase() === deployment.contracts.factory.toLowerCase(), 'hook.factory');
    match((await client.getBlock({ blockNumber: options.blockNumber })).hash === before.hash, 'anchor.changed');
    return { proofVersion: 'pons-v2-836f0f97/history-v1', chainId: deployment.chainId,
        deploymentId: getPonsV4Provider(deployment.chainId).deploymentId,
        blockNumber: options.blockNumber, blockHash: before.hash,
        factoryCodeHash: compatibility.factoryCodeHash, hookCodeHash: compatibility.memeHookCodeHash };
}
/** Join three canonical successful-transaction events. In the pinned factory,
 * createGraduatedPool checks the launch exists, marks it PoolCreated, initializes
 * the exact stored key, registers it through the factory-only hook, then emits
 * PoolGraduated. A reverted mint emits none of these canonical logs. Requiring
 * all three events preserves launch/key/graduation evidence without per-pool
 * eth_call or receipt RPC. This is historical indexing evidence, not permission
 * to trade, withdraw locked liquidity or skip current execution compatibility.
 */
export function verifyPonsV4HistoryMembership(anchor, evidence) {
    const deployment = getPonsDeployment(anchor.chainId);
    const provider = getPonsV4Provider(anchor.chainId);
    match(anchor.proofVersion === 'pons-v2-836f0f97/history-v1' && deployment.sourceCommit === '836f0f97f9a9569855876570d6778501c163c883', 'proofVersion');
    match(anchor.deploymentId === provider.deploymentId && validHash(anchor.blockHash)
        && typeof anchor.blockNumber === 'bigint' && anchor.blockNumber >= deployment.startBlock
        && anchor.factoryCodeHash === deployment.factoryRuntimeCodeHash && anchor.hookCodeHash === deployment.memeHookRuntimeCodeHash, 'anchor');
    const { registration, initialization, graduation } = evidence;
    for (const log of [initialization, registration, graduation]) {
        match(log.chainId === anchor.chainId && log.transactionStatus === 'success' && !log.removed, 'log.status');
        match(typeof log.blockNumber === 'bigint' && log.blockNumber >= deployment.startBlock && log.blockNumber <= anchor.blockNumber, 'log.blockNumber');
        match(validHash(log.blockHash) && validHash(log.transactionHash) && Number.isSafeInteger(log.logIndex) && log.logIndex >= 0, 'log.identity');
        match(log.blockNumber === registration.blockNumber && log.blockHash.toLowerCase() === registration.blockHash.toLowerCase()
            && log.transactionHash.toLowerCase() === registration.transactionHash.toLowerCase(), 'transaction.join');
        if (log.blockNumber === anchor.blockNumber)
            match(log.blockHash.toLowerCase() === anchor.blockHash.toLowerCase(), 'anchor.logHash');
    }
    match(initialization.address.toLowerCase() === provider.poolManager.toLowerCase(), 'initialization.address');
    match(graduation.address.toLowerCase() === deployment.contracts.factory.toLowerCase(), 'graduation.address');
    match(initialization.logIndex < registration.logIndex && registration.logIndex < graduation.logIndex, 'event.order');
    let initialized, graduated;
    try {
        initialized = decodeEventLog({ abi: v4PoolManagerAbi, topics: [...initialization.topics], data: initialization.data, strict: true });
        graduated = decodeEventLog({ abi: ponsFactoryAbi, topics: [...graduation.topics], data: graduation.data, strict: true });
    }
    catch (cause) {
        throw new PonsSdkError('INVALID_ARGUMENT', 'Malformed Pons history event', { cause });
    }
    if (initialized.eventName !== 'Initialize' || graduated.eventName !== 'PoolGraduated')
        throw new PonsSdkError('EVENT_NOT_FOUND', 'Expected Initialize and PoolGraduated');
    const pool = verifyPonsV4PoolRegistration(deployment, registration, {
        currency0: initialized.args.currency0, currency1: initialized.args.currency1, fee: initialized.args.fee,
        tickSpacing: initialized.args.tickSpacing, hooks: initialized.args.hooks,
    });
    match(pool.poolId.toLowerCase() === initialized.args.id.toLowerCase(), 'initialization.poolId');
    match(pool.token.toLowerCase() === graduated.args.token.toLowerCase(), 'graduation.token');
    match(graduated.args.positionId > 0n && graduated.args.tokenAmount > 0n && graduated.args.pairTokenAmount > 0n, 'graduation.amounts');
    return pool;
}
//# sourceMappingURL=v4-history.js.map