import { decodeFunctionData, getAddress, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { ponsBuybackVaultAbi, ponsCurveAbi, ponsFactoryAbi, ponsFeeEscrowAbi, ponsForwarderAbi, ponsTokenAbi } from "./abis.js";
import { robinhoodMainnet } from "./deployments.js";
import {
  buildApprovalTransaction,
  buildClaimNativeFeesTransaction,
  buildClaimTokenFeesTransaction,
  buildCreateGraduatedPoolTransaction,
  buildCurveBuyTransaction,
  buildCurveSellTransaction,
  buildGraduateTransaction,
  buildLaunchTransaction,
  buildReleaseBuybackTransaction,
  buildSetBuybackEnabledTransaction,
  buildSweepCurveFeesTransaction,
  buildTransferCreatorFeeRecipientTransaction,
} from "./transactions.js";

const account = getAddress("0x1111111111111111111111111111111111111111");
const curve = getAddress("0x2222222222222222222222222222222222222222");
const salt = `0x${"12".repeat(32)}` as const;

describe("transaction builders", () => {
  it("builds a direct launch against the pinned factory", () => {
    const request = buildLaunchTransaction(robinhoodMainnet, {
      token: { name: "Pons SDK", symbol: "PONS", salt },
      launchConfigId: 0n,
      launchFee: 500_000_000_000_000n,
    });
    expect(request.to).toBe(robinhoodMainnet.contracts.factory);
    expect(request.value).toBe(500_000_000_000_000n);
    expect(decodeFunctionData({ abi: ponsFactoryAbi, data: request.data }).functionName).toBe("launchToken");
  });

  it("builds an atomic native launch and buy through the forwarder", () => {
    const request = buildLaunchTransaction(robinhoodMainnet, {
      token: { name: "Pons SDK", symbol: "PONS", salt },
      launchConfigId: 0n,
      launchFee: 5n,
      openingBuy: { quoteIn: 10n, minTokensOut: 9n, recipient: account },
    });
    expect(request.to).toBe(robinhoodMainnet.contracts.forwarder);
    expect(request.value).toBe(15n);
    expect(decodeFunctionData({ abi: ponsForwarderAbi, data: request.data }).functionName).toBe("launchAndBuy");
  });

  it("sets native value only for native curve buys", () => {
    const native = buildCurveBuyTransaction({ curve, pairToken: zeroAddress, quoteIn: 20n, minTokensOut: 1n, recipient: account });
    const erc20 = buildCurveBuyTransaction({ curve, pairToken: account, quoteIn: 20n, minTokensOut: 1n, recipient: account });
    expect(native.value).toBe(20n);
    expect(erc20.value).toBe(0n);
    expect(decodeFunctionData({ abi: ponsCurveAbi, data: native.data }).functionName).toBe("buy");
  });

  it("builds sells without native value", () => {
    const request = buildCurveSellTransaction({ curve, tokensIn: 20n, minQuoteOut: 1n, recipient: account });
    expect(request.value).toBe(0n);
    expect(decodeFunctionData({ abi: ponsCurveAbi, data: request.data }).functionName).toBe("sell");
  });

  it("encodes approvals and every management transaction without native value", () => {
    const factory = robinhoodMainnet.contracts.factory;
    const token = getAddress("0x4444444444444444444444444444444444444444");
    const next = getAddress("0x5555555555555555555555555555555555555555");
    const requests = [
      [buildApprovalTransaction(token, curve, 7n), ponsTokenAbi, "approve"],
      [buildGraduateTransaction(factory, token), ponsFactoryAbi, "graduate"],
      [buildCreateGraduatedPoolTransaction(factory, token), ponsFactoryAbi, "createGraduatedPool"],
      [buildTransferCreatorFeeRecipientTransaction(factory, token, next), ponsFactoryAbi, "transferCreatorFeeRecipient"],
      [buildSetBuybackEnabledTransaction(factory, token, true), ponsFactoryAbi, "setBuybackEnabled"],
      [buildSweepCurveFeesTransaction(curve, 9n), ponsCurveAbi, "sweepFees"],
      [buildClaimNativeFeesTransaction(robinhoodMainnet.contracts.feeEscrow), ponsFeeEscrowAbi, "claim"],
      [buildClaimNativeFeesTransaction(robinhoodMainnet.contracts.feeEscrow, 11n), ponsFeeEscrowAbi, "claim"],
      [buildClaimTokenFeesTransaction(robinhoodMainnet.contracts.feeEscrow, token), ponsFeeEscrowAbi, "claimToken"],
      [buildClaimTokenFeesTransaction(robinhoodMainnet.contracts.feeEscrow, token, 13n), ponsFeeEscrowAbi, "claimToken"],
      [buildReleaseBuybackTransaction(robinhoodMainnet.contracts.buybackVault, token), ponsBuybackVaultAbi, "release"],
    ] as const;

    for (const [request, abi, functionName] of requests) {
      expect(request.value).toBe(0n);
      expect(decodeFunctionData({ abi, data: request.data }).functionName).toBe(functionName);
    }
  });

  it("rejects unsafe launch and trade arguments before encoding", () => {
    expect(() => buildLaunchTransaction(robinhoodMainnet, {
      token: { name: "Pons SDK", symbol: "PONS", salt, creatorTaxBps: 1_001 },
      launchConfigId: 0n,
      launchFee: 1n,
    })).toThrow(/creatorTaxBps/);
    expect(() => buildCurveBuyTransaction({ curve, pairToken: zeroAddress, quoteIn: 0n, minTokensOut: 0n, recipient: account })).toThrow(/quoteIn/);
    expect(() => buildCurveSellTransaction({ curve, tokensIn: 1n, minQuoteOut: -1n, recipient: account })).toThrow(/minQuoteOut/);
  });
});
