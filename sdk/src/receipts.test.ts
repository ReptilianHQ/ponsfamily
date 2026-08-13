import { encodeAbiParameters, encodeEventTopics, getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { ponsBuybackVaultAbi, ponsCurveAbi, ponsFactoryAbi, ponsFeeEscrowAbi, ponsMemeHookAbi } from "./abis.js";
import {
  assertConfirmedTransaction,
  assertSuccessfulReceipt,
  verifyBuybackLockedReceipt,
  verifyBuybackEnabledUpdatedReceipt,
  verifyBuybackReleasedReceipt,
  verifyCreatorFeeRecipientUpdatedReceipt,
  verifyCurveBuyReceipt,
  verifyCurveSellReceipt,
  verifyFeesSweptReceipt,
  verifyLaunchSweptReceipt,
  verifyNativeFeesClaimedReceipt,
  verifyPoolFeesSweptReceipt,
  verifyPoolGraduatedReceipt,
  verifyTokenFeesClaimedReceipt,
  type ReceiptLike,
} from "./receipts.js";

const curve = getAddress("0x2222222222222222222222222222222222222222");
const factory = getAddress("0x3333333333333333333333333333333333333333");
const account = getAddress("0x1111111111111111111111111111111111111111");

describe("receipt verification", () => {
  it("accepts a final-buy partial fill using the contract price bound", () => {
    const receipt: ReceiptLike = {
      status: "success",
      logs: [{
        address: curve,
        topics: encodeEventTopics({
          abi: ponsCurveAbi,
          eventName: "CurveBuy",
          args: { buyer: account, recipient: account },
        }),
        data: encodeAbiParameters(
          [
            { name: "quoteIn", type: "uint256" },
            { name: "tokensOut", type: "uint256" },
            { name: "fee", type: "uint256" },
            { name: "tax", type: "uint256" },
          ],
          [50n, 101n, 1n, 1n],
        ),
      }],
    };
    expect(verifyCurveBuyReceipt(receipt, curve, {
      buyer: account,
      recipient: account,
      minTokensOut: 200n,
      quoteOffered: 100n,
    }).tokensOut).toBe(101n);
  });

  it("rejects final-buy evidence that spends more than the offered quote", () => {
    const receipt: ReceiptLike = {
      status: "success",
      logs: [{
        address: curve,
        topics: encodeEventTopics({
          abi: ponsCurveAbi,
          eventName: "CurveBuy",
          args: { buyer: account, recipient: account },
        }),
        data: encodeAbiParameters(
          [
            { name: "quoteIn", type: "uint256" },
            { name: "tokensOut", type: "uint256" },
            { name: "fee", type: "uint256" },
            { name: "tax", type: "uint256" },
          ],
          [101n, 203n, 1n, 1n],
        ),
      }],
    };
    expect(() => verifyCurveBuyReceipt(receipt, curve, {
      buyer: account,
      recipient: account,
      minTokensOut: 200n,
      quoteOffered: 100n,
    })).toThrow(/quoteIn mismatch/);
  });

  it("decodes creator-recipient management evidence", () => {
    const token = getAddress("0x4444444444444444444444444444444444444444");
    const next = getAddress("0x5555555555555555555555555555555555555555");
    const receipt: ReceiptLike = {
      status: "success",
      logs: [{
        address: factory,
        topics: encodeEventTopics({
          abi: ponsFactoryAbi,
          eventName: "CreatorFeeRecipientUpdated",
          args: { token, previousRecipient: account, newRecipient: next },
        }),
        data: "0x",
      }],
    };
    expect(verifyCreatorFeeRecipientUpdatedReceipt(receipt, factory, {
      token,
      previousRecipient: account,
      newRecipient: next,
    })).toEqual({ token, previousRecipient: account, newRecipient: next });
  });

  it("rejects reverted receipts, missing events, and violated buy price bounds", () => {
    expect(() => assertSuccessfulReceipt({ status: "reverted", logs: [] })).toThrow(/reverted/);
    expect(() => verifyCurveBuyReceipt({ status: "success", logs: [] }, curve)).toThrow(/CurveBuy/);

    const receipt: ReceiptLike = {
      status: "success",
      logs: [{
        address: curve,
        topics: encodeEventTopics({
          abi: ponsCurveAbi,
          eventName: "CurveBuy",
          args: { buyer: account, recipient: account },
        }),
        data: encodeAbiParameters(
          [
            { name: "quoteIn", type: "uint256" },
            { name: "tokensOut", type: "uint256" },
            { name: "fee", type: "uint256" },
            { name: "tax", type: "uint256" },
          ],
          [60n, 100n, 1n, 1n],
        ),
      }],
    };
    expect(() => verifyCurveBuyReceipt(receipt, curve, { minTokensOut: 200n, quoteOffered: 100n })).toThrow(/price bound/);
  });

  it("verifies the mined transaction target, sender, value, and calldata", () => {
    const request = { to: curve, value: 7n, data: "0x1234" as const };
    const transaction = { from: account, to: curve, value: 7n, input: "0x1234" as const };
    expect(() => assertConfirmedTransaction(transaction, request, account)).not.toThrow();
    expect(() => assertConfirmedTransaction({ ...transaction, value: 8n }, request, account)).toThrow(/value mismatch/);
    expect(() => assertConfirmedTransaction({ ...transaction, input: "0xabcd" }, request, account)).toThrow(/input mismatch/);
  });

  it("decodes curve sell and fee sweep evidence", () => {
    const sellReceipt: ReceiptLike = {
      status: "success",
      logs: [{
        address: curve,
        topics: encodeEventTopics({ abi: ponsCurveAbi, eventName: "CurveSell", args: { seller: account, recipient: account } }),
        data: encodeAbiParameters(
          [
            { name: "tokensIn", type: "uint256" },
            { name: "quoteOut", type: "uint256" },
            { name: "fee", type: "uint256" },
            { name: "tax", type: "uint256" },
          ],
          [100n, 90n, 5n, 5n],
        ),
      }],
    };
    expect(verifyCurveSellReceipt(sellReceipt, curve, { seller: account, minQuoteOut: 90n })).toMatchObject({ tokensIn: 100n, quoteOut: 90n });

    const sweepReceipt: ReceiptLike = {
      status: "success",
      logs: [{
        address: curve,
        topics: encodeEventTopics({ abi: ponsCurveAbi, eventName: "FeesSwept" }),
        data: encodeAbiParameters(
          [
            { name: "protocolAmount", type: "uint256" },
            { name: "buybackAmount", type: "uint256" },
            { name: "creatorAmount", type: "uint256" },
          ],
          [10n, 20n, 30n],
        ),
      }],
    };
    expect(verifyFeesSweptReceipt(sweepReceipt, curve)).toEqual({ protocolAmount: 10n, buybackAmount: 20n, creatorAmount: 30n });

    const buybackReceipt: ReceiptLike = {
      status: "success",
      logs: [{
        address: curve,
        topics: encodeEventTopics({ abi: ponsCurveAbi, eventName: "BuybackLocked" }),
        data: encodeAbiParameters(
          [{ name: "quoteSpent", type: "uint256" }, { name: "tokensLocked", type: "uint256" }],
          [40n, 50n],
        ),
      }],
    };
    expect(verifyBuybackLockedReceipt(buybackReceipt, curve, { quoteSpent: 40n })).toEqual({
      quoteSpent: 40n,
      tokensLocked: 50n,
    });
  });

  it("decodes factory lifecycle and management evidence", () => {
    const token = getAddress("0x4444444444444444444444444444444444444444");
    const lifecycleReceipt: ReceiptLike = {
      status: "success",
      logs: [
        {
          address: factory,
          topics: encodeEventTopics({ abi: ponsFactoryAbi, eventName: "LaunchSwept", args: { token } }),
          data: encodeAbiParameters(
            [{ name: "quoteOut", type: "uint256" }, { name: "tokenOut", type: "uint256" }],
            [40n, 50n],
          ),
        },
        {
          address: factory,
          topics: encodeEventTopics({ abi: ponsFactoryAbi, eventName: "PoolGraduated", args: { token } }),
          data: encodeAbiParameters(
            [
              { name: "positionId", type: "uint256" },
              { name: "tokenAmount", type: "uint256" },
              { name: "pairTokenAmount", type: "uint256" },
            ],
            [60n, 70n, 80n],
          ),
        },
        {
          address: factory,
          topics: encodeEventTopics({ abi: ponsFactoryAbi, eventName: "BuybackEnabledUpdated", args: { token, controller: account } }),
          data: encodeAbiParameters([{ name: "enabled", type: "bool" }], [true]),
        },
      ],
    };

    expect(verifyLaunchSweptReceipt(lifecycleReceipt, factory, { token })).toEqual({ token, quoteOut: 40n, tokenOut: 50n });
    expect(verifyPoolGraduatedReceipt(lifecycleReceipt, factory, { token })).toEqual({ token, positionId: 60n, tokenAmount: 70n, pairTokenAmount: 80n });
    expect(verifyBuybackEnabledUpdatedReceipt(lifecycleReceipt, factory, { token, controller: account, enabled: true })).toEqual({ token, enabled: true, controller: account });
  });

  it("decodes graduated fee, escrow claim, and buyback release evidence", () => {
    const poolId = `0x${"12".repeat(32)}` as const;
    const token = getAddress("0x4444444444444444444444444444444444444444");
    const hook = getAddress("0x5555555555555555555555555555555555555555");
    const escrow = getAddress("0x6666666666666666666666666666666666666666");
    const vault = getAddress("0x7777777777777777777777777777777777777777");
    const receipt: ReceiptLike = { status: "success", logs: [
      {
        address: hook,
        topics: encodeEventTopics({ abi: ponsMemeHookAbi, eventName: "PoolFeesSwept", args: { poolId } }),
        data: encodeAbiParameters([
          { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" },
        ], [1n, 2n, 3n, 4n]),
      },
      {
        address: escrow,
        topics: encodeEventTopics({ abi: ponsFeeEscrowAbi, eventName: "Claimed", args: { recipient: account } }),
        data: encodeAbiParameters([{ type: "uint256" }], [5n]),
      },
      {
        address: escrow,
        topics: encodeEventTopics({ abi: ponsFeeEscrowAbi, eventName: "ClaimedToken", args: { recipient: account, token } }),
        data: encodeAbiParameters([{ type: "uint256" }], [6n]),
      },
      {
        address: vault,
        topics: encodeEventTopics({ abi: ponsBuybackVaultAbi, eventName: "Released", args: { token } }),
        data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [7n, 8n]),
      },
    ] };
    expect(verifyPoolFeesSweptReceipt(receipt, hook, { poolId })).toMatchObject({ tokensLocked: 4n });
    expect(verifyNativeFeesClaimedReceipt(receipt, escrow, { recipient: account })).toEqual({ recipient: account, amount: 5n });
    expect(verifyTokenFeesClaimedReceipt(receipt, escrow, { recipient: account, token })).toEqual({ recipient: account, token, amount: 6n });
    expect(verifyBuybackReleasedReceipt(receipt, vault, { token })).toEqual({ token, creatorAmount: 7n, protocolAmount: 8n });
  });
});
