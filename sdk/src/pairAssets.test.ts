import { describe, expect, it, vi } from 'vitest';
import type { PublicClient } from 'viem';
import { readPairAsset, readPairTokenCandidates } from './pairAssets.js';
import { robinhoodMainnet } from './deployments.js';
import { MAX_UINT256, quoteOpeningBuy, quoteCurveBuyExecution } from './math.js';
const asset = '0x0000000000000000000000000000000000000005';

describe('live pair assets', () => {
  it('deduplicates approval/revocation events across inclusive chunks', async () => {
    const getLogs = vi.fn().mockResolvedValue([{ args: { pairToken: asset, approved: true } }, { args: { pairToken: asset, approved: false } }]);
    expect(await readPairTokenCandidates({ getLogs } as unknown as PublicClient, robinhoodMainnet, 10n, 1_000_010n)).toEqual([asset]);
    expect(getLogs.mock.calls.map(([input]) => [input.fromBlock, input.toBlock])).toEqual([[10n, 1_000_009n], [1_000_010n, 1_000_010n]]);
  });
  it('does not fan out transport errors into a historical scan', async () => {
    const getLogs = vi.fn().mockRejectedValue(new Error('connection unavailable'));
    await expect(readPairTokenCandidates({ getLogs } as unknown as PublicClient, robinhoodMainnet, 0n, 1_000_000n)).rejects.toThrow('connection unavailable');
    expect(getLogs).toHaveBeenCalledTimes(1);
  });
  it('does not split rate limits into more requests', async () => {
    const getLogs = vi.fn().mockRejectedValue(new Error('429 Too many requests: rate limit exceeded'));
    await expect(readPairTokenCandidates({ getLogs } as unknown as PublicClient, robinhoodMainnet, 0n, 1_000_000n)).rejects.toThrow('429');
    expect(getLogs).toHaveBeenCalledTimes(1);
  });
  it('rejects launch economics with zero reserved tokens or overflowing denominator', () => {
    const input = { amountIn: 1n, supply: 100n, phantomQuote: 1n, graduationThreshold: 1000n, feeBps: 0n, creatorTaxBps: 0n };
    expect(() => quoteOpeningBuy(input)).toThrow('reservedTokens');
    expect(() => quoteOpeningBuy({ ...input, phantomQuote: MAX_UINT256 })).toThrow();
  });
  it('removes revoked assets without trusting historical approvals', async () => {
    const readContract = vi.fn().mockResolvedValue(false);
    expect(await readPairAsset({ readContract } as unknown as PublicClient, robinhoodMainnet, asset, 200n)).toBeNull();
    expect(readContract).toHaveBeenCalledTimes(1);
  });
  it('pins metadata and economics to one block and rejects decimal mismatches', async () => {
    const readContract = vi.fn(async ({ functionName, blockNumber }) => {
      expect(blockNumber).toBe(200n);
      return { approvedPairTokens: true, pairTokenEconomics: [100n, 420n, 6], decimals: 18, symbol: 'STOCK', name: 'Stock token' }[functionName as string];
    });
    await expect(readPairAsset({ readContract } as unknown as PublicClient, robinhoodMainnet, asset, 200n)).rejects.toThrow('decimals');
  });
  it('quotes an opening buy with the reserved allocation and actual refund', () => {
    const input = { amountIn: 10_000n, supply: 1_000_000n, phantomQuote: 100n, graduationThreshold: 400n, feeBps: 100n, creatorTaxBps: 100n };
    const result = quoteOpeningBuy(input);
    expect(result).toEqual(quoteCurveBuyExecution({ ...input, quoteReserve: 100n, tokenReserve: 1_000_000n, sellableTokens: 800_000n }));
    expect(result.partialFill).toBe(true);
    expect(result.quoteSpent + result.quoteRefund).toBe(input.amountIn);
  });
});
