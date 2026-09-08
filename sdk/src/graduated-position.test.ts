import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { PublicClient, Address } from 'viem';
import { keccak256, zeroAddress } from 'viem';
import { derivePonsGraduatedPoolId, robinhoodMainnet, readGraduatedPosition, PonsSdkError } from './index.js';

const TOKEN = '0x1111111111111111111111111111111111111111';
const QUOTE = '0x2222222222222222222222222222222222222222';
const BLOCK = 30_000_000n;
const HASH = `0x${'ab'.repeat(32)}`;
const CODE = '0x1234';
const deployment = { ...robinhoodMainnet,
  factoryRuntimeCodeHash: keccak256(CODE), forwarderRuntimeCodeHash: keccak256(CODE),
  memeHookRuntimeCodeHash: keccak256(CODE), feeEscrowRuntimeCodeHash: keccak256(CODE),
  buybackVaultRuntimeCodeHash: keccak256(CODE),
};
function fixture(overrides: Record<string, any> = {}) {
  const calls: any[] = [];
  const pairToken = overrides.pairToken ?? QUOTE;
  const currencies = [TOKEN, pairToken].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  const poolId = derivePonsGraduatedPoolId({ token: TOKEN, pairToken: pairToken as Address, poolFee: 3000,
    tickSpacing: 60, memeHook: deployment.contracts.memeHook });
  const info = (BigInt(poolId) >> 56n << 56n)
    | (BigInt.asUintN(24, -887220n) << 8n) | (887220n << 32n);
  const key = { currency0: currencies[0], currency1: currencies[1], fee: 3000,
    tickSpacing: 60, hooks: deployment.contracts.memeHook, ...overrides.key };
  let blockReads = 0;
  const client = {
    async getChainId() { return overrides.chainId ?? deployment.chainId; },
    async getBlock({ blockNumber }: { blockNumber: bigint }) {
      assert.equal(blockNumber, BLOCK);
      blockReads++;
      return { hash: overrides.reorg && blockReads > 1 ? `0x${'cd'.repeat(32)}` : HASH };
    },
    async getBytecode({ blockNumber }: { blockNumber: bigint }) {
      assert.equal(blockNumber, BLOCK);
      return CODE;
    },
    async readContract(call: any) {
      calls.push(call);
      assert.equal(call.blockNumber, BLOCK, 'every contract read must use the explicit checkpoint');
      const { functionName, address } = call;
      if (overrides.fail === functionName) throw new Error('RPC unavailable https://provider/SECRET');
      if (functionName === 'factory') return deployment.contracts.factory;
      if (functionName === 'launchForwarder') return deployment.contracts.forwarder;
      if (functionName in deployment.contracts) {
        if (functionName === 'positionManager' && address === deployment.contracts.locker && overrides.wrongLockerManager) return TOKEN;
        return deployment.contracts[functionName as keyof typeof deployment.contracts];
      }
      switch (functionName) {
        case 'getLaunchedToken': return { token: TOKEN, exists: true, curve: TOKEN,
          pairToken, phase: overrides.phase ?? 2, poolFee: 3000, tickSpacing: 60 };
        case 'isLocked': return overrides.locked ?? true;
        case 'lockedPositions': return overrides.positionId ?? 42n;
        case 'ownerOf': return overrides.owner ?? deployment.contracts.locker;
        case 'getPositionLiquidity': return 100000000000000000000000000000n;
        case 'getPoolAndPositionInfo': return [key, overrides.info ?? info];
        default: throw new Error(`Unexpected read ${functionName}`);
      }
    },
  };
  return { client, calls, poolId };
}
const observe = (client: object) => readGraduatedPosition(client as PublicClient, deployment, TOKEN, { blockNumber: BLOCK });

test('returns exact custody and pool facts without portfolio policy', async () => {
  const { client, calls, poolId } = fixture();
  const result = await observe(client);
  assert.equal(result.status, 'observed');
  assert.ok(result.position);
  assert.equal(result.blockHash, HASH);
  assert.equal(result.position.poolId, poolId);
  assert.equal(result.position.owner, deployment.contracts.locker);
  assert.ok(!('includedInWalletValue' in result.position));
  assert.equal(result.blockNumber, BLOCK);
  assert.equal(result.position.liquidity, 100000000000000000000000000000n);
  assert.equal(result.position.tickLower, -887220);
  assert.equal(result.position.tickUpper, 887220);
  assert.ok(calls.some(call => call.functionName === 'ownerOf'));
});

test('supports native quote currency and token ID zero when isLocked is true', async () => {
  const { client } = fixture({ pairToken: zeroAddress, positionId: 0n });
  const result = await observe(client);
  assert.ok(result.position);
  assert.equal(result.position.poolKey.currency0, zeroAddress);
  assert.equal(result.position.tokenId, 0n);
});

for (const [name, overrides, message] of [
  ['wrong owner', { owner: TOKEN }, /not held/],
  ['missing lock', { locked: false }, /not registered/],
  ['different manager', { wrongLockerManager: true }, /not wired/],
  ['different currency', { key: { currency0: QUOTE } }, /pool key differs/],
  ['different hook', { key: { hooks: TOKEN } }, /pool key differs/],
  ['different fee', { key: { fee: 500 } }, /pool key differs/],
  ['different packed pool', { info: (BigInt.asUintN(24, -60n) << 8n) | (60n << 32n) }, /Packed position pool ID/],
  ['reorg', { reorg: true }, /reorganized/],
] as const) {
  test(`fails explicitly for ${name}`, async () => {
    await assert.rejects(observe(fixture(overrides).client), error =>
      error instanceof PonsSdkError && message.test(error.message));
  });
}

for (const phase of [0, 1, 3] as const) {
  test(`does not invent a position before creation or after rescue (phase ${phase})`, async () => {
    const { client, calls } = fixture({ phase });
    const result = await observe(client);
    assert.equal(result.status, 'no_graduated_position');
    assert.equal(result.position, null);
    assert.ok(!calls.some(call => call.functionName === 'ownerOf'));
  });
}

test('does not turn an RPC failure or wrong chain into a zero position', async () => {
  await assert.rejects(observe(fixture({ fail: 'ownerOf' }).client), /RPC unavailable/);
  await assert.rejects(observe(fixture({ chainId: 1 }).client), /chainId is incompatible/);
});

test('requires a valid checkpoint and rejects invalid packed ticks', async () => {
  await assert.rejects(readGraduatedPosition(fixture().client as unknown as PublicClient, deployment, TOKEN,
    { blockNumber: 0n }), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(observe(fixture({ info: 0n }).client), /tick range is invalid/);
});
