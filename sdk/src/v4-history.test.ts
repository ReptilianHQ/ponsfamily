import { describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, zeroAddress, type Hex, type PublicClient } from 'viem';
import { v4PoolManagerAbi } from '@reptilianhq/uniswap-sdk/abis';
import { getV4PoolId } from '@reptilianhq/uniswap-sdk/v4';
import { ponsFactoryAbi, ponsMemeHookAbi } from './abis.js';
import { robinhoodMainnet as deployment } from './deployments.js';
import { getPonsV4Provider } from './v4-provider.js';
import { readPonsV4HistoryAnchor, verifyPonsV4HistoryMembership, type PonsV4HistoryAnchor, type PonsV4HistoryLog } from './v4-history.js';

vi.mock('./compatibility.js', () => ({ assertCompatibleDeployment: vi.fn(async () => ({
  factoryCodeHash: deployment.factoryRuntimeCodeHash, memeHookCodeHash: deployment.memeHookRuntimeCodeHash,
})) }));
vi.mock('viem', async importOriginal => {
  const original = await importOriginal<typeof import('viem')>();
  return { ...original, keccak256: (bytes: Hex) => bytes === '0x6001' ? deployment.factoryRuntimeCodeHash : bytes === '0x6002' ? deployment.memeHookRuntimeCodeHash : original.keccak256(bytes) };
});

const provider = getPonsV4Provider();
const token = '0x1111111111111111111111111111111111111111', creator = '0x2222222222222222222222222222222222222222';
const hash = `0x${'12'.repeat(32)}` as Hex, transactionHash = `0x${'34'.repeat(32)}` as Hex;
const key = { currency0: zeroAddress, currency1: token, fee: 0, tickSpacing: 200, hooks: deployment.contracts.memeHook } as const;
const poolId = getV4PoolId(key);
function evidence() {
  const common = { chainId: deployment.chainId, blockNumber: deployment.startBlock + 10n, blockHash: hash, transactionHash, transactionStatus: 'success' as const };
  const initialization: PonsV4HistoryLog = { ...common, address: provider.poolManager, logIndex: 2,
    topics: encodeEventTopics({ abi: v4PoolManagerAbi, eventName: 'Initialize', args: { id: poolId, currency0: key.currency0, currency1: key.currency1 } }) as Hex[],
    data: encodeAbiParameters([{ type: 'uint24' }, { type: 'int24' }, { type: 'address' }, { type: 'uint160' }, { type: 'int24' }], [0, 200, key.hooks, 1n << 96n, 0]) };
  const registration: PonsV4HistoryLog = { ...common, address: provider.discovery.address, logIndex: 3,
    topics: encodeEventTopics({ abi: ponsMemeHookAbi, eventName: 'PoolRegistered', args: { poolId } }) as Hex[],
    data: encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'address' }], [token, zeroAddress, creator]) };
  const graduation: PonsV4HistoryLog = { ...common, address: deployment.contracts.factory, logIndex: 4,
    topics: encodeEventTopics({ abi: ponsFactoryAbi, eventName: 'PoolGraduated', args: { token } }) as Hex[],
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], [1n, 100n, 200n]) };
  return { initialization, registration, graduation };
}
const anchor: PonsV4HistoryAnchor = { proofVersion: 'pons-v2-836f0f97/history-v1', chainId: deployment.chainId,
  deploymentId: provider.deploymentId, blockNumber: deployment.startBlock + 20n, blockHash: hash,
  factoryCodeHash: deployment.factoryRuntimeCodeHash, hookCodeHash: deployment.memeHookRuntimeCodeHash };

describe('canonical Pons v4 history evidence', () => {
  it('joins factory graduation, manager initialization and hook registration without per-pool reads', () => {
    expect(verifyPonsV4HistoryMembership(anchor, evidence())).toMatchObject({ poolId, key, token, creator });
  });
  it.each(['initialization', 'registration', 'graduation'] as const)('rejects foreign, orphaned, reverted or mismatched %s evidence', name => {
    for (const patch of [{ chainId: 1 }, { removed: true }, { blockHash: transactionHash }, { transactionHash: hash },
      { blockNumber: anchor.blockNumber + 1n }, { transactionStatus: 'reverted' }, { logIndex: -1 }, { address: token }]) {
      const sample = evidence(); Object.assign(sample[name], patch);
      expect(() => verifyPonsV4HistoryMembership(anchor, sample)).toThrow();
    }
  });
  it('rejects misordered, wrong-pool, wrong-token and malformed companion events', () => {
    const sample = evidence();
    expect(() => verifyPonsV4HistoryMembership(anchor, { ...sample, initialization: { ...sample.initialization, logIndex: 8 } })).toThrow();
    expect(() => verifyPonsV4HistoryMembership(anchor, { ...sample, initialization: { ...sample.initialization, topics: [sample.initialization.topics[0], hash, ...sample.initialization.topics.slice(2)] } })).toThrow();
    expect(() => verifyPonsV4HistoryMembership(anchor, { ...sample, graduation: { ...sample.graduation, topics: encodeEventTopics({ abi: ponsFactoryAbi, eventName: 'PoolGraduated', args: { token: creator } }) as Hex[] } })).toThrow();
    expect(() => verifyPonsV4HistoryMembership(anchor, { ...sample, graduation: { ...sample.graduation, data: '0x' } })).toThrow();
  });
  it('rejects a foreign or changed compatibility anchor', () => {
    for (const patch of [{ chainId: 1 }, { deploymentId: 'other' }, { factoryCodeHash: hash }, { hookCodeHash: hash }, { proofVersion: 'other' },
      { blockNumber: evidence().registration.blockNumber, blockHash: transactionHash }]) {
      expect(() => verifyPonsV4HistoryMembership({ ...anchor, ...patch } as PonsV4HistoryAnchor, evidence())).toThrow();
    }
  });
  it('checks immutable code at creation, one-time factory wiring and canonical anchor fences', async () => {
    const client = { getChainId: vi.fn(async () => deployment.chainId), getBlockNumber: vi.fn(async () => anchor.blockNumber + 10n),
      getBlock: vi.fn(async () => ({ hash })),
      getBytecode: vi.fn(async ({ address }: { address: string }) => address === deployment.contracts.factory ? '0x6001' : '0x6002'),
      readContract: vi.fn(async () => deployment.contracts.factory) };
    const options = { blockNumber: anchor.blockNumber, minimumConfirmations: 2n };
    expect(await readPonsV4HistoryAnchor(client as unknown as PublicClient, options)).toEqual(anchor);
    expect(client.getBytecode.mock.calls.every(([args]) => (args as { blockNumber?: bigint }).blockNumber === deployment.startBlock)).toBe(true);
    client.readContract.mockResolvedValue(token);
    await expect(readPonsV4HistoryAnchor(client as unknown as PublicClient, options)).rejects.toMatchObject({ path: 'hook.factory' });
    client.readContract.mockResolvedValue(deployment.contracts.factory);
    client.getBlock.mockResolvedValueOnce({ hash }).mockResolvedValueOnce({ hash: transactionHash });
    await expect(readPonsV4HistoryAnchor(client as unknown as PublicClient, options)).rejects.toMatchObject({ path: 'anchor.changed' });
    client.getBytecode.mockResolvedValue('0x6003');
    await expect(readPonsV4HistoryAnchor(client as unknown as PublicClient, options)).rejects.toMatchObject({ path: 'factory.creationCode' });
  });
});
