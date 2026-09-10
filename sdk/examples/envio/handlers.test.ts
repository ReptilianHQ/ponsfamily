import { describe, expect, it, vi } from 'vitest';
import { ponsIndexingCatalog } from '../../src/indexing.js';
import { normalizedEvent } from './src/eventLog.js';

const { handlers, registrations } = vi.hoisted(() => ({
  handlers: new Map<string, (args: any) => Promise<void>>(),
  registrations: new Map<string, (args: any) => Promise<void>>(),
}));
vi.mock('envio', () => ({ indexer: {
  onEvent: ({ contract, event }: { contract: string; event: string }, handler: any) => handlers.set(`${contract}.${event}`, handler),
  contractRegister: ({ contract, event }: { contract: string; event: string }, handler: any) => registrations.set(`${contract}.${event}`, handler),
} }));
import './src/EventHandlers.js';

const token = '0xabcdef0000000000000000000000000000000001';
const curve = '0xabcdef0000000000000000000000000000000002';
const zero = '0x0000000000000000000000000000000000000000';
function event(params: object = {}, overrides: object = {}) {
  return { chainId: 4663, srcAddress: token.toUpperCase(), logIndex: 2, params,
    block: { number: 10, hash: '0xAABB', timestamp: 100 }, transaction: { hash: '0xCCDD', transactionIndex: 1 }, ...overrides };
}
function store() {
  const rows = new Map<string, any>();
  return { rows, get: async (id: string) => rows.get(id), set: (row: any) => rows.set(row.id, row) };
}
function context() { return { PonsLaunch: store(), PonsPool: store(), PonsProtocolEvent: store() }; }
const run = (name: string, input: any, ctx: any) => handlers.get(name)!({ event: input, context: ctx });
const launch = () => event({ token, curve, deployer: token, pairToken: curve, launchConfigId: 1n, graduationThreshold: 200n });
const mint = (value = 10n ** 30n) => event({ from: zero, to: curve, value }, { logIndex: 0 });

describe('generated Pons handlers', () => {
  it('registers exactly one handler per catalog event, including the forwarder', () => {
    expect([...handlers.keys()].sort()).toEqual(ponsIndexingCatalog.map(e => `${e.contract}.${e.name}`).sort());
  });
  it('retains every provenance field and lossless signed payloads with idempotent identity', () => {
    const input = event({ unsigned: 2n ** 255n, signed: -(2n ** 120n), nested: [1n] });
    const record = normalizedEvent(input, 'UniswapV4PoolManager', 'Swap', 'Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)');
    expect(record).toMatchObject({ id: '4663:0xaabb:2', chainId: 4663n, blockHash: '0xaabb', blockNumber: 10n, blockTimestamp: 100n, transactionHash: '0xccdd', transactionIndex: 1n, logIndex: 2n, sourceAddress: token });
    expect(JSON.parse(record.payload)).toEqual({ unsigned: (2n ** 255n).toString(), signed: (-(2n ** 120n)).toString(), nested: ['1'] });
    expect(normalizedEvent(input, 'x', 'y', 'z').id).toBe(record.id);
    expect(normalizedEvent({ ...input, chainId: 1 }, 'x', 'y', 'z').id).not.toBe(record.id);
    expect(normalizedEvent({ ...input, block: { ...input.block, hash: '0xFFFF' } }, 'x', 'y', 'z').id).not.toBe(record.id);
  });
  it.each([true, false])('preserves partial launch and mint evidence in either order: mintFirst=%s', async mintFirst => {
    const ctx = context();
    const steps = [() => run('PonsLaunchToken.Transfer', mint(), ctx), () => run('PonsV2Factory.TokenLaunched', launch(), ctx)];
    if (!mintFirst) steps.reverse();
    for (const step of steps) await step();
    for (const step of steps) await step();
    expect(ctx.PonsLaunch.rows.size).toBe(1);
    expect(ctx.PonsProtocolEvent.rows.size).toBe(2);
    expect(ctx.PonsLaunch.rows.get(`4663:${token}`)).toMatchObject({ token, curve, canonicalSupply: 10n ** 30n, launchConfigId: 1n, createdBlock: 10n, supplyMintBlock: 10n });
  });
  it('ignores normal transfers for supply and rejects conflicting mint evidence', async () => {
    const ctx = context();
    await run('PonsLaunchToken.Transfer', event({ from: curve, to: token, value: 9n }), ctx);
    expect(ctx.PonsLaunch.rows.size).toBe(0);
    await run('PonsLaunchToken.Transfer', mint(), ctx);
    await expect(run('PonsLaunchToken.Transfer', mint(1n), ctx)).rejects.toThrow('Conflicting PonsLaunch.canonicalSupply');
  });
  it('registers the token and curve in the discovery phase, before ordinary event processing', async () => {
    const addCurve = vi.fn(), addToken = vi.fn();
    await registrations.get('PonsV2Factory.TokenLaunched')!({ event: launch(), context: { chain: { PonsV2Curve: { add: addCurve }, PonsLaunchToken: { add: addToken } } } });
    expect(addCurve).toHaveBeenCalledWith(curve);
    expect(addToken).toHaveBeenCalledWith(token);
  });
  it('filters unknown pools, accepts registered pools, and isolates chains', async () => {
    const ctx = context();
    const swap = event({ id: '0xAA', amount0: -20n, amount1: 10n });
    await run('UniswapV4PoolManager.Swap', swap, ctx);
    expect(ctx.PonsProtocolEvent.rows.size).toBe(0);
    await run('PonsV2MemeHook.PoolRegistered', event({ poolId: '0xaa', memecoin: token, quoteToken: curve, creator: curve }, { logIndex: 1 }), ctx);
    await run('UniswapV4PoolManager.Swap', swap, ctx);
    expect(ctx.PonsProtocolEvent.rows.size).toBe(2);
    await run('UniswapV4PoolManager.Swap', { ...swap, chainId: 1 }, ctx);
    expect(ctx.PonsProtocolEvent.rows.size).toBe(2);
  });
});
