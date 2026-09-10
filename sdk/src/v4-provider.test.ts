import { encodeAbiParameters, encodeEventTopics, zeroAddress, type Hex, type PublicClient } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getV4PoolId } from '@reptilianhq/uniswap-sdk/v4';
import { ponsMemeHookAbi } from './abis.js';
import { robinhoodMainnet as deployment } from './deployments.js';
import { getPonsV4Provider, ponsV4GraduationCapabilities, readPonsV4PoolRegistrations, verifyPonsV4PoolRegistration } from './v4-provider.js';
import { assertCompatibleDeployment } from './compatibility.js';
vi.mock('./compatibility.js', () => ({ assertCompatibleDeployment: vi.fn().mockResolvedValue({}) }));
const token = '0x1111111111111111111111111111111111111111';
const creator = '0x2222222222222222222222222222222222222222';
const key = { currency0: zeroAddress, currency1: token, fee: 10000, tickSpacing: 200, hooks: deployment.contracts.memeHook } as const;
const poolId = getV4PoolId(key);
const hash = `0x${'12'.repeat(32)}` as Hex;
const transactionHash = `0x${'34'.repeat(32)}` as Hex;
function registration() {
  return { chainId: deployment.chainId, address: deployment.contracts.memeHook,
    topics: encodeEventTopics({ abi: ponsMemeHookAbi, eventName: 'PoolRegistered', args: { poolId } }) as Hex[],
    data: encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'address' }], [token, zeroAddress, creator]),
    blockNumber: deployment.startBlock + 1n, blockHash: hash, transactionHash, logIndex: 3, removed: false };
}
function client() {
  return {
    getChainId: vi.fn().mockResolvedValue(deployment.chainId),
    getBlockNumber: vi.fn().mockResolvedValue(deployment.startBlock + 5n),
    getBlock: vi.fn().mockResolvedValue({ hash }),
    getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', transactionHash,
      blockHash: hash, blockNumber: deployment.startBlock + 1n, logs: [registration()] }),
    readContract: vi.fn().mockResolvedValue({ exists: true, curve: creator, token, pairToken: zeroAddress,
      phase: 2, poolFee: 10000, tickSpacing: 200 }),
  };
}
describe('Pons v4 provider membership', () => {
  beforeEach(() => vi.clearAllMocks());
  it('composes complete pool identity with the reviewed hook registration', () => {
    const pool = verifyPonsV4PoolRegistration(deployment, registration(), key);
    expect(pool).toMatchObject({ providerId: 'pons', chainId: 4663, poolManager: deployment.contracts.poolManager,
      poolId, token, quoteToken: zeroAddress, membership: { blockHash: hash, transactionHash, logIndex: 3 } });
    expect(getPonsV4Provider().discovery.address).toBe(deployment.contracts.memeHook);
    expect(ponsV4GraduationCapabilities.withdrawGraduationPrincipal).toBe(false);
    expect(ponsV4GraduationCapabilities.swap.supported).toBe(false);
    expect(Object.isFrozen(ponsV4GraduationCapabilities.swap)).toBe(true);
    expect(Object.isFrozen(ponsV4GraduationCapabilities.manageIndependentPosition)).toBe(true);
    expect(Reflect.set(ponsV4GraduationCapabilities.swap, 'supported', true)).toBe(false);
  });
  it('does not infer membership from a matching hook or unrelated log', () => {
    for (const patch of [{ chainId: 1 }, { address: creator }, { removed: true }, { blockNumber: 0n }, { data: '0x' as Hex }]) {
      expect(() => verifyPonsV4PoolRegistration(deployment, { ...registration(), ...patch }, key)).toThrow();
    }
    expect(() => verifyPonsV4PoolRegistration(deployment, registration(), { ...key, fee: 500 })).toThrow();
  });
  it('rejects altered deployment identity even with a matching hook log', () => {
    for (const name of ['factory', 'poolManager', 'memeHook'] as const) {
      const altered = { ...deployment, contracts: { ...deployment.contracts, [name]: creator } };
      expect(() => verifyPonsV4PoolRegistration(altered, registration(), key)).toThrow();
    }
  });
  it('rejects missing registrations and incompatible launch facts', async () => {
    const missing = client(); missing.getTransactionReceipt.mockResolvedValue({ status: 'success', transactionHash, blockHash: hash, blockNumber: deployment.startBlock + 1n, logs: [] });
    await expect(readPonsV4PoolRegistrations(missing as unknown as PublicClient, transactionHash, { minimumConfirmations: 1n })).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
    const pending = client(); pending.readContract.mockResolvedValue({ exists: true, curve: creator, token, pairToken: zeroAddress, phase: 1, poolFee: 10000, tickSpacing: 200 });
    await expect(readPonsV4PoolRegistrations(pending as unknown as PublicClient, transactionHash, { minimumConfirmations: 1n })).rejects.toMatchObject({ code: 'RECEIPT_FIELD_MISMATCH' });
  });
  it('reads one receipt at one canonical checkpoint and checks deployment compatibility', async () => {
    const rpc = client();
    const pools = await readPonsV4PoolRegistrations(rpc as unknown as PublicClient, transactionHash, { minimumConfirmations: 2n });
    expect(pools).toHaveLength(1);
    expect(assertCompatibleDeployment).toHaveBeenCalledWith(rpc, deployment, { blockNumber: deployment.startBlock + 1n });
    expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({ address: deployment.contracts.factory, blockNumber: deployment.startBlock + 1n }));
  });
  it('rejects chain mismatch, insufficient confirmations, reverted receipts and changing blocks', async () => {
    const wrong = client(); wrong.getChainId.mockResolvedValue(1);
    await expect(readPonsV4PoolRegistrations(wrong as unknown as PublicClient, transactionHash, { minimumConfirmations: 1n })).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' });
    const shallow = client();
    await expect(readPonsV4PoolRegistrations(shallow as unknown as PublicClient, transactionHash, { minimumConfirmations: 10n })).rejects.toMatchObject({ code: 'CHECKPOINT_UNAVAILABLE' });
    const reverted = client(); reverted.getTransactionReceipt.mockResolvedValue({ status: 'reverted' });
    await expect(readPonsV4PoolRegistrations(reverted as unknown as PublicClient, transactionHash, { minimumConfirmations: 1n })).rejects.toMatchObject({ code: 'RECEIPT_REVERTED' });
    const reorg = client(); reorg.getBlock.mockResolvedValueOnce({ hash }).mockResolvedValueOnce({ hash: transactionHash });
    await expect(readPonsV4PoolRegistrations(reorg as unknown as PublicClient, transactionHash, { minimumConfirmations: 1n })).rejects.toMatchObject({ code: 'CHECKPOINT_CHANGED' });
  });
});
