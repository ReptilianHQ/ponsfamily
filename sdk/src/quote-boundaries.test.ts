import { describe, expect, it, vi } from 'vitest';
import { zeroAddress, type PublicClient } from 'viem';
import { robinhoodMainnet } from './deployments.js';
import { readCurveSnapshot, readCurveState, readLaunchLifecycleState, readLaunchTermsForPair } from './reads.js';

const token = '0x1111111111111111111111111111111111111111';
const quote = '0x2222222222222222222222222222222222222222';
const curve = '0x3333333333333333333333333333333333333333';
const digest = `0x${'12'.repeat(32)}`;
const config = { supply: 10n ** 24n, curveFeeBps: 100, phantomQuote: 10n ** 18n,
  graduationThreshold: 5n * 10n ** 18n, poolFee: 10000, tickSpacing: 200, enabled: true };

function pairClient(decimals = 6, approved = true) {
  const readContract = vi.fn(async ({ functionName, blockNumber, args }: { functionName: string; blockNumber?: bigint; args?: unknown[] }) => {
    expect(blockNumber).toBe(123n);
    if (functionName === 'getLaunchConfig') { expect(args).toEqual([2n]); return config; }
    if (functionName === 'previewLaunchEconomics') { expect(args?.[0]).toBe(2n); return digest; }
    if (functionName === 'pairTokenEconomics') { expect(args).toEqual([quote]); return [1_000_000n, 5_000_000n, 6]; }
    if (functionName === 'decimals') return decimals;
    if (functionName === 'approvedPairTokens') return approved;
    if (functionName === 'canLaunch') { expect(args).toEqual([token]); return false; }
    if (functionName === 'launchEnabled') return true;
    return 100n;
  });
  return { client: { getBlockNumber: vi.fn().mockResolvedValue(123n), readContract } as unknown as PublicClient, readContract };
}

describe('pair-specific launch terms', () => {
  it('uses ERC20 economics rather than the native configuration, at one block', async () => {
    const { client, readContract } = pairClient();
    const terms = await readLaunchTermsForPair(client, robinhoodMainnet, { launchConfigId: 2n, pairToken: quote, launcher: token });
    expect(terms).toMatchObject({ blockNumber: 123n, quoteDecimals: 6, approved: true, canLaunch: false,
      phantomQuote: 1_000_000n, graduationThreshold: 5_000_000n, expectedEconomics: digest, config });
    expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: 'launchConfigCount' }));
  });
  it('preserves native config economics without any ERC20 metadata read', async () => {
    const { client, readContract } = pairClient();
    const terms = await readLaunchTermsForPair(client, robinhoodMainnet, { launchConfigId: 2n, pairToken: zeroAddress }, { blockNumber: 123n });
    expect(terms).toMatchObject({ quoteDecimals: 18, approved: true, phantomQuote: config.phantomQuote,
      graduationThreshold: config.graduationThreshold, canLaunch: undefined });
    expect(client.getBlockNumber).not.toHaveBeenCalled();
    for (const functionName of ['decimals', 'pairTokenEconomics', 'approvedPairTokens', 'canLaunch']) {
      expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName }));
    }
  });
  it('exposes disabled approval and rejects changed quote decimals', async () => {
    const { client } = pairClient(6, false);
    expect((await readLaunchTermsForPair(client, robinhoodMainnet, { launchConfigId: 2n, pairToken: quote })).approved).toBe(false);
    await expect(readLaunchTermsForPair(pairClient(18).client, robinhoodMainnet, { launchConfigId: 2n, pairToken: quote }))
      .rejects.toMatchObject({ code: 'POINTER_MISMATCH', path: 'pairTokenEconomics.decimals' });
  });
  it('propagates RPC failures and rejects negative config IDs before reads', async () => {
    const { client, readContract } = pairClient();
    await expect(readLaunchTermsForPair(client, robinhoodMainnet, { launchConfigId: -1n, pairToken: quote }))
      .rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(readContract).not.toHaveBeenCalled();
    readContract.mockRejectedValue(new Error('RPC unavailable'));
    await expect(readLaunchTermsForPair(client, robinhoodMainnet, { launchConfigId: 2n, pairToken: quote }))
      .rejects.toThrow('RPC unavailable');
  });
});

function stateClient(failMetadata: boolean) {
  const readContract = vi.fn(async ({ functionName, blockNumber }: { functionName: string; blockNumber?: bigint }) => {
    expect(blockNumber).toBe(123n);
    if (functionName === 'decimals') { if (failMetadata) throw new Error('metadata unavailable'); return 6; }
    const values: Record<string, unknown> = {
      getLaunchedToken: { token, curve, pairToken: quote, exists: true, phase: 0, graduationThreshold: 5_000_000n },
      token, pairToken: quote, feeBps: 100n, creatorTaxBps: 0n, graduationThreshold: 5_000_000n,
      sellableTokens: 100n, getReserves: [1_000_000n, 200n], realQuoteReserve: 1_000_000n,
      readyToGraduate: false, graduated: false,
    };
    if (!(functionName in values)) throw new Error(`unexpected read ${functionName}`);
    return values[functionName];
  });
  return { client: { getBlockNumber: vi.fn().mockResolvedValue(123n), readContract } as unknown as PublicClient, readContract };
}

describe('metadata-independent state', () => {
  it('reads raw lifecycle and reserves without consulting failed metadata', async () => {
    const { client, readContract } = stateClient(true);
    const lifecycle = await readLaunchLifecycleState(client, robinhoodMainnet, token);
    expect(lifecycle).toMatchObject({ blockNumber: 123n, pairToken: quote, graduationProgressBps: 2000n,
      snapshot: { quoteReserve: 1_000_000n, realQuoteReserve: 1_000_000n, tokenReserve: 200n } });
    expect(lifecycle.snapshot).not.toHaveProperty('quoteDecimals');
    expect(readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: 'decimals' }));
    await expect(readCurveSnapshot(client, curve)).rejects.toThrow('metadata unavailable');
  });
  it('preserves six-decimal strict snapshots and propagates raw-state failures', async () => {
    const { client, readContract } = stateClient(false);
    expect(await readCurveSnapshot(client, curve)).toMatchObject({ quoteDecimals: 6, quoteReserve: 1_000_000n });
    readContract.mockRejectedValue(new Error('reserves unavailable'));
    await expect(readCurveState(client, curve)).rejects.toThrow('reserves unavailable');
  });
});
