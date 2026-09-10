import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics } from 'viem';
import { ponsFeeEscrowAbi, ponsFactoryAbi, ponsMemeHookAbi } from './abis.js';
import { verifyTokenFeesClaimedReceipt, verifyLaunchReceipt, verifyPoolFeesSweptReceipt, type ReceiptLike, type LogLike } from './receipts.js';

const recipient = '0x1111111111111111111111111111111111111111';
const tokenA = '0x2222222222222222222222222222222222222222';
const tokenB = '0x3333333333333333333333333333333333333333';
const emitter = '0x4444444444444444444444444444444444444444';
const curve = '0x5555555555555555555555555555555555555555';
const claim = (token: typeof tokenA | typeof tokenB, amount = 10n): LogLike => ({
  address: emitter,
  topics: encodeEventTopics({ abi: ponsFeeEscrowAbi, eventName: 'ClaimedToken', args: { recipient, token } }) as LogLike['topics'],
  data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
});
const receipt = (...logs: ReceiptLike['logs']): ReceiptLike => ({ status: 'success', logs });

describe('receipt event selection', () => {
  it('selects the exact token claim regardless of event order', () => {
    for (const logs of [[claim(tokenA), claim(tokenB)], [claim(tokenB), claim(tokenA)]]) {
      expect(verifyTokenFeesClaimedReceipt(receipt(...logs), emitter, { recipient, token: tokenB, amount: 10n }))
        .toEqual({ recipient, token: tokenB, amount: 10n });
    }
  });
  it('rejects ambiguity rather than silently trusting the first event', () => {
    expect(() => verifyTokenFeesClaimedReceipt(receipt(claim(tokenA), claim(tokenB)), emitter, { recipient }))
      .toThrow(expect.objectContaining({ code: 'AMBIGUOUS_EVENT' }));
    expect(() => verifyTokenFeesClaimedReceipt(receipt(claim(tokenB), claim(tokenB)), emitter, { recipient, token: tokenB }))
      .toThrow(expect.objectContaining({ code: 'AMBIGUOUS_EVENT' }));
  });
  it('keeps mismatch, malformed-log, emitter and reverted-receipt checks', () => {
    expect(() => verifyTokenFeesClaimedReceipt(receipt(claim(tokenA), claim(tokenB)), emitter, { amount: 11n }))
      .toThrow(expect.objectContaining({ code: 'RECEIPT_FIELD_MISMATCH' }));
    const invalid = { ...claim(tokenB), data: '0x' as const };
    const foreign: LogLike = { ...claim(tokenB), address: curve };
    expect(verifyTokenFeesClaimedReceipt(receipt(invalid, foreign, claim(tokenB)), emitter, { token: tokenB }).amount).toBe(10n);
    expect(() => verifyTokenFeesClaimedReceipt({ ...receipt(claim(tokenB)), status: 'reverted' }, emitter, { token: tokenB }))
      .toThrow(expect.objectContaining({ code: 'RECEIPT_REVERTED' }));
  });
  it('selects a later launch by token within a batched factory receipt', () => {
    const launch = (token: typeof tokenA | typeof tokenB): LogLike => ({ address: emitter,
      topics: encodeEventTopics({ abi: ponsFactoryAbi, eventName: 'TokenLaunched', args: { token, curve, deployer: recipient } }) as LogLike['topics'],
      data: encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }], [tokenA, 2n, 5_000_000n]),
    });
    expect(verifyLaunchReceipt(receipt(launch(tokenA), launch(tokenB)), emitter, { expected: { token: tokenB } }).launch.token).toBe(tokenB);
  });
  it('uses expected pool identifiers for shared hook sweep receipts', () => {
    const poolA = `0x${'11'.repeat(32)}` as const;
    const poolB = `0x${'22'.repeat(32)}` as const;
    const sweep = (poolId: typeof poolA): LogLike => ({ address: emitter,
      topics: encodeEventTopics({ abi: ponsMemeHookAbi, eventName: 'PoolFeesSwept', args: { poolId } }) as LogLike['topics'],
      data: encodeAbiParameters(Array.from({ length: 4 }, () => ({ type: 'uint256' })), [1n, 2n, 3n, 4n]),
    });
    expect(verifyPoolFeesSweptReceipt(receipt(sweep(poolA), sweep(poolB)), emitter, { poolId: poolB }).poolId).toBe(poolB);
  });
});
