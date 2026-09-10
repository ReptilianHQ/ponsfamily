import { decodeEventLog, getAddress, isAddress, keccak256, toBytes } from 'viem';
import { getV4PoolId } from '@reptilianhq/uniswap-sdk/v4';
import { ponsMemeHookAbi } from './abis.js';
import { assertCompatibleDeployment } from './compatibility.js';
import { getPonsDeployment } from './deployments.js';
import { PonsSdkError } from './errors.js';
import { GraduationPhase, readLaunchedToken } from './reads.js';
const registrationSignature = 'PoolRegistered(bytes32,address,address,address)';
/** Portable provider composition v1. Shared SDK consumers use structural typing.
 * Pons owns membership semantics; a hook-address match is not membership proof.
 */
export function getPonsV4Provider(chainId = 4663) {
    const deployment = getPonsDeployment(chainId);
    return {
        schemaVersion: 1, providerId: 'pons', substrate: 'uniswap-v4',
        deploymentId: `${deployment.chainId}:${deployment.contracts.factory.toLowerCase()}:${deployment.abiRevision}`,
        chainId: deployment.chainId, poolManager: deployment.contracts.poolManager,
        startBlock: deployment.startBlock, hooks: [deployment.contracts.memeHook],
        discovery: { address: deployment.contracts.memeHook, eventSignature: registrationSignature,
            poolIdParameter: 'poolId', expectedRuntimeCodeHash: deployment.memeHookRuntimeCodeHash },
        poolEvents: ['Swap'],
    };
}
/** This describes the Pons graduation position, not every position in its pool.
 * Existing Pons curve transaction/receipt APIs remain separate protocol capabilities.
 */
export const ponsV4GraduationCapabilities = Object.freeze({
    readPool: true,
    observeLockedPosition: true,
    withdrawGraduationPrincipal: false,
    swap: Object.freeze({ supported: false, reason: 'No reviewed Pons v4 router/hook execution path in this SDK release' }),
    manageIndependentPosition: Object.freeze({ supported: false, reason: 'Independent v4 position execution has not been verified' }),
});
function requireMatch(value, path) {
    if (!value)
        throw new PonsSdkError('RECEIPT_FIELD_MISMATCH', 'Pons pool membership evidence does not match reviewed identity', { path });
}
/** Verify supplied canonical registration content. Does not establish receipt finality,
 * deployment bytecode or RPC provenance; use readPonsV4PoolRegistrations for those reads.
 */
export function verifyPonsV4PoolRegistration(deployment, log, key) {
    const provider = getPonsV4Provider(deployment.chainId);
    const reviewed = getPonsDeployment(deployment.chainId);
    requireMatch(deployment.abiRevision === reviewed.abiRevision
        && deployment.startBlock === reviewed.startBlock
        && deployment.memeHookRuntimeCodeHash === reviewed.memeHookRuntimeCodeHash
        && ['factory', 'poolManager', 'memeHook'].every(name => deployment.contracts[name].toLowerCase() === reviewed.contracts[name].toLowerCase()), 'deployment');
    requireMatch(log.chainId === provider.chainId, 'chainId');
    requireMatch(isAddress(log.address) && getAddress(log.address) === getAddress(provider.discovery.address), 'address');
    requireMatch(log.removed !== true, 'removed');
    requireMatch(typeof log.blockNumber === 'bigint' && log.blockNumber >= provider.startBlock, 'blockNumber');
    requireMatch(/^0x[\da-f]{64}$/i.test(log.blockHash) && !/^0x0{64}$/i.test(log.blockHash), 'blockHash');
    requireMatch(/^0x[\da-f]{64}$/i.test(log.transactionHash) && !/^0x0{64}$/i.test(log.transactionHash), 'transactionHash');
    requireMatch(Number.isSafeInteger(log.logIndex) && log.logIndex >= 0, 'logIndex');
    requireMatch(key.hooks.toLowerCase() === provider.hooks[0].toLowerCase(), 'hooks');
    let decoded;
    try {
        decoded = decodeEventLog({ abi: ponsMemeHookAbi, topics: [...log.topics], data: log.data, strict: true });
    }
    catch (cause) {
        throw new PonsSdkError('INVALID_ARGUMENT', 'Malformed Pons registration log', { cause });
    }
    if (decoded.eventName !== 'PoolRegistered')
        throw new PonsSdkError('EVENT_NOT_FOUND', 'Expected Pons PoolRegistered');
    let poolId;
    try {
        poolId = getV4PoolId(key);
    }
    catch (cause) {
        throw new PonsSdkError('INVALID_ARGUMENT', 'Invalid Pons v4 pool key', { cause });
    }
    requireMatch(poolId.toLowerCase() === decoded.args.poolId.toLowerCase(), 'poolId');
    const currencies = [key.currency0.toLowerCase(), key.currency1.toLowerCase()];
    requireMatch(currencies.includes(decoded.args.memecoin.toLowerCase()) && currencies.includes(decoded.args.quoteToken.toLowerCase())
        && decoded.args.memecoin.toLowerCase() !== decoded.args.quoteToken.toLowerCase(), 'currencies');
    return { providerId: 'pons', deploymentId: provider.deploymentId, chainId: provider.chainId,
        poolManager: provider.poolManager, poolId, key: { ...key },
        token: getAddress(decoded.args.memecoin), quoteToken: getAddress(decoded.args.quoteToken), creator: getAddress(decoded.args.creator),
        membership: { sourceAddress: getAddress(log.address), eventSignature: registrationSignature,
            blockNumber: log.blockNumber, blockHash: log.blockHash, transactionHash: log.transactionHash, logIndex: log.logIndex },
    };
}
/** Resolve only registrations from one supplied transaction, never scan all v4 pools.
 * Rechecks reviewed deployment code/pointers and canonical block hash. Hosts select
 * finality policy and must revalidate membership/compatibility before future writes.
 */
export async function readPonsV4PoolRegistrations(client, transactionHash, options) {
    const deployment = getPonsDeployment(options.chainId ?? 4663);
    if (typeof options.minimumConfirmations !== 'bigint' || options.minimumConfirmations < 1n)
        throw new PonsSdkError('INVALID_ARGUMENT', 'An explicit positive confirmation depth is required');
    if (await client.getChainId() !== deployment.chainId)
        throw new PonsSdkError('CHAIN_MISMATCH', 'RPC chain differs from Pons deployment');
    const receipt = await client.getTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== 'success')
        throw new PonsSdkError('RECEIPT_REVERTED', 'Pons registration transaction reverted');
    requireMatch(receipt.transactionHash.toLowerCase() === transactionHash.toLowerCase(), 'transactionHash');
    const head = await client.getBlockNumber();
    if (head < receipt.blockNumber || head - receipt.blockNumber + 1n < options.minimumConfirmations)
        throw new PonsSdkError('CHECKPOINT_UNAVAILABLE', 'Pons registration has insufficient confirmations');
    requireMatch(receipt.blockNumber >= deployment.startBlock, 'blockNumber');
    const checkpoint = await client.getBlock({ blockNumber: receipt.blockNumber });
    requireMatch(checkpoint.hash === receipt.blockHash, 'blockHash');
    await assertCompatibleDeployment(client, deployment, { blockNumber: receipt.blockNumber });
    const selected = receipt.logs.filter(log => log.address.toLowerCase() === deployment.contracts.memeHook.toLowerCase()
        && log.topics[0]?.toLowerCase() === keccak256(toBytes(registrationSignature)));
    if (!selected.length)
        throw new PonsSdkError('EVENT_NOT_FOUND', 'Receipt contains no reviewed Pons pool registration');
    const result = [];
    for (const log of selected) {
        let decoded;
        try {
            decoded = decodeEventLog({ abi: ponsMemeHookAbi, topics: log.topics, data: log.data, strict: true });
        }
        catch (cause) {
            throw new PonsSdkError('INVALID_ARGUMENT', 'Malformed Pons registration log', { cause });
        }
        if (decoded.eventName !== 'PoolRegistered')
            continue;
        const launch = await readLaunchedToken(client, deployment, decoded.args.memecoin, { blockNumber: receipt.blockNumber });
        requireMatch(launch.phase === GraduationPhase.PoolCreated, 'launch.phase');
        requireMatch(getAddress(launch.token) === getAddress(decoded.args.memecoin) && getAddress(launch.pairToken) === getAddress(decoded.args.quoteToken), 'launch.currencies');
        const currencies = [getAddress(launch.token), getAddress(launch.pairToken)].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
        requireMatch(log.blockHash === receipt.blockHash && log.blockNumber === receipt.blockNumber
            && log.transactionHash === receipt.transactionHash && log.logIndex !== null, 'log.receipt');
        result.push(verifyPonsV4PoolRegistration(deployment, { ...log, chainId: deployment.chainId,
            blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, transactionHash, logIndex: log.logIndex }, {
            currency0: currencies[0], currency1: currencies[1], fee: launch.poolFee,
            tickSpacing: launch.tickSpacing, hooks: deployment.contracts.memeHook,
        }));
    }
    if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash)
        throw new PonsSdkError('CHECKPOINT_CHANGED', 'Pons registration checkpoint changed; reconcile before indexing');
    return result;
}
//# sourceMappingURL=v4-provider.js.map