import { describe, expect, it, vi } from 'vitest';
import { zeroAddress, type PublicClient } from 'viem';
import { launchExemptionCapacity } from './transactions.js';
import { predictLaunchAddresses, type readLaunchTermsForPair } from './reads.js';
import { robinhoodMainnet } from './deployments.js';
const launcher = '0x0000000000000000000000000000000000000001';
const digest = `0x${'11'.repeat(32)}` as const;
const token = { name: 'Token', symbol: 'TKN', salt: digest, expectedEconomics: digest, creatorTaxBps: 10 };
const terms = { blockNumber: 123n, pairToken: zeroAddress, expectedEconomics: digest,
  phantomQuote: 100n, graduationThreshold: 200n,
  config: { supply: 1000n, curveFeeBps: 50n } } as Awaited<ReturnType<typeof readLaunchTermsForPair>>;
describe('launch boundary', () => {
  it('reserves protocol capacity without consumers copying limits', () => {
    expect(launchExemptionCapacity(false)).toBe(32);
    expect(launchExemptionCapacity(true)).toBe(31);
    expect(launchExemptionCapacity(true, 1)).toBe(30);
    for (const reserved of [-1, 0.5, NaN, 33, Infinity]) expect(() => launchExemptionCapacity(false, reserved)).toThrow();
    expect(() => launchExemptionCapacity(true, 32)).toThrow();
    expect(() => launchExemptionCapacity('yes' as never)).toThrow();
  });
  it('binds prediction to the selected block, deployment, economics and initiating wallet', async () => {
    const policy = { protocolFeeRecipient: launcher, protocolFeeShareBps: 100, buybackBurnBps: 0, hookFeeBps: 0, maxInternalPriceImpactBps: 0 };
    const readContract = vi.fn().mockResolvedValueOnce(policy).mockResolvedValueOnce([launcher, zeroAddress]);
    expect(await predictLaunchAddresses({ readContract } as unknown as PublicClient, robinhoodMainnet,
      { launcher, token, terms })).toEqual([launcher, zeroAddress]);
    expect(readContract.mock.calls[0][0]).toMatchObject({ address: robinhoodMainnet.contracts.memeHook, functionName: 'currentFeePolicy', blockNumber: 123n });
    expect(readContract.mock.calls[1][0]).toMatchObject({ address: robinhoodMainnet.contracts.launchDeployer, functionName: 'predictLaunchAddresses', blockNumber: 123n,
      args: [{ originalDeployer: launcher, creatorFeeRecipient: launcher, policy, pairToken: zeroAddress, phantomQuote: 100n, graduationThreshold: 200n, supply: 1000n, creatorTaxBps: 10n }] });
  });
  it('rejects stale economics before any read', async () => {
    const readContract = vi.fn();
    await expect(predictLaunchAddresses({ readContract } as unknown as PublicClient, robinhoodMainnet,
      { launcher, token, terms: { ...terms, expectedEconomics: `0x${'22'.repeat(32)}` } })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(readContract).not.toHaveBeenCalled();
  });
});
