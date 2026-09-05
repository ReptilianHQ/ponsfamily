import { describe, expect, it } from "vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import {
  bytesToHex,
  decodeFunctionData,
  getAddress,
  hexToBytes,
  pad,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import {
  ponsBuybackVaultAbi,
  ponsCurveAbi,
  ponsFactoryAbi,
  ponsFeeEscrowAbi,
  ponsForwarderAbi,
  ponsMemeHookAbi,
  ponsTokenAbi,
} from "./abis.js";
import { robinhoodMainnet } from "./deployments.js";
import { isPonsSdkError } from "./errors.js";
import { assertConfirmedTransaction, type ConfirmedTransactionLike } from "./receipts.js";
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
  buildSweepPoolFeesTransaction,
  buildTransferCreatorFeeRecipientTransaction,
  type TransactionRequest,
} from "./transactions.js";

// Layer 1 of the Reptilian SDK standard: every exported build* function
// round-trips through the pinned ABI, and the SDK's own calldata verification
// classifies any single perturbation of the mined transaction by code.
// All thirteen exported builders are covered below.

const MAX_AMOUNT = 10n ** 24n;
const MAX_ADDRESS = 2n ** 160n - 1n;
const MAX_BYTES32 = 2n ** 256n - 1n;
const HEGEL_SETTINGS = {
  testCases: 500,
  derandomize: true,
  database: hegel.Database.disabled,
} as const;

function drawAddress(tc: hegel.TestCase, minValue = 1n): Address {
  const raw = tc.draw(gs.bigIntegers({ minValue, maxValue: MAX_ADDRESS }));
  return getAddress(pad(toHex(raw), { size: 20 }));
}

/** Draws an address that differs from `other`; falls back to the zero address. */
function drawOtherAddress(tc: hegel.TestCase, other: Address): Address {
  const candidate = drawAddress(tc);
  return candidate === other ? zeroAddress : candidate;
}

function drawBytes32(tc: hegel.TestCase): Hex {
  return pad(toHex(tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_BYTES32 }))), { size: 32 });
}

function drawAmount(tc: hegel.TestCase, minValue = 0n): bigint {
  return tc.draw(gs.bigIntegers({ minValue, maxValue: MAX_AMOUNT }));
}

/** Padded text so normalization (trim) is exercised, not restated. */
function drawPaddedText(tc: hegel.TestCase, prefix: string, maxBytes: number): { raw: string; trimmed: string } {
  const body = `${prefix}${tc.draw(gs.integers({ minValue: 0, maxValue: 99_999 }))}`.slice(0, maxBytes);
  const leading = " ".repeat(tc.draw(gs.integers({ minValue: 0, maxValue: 2 })));
  const trailing = " ".repeat(tc.draw(gs.integers({ minValue: 0, maxValue: 2 })));
  return { raw: `${leading}${body}${trailing}`, trimmed: body };
}

function drawAddresses(tc: hegel.TestCase, maxCount: number): Address[] {
  const count = tc.draw(gs.integers({ minValue: 0, maxValue: maxCount }));
  return Array.from({ length: count }, () => drawAddress(tc));
}

/**
 * The transaction a node reports after the reviewed request was mined
 * unchanged. JSON-RPC returns lower-case hex, so the verifier's own
 * normalization is part of what acceptance proves.
 */
function minedAsRequested(request: TransactionRequest, from: Address): ConfirmedTransactionLike {
  return {
    from: from.toLowerCase() as Address,
    to: request.to.toLowerCase() as Address,
    value: request.value,
    input: request.data.toLowerCase() as Hex,
  };
}

describe("Pons transaction construction properties", () => {
  it("round-trips curve buys through the pinned curve ABI", () => {
    hegel.test((tc) => {
      const curve = drawAddress(tc);
      const recipient = drawAddress(tc);
      const native = tc.draw(gs.booleans());
      const pairToken = native ? zeroAddress : drawAddress(tc);
      const quoteIn = drawAmount(tc, 1n);
      const minTokensOut = drawAmount(tc);

      const request = buildCurveBuyTransaction({ curve, pairToken, quoteIn, minTokensOut, recipient });
      const decoded = decodeFunctionData({ abi: ponsCurveAbi, data: request.data });

      expect(request.to).toBe(curve);
      expect(request.value).toBe(native ? quoteIn : 0n);
      expect(decoded.functionName).toBe("buy");
      expect(decoded.args).toEqual([quoteIn, minTokensOut, recipient]);
    }, HEGEL_SETTINGS);
  });

  it("round-trips curve sells and curve fee sweeps with no native value", () => {
    hegel.test((tc) => {
      const curve = drawAddress(tc);
      const recipient = drawAddress(tc);
      const tokensIn = drawAmount(tc, 1n);
      const minQuoteOut = drawAmount(tc);
      const sell = buildCurveSellTransaction({ curve, tokensIn, minQuoteOut, recipient });
      const sellDecoded = decodeFunctionData({ abi: ponsCurveAbi, data: sell.data });
      expect(sell).toMatchObject({ to: curve, value: 0n });
      expect(sellDecoded.functionName).toBe("sell");
      expect(sellDecoded.args).toEqual([tokensIn, minQuoteOut, recipient]);

      const minBuybackTokensOut = drawAmount(tc);
      const sweep = buildSweepCurveFeesTransaction(curve, minBuybackTokensOut);
      const sweepDecoded = decodeFunctionData({ abi: ponsCurveAbi, data: sweep.data });
      expect(sweep).toMatchObject({ to: curve, value: 0n });
      expect(sweepDecoded.functionName).toBe("sweepFees");
      expect(sweepDecoded.args).toEqual([minBuybackTokensOut]);
    }, HEGEL_SETTINGS);
  });

  it("round-trips approvals, pool fee sweeps, and buyback releases through their ABIs", () => {
    hegel.test((tc) => {
      const token = drawAddress(tc);
      const spender = drawAddress(tc);
      const amount = drawAmount(tc, 1n);
      const approval = buildApprovalTransaction(token, spender, amount);
      const approvalDecoded = decodeFunctionData({ abi: ponsTokenAbi, data: approval.data });
      expect(approval).toMatchObject({ to: token, value: 0n });
      expect(approvalDecoded.functionName).toBe("approve");
      expect(approvalDecoded.args).toEqual([spender, amount]);

      const memeHook = drawAddress(tc);
      const poolId = drawBytes32(tc);
      const minConversionQuoteOut = drawAmount(tc);
      const minBuybackTokensOut = drawAmount(tc);
      const sweep = buildSweepPoolFeesTransaction(memeHook, poolId, minConversionQuoteOut, minBuybackTokensOut);
      const sweepDecoded = decodeFunctionData({ abi: ponsMemeHookAbi, data: sweep.data });
      expect(sweep).toMatchObject({ to: memeHook, value: 0n });
      expect(sweepDecoded.functionName).toBe("sweepPoolFees");
      expect(sweepDecoded.args).toEqual([poolId, minConversionQuoteOut, minBuybackTokensOut]);

      const buybackVault = drawAddress(tc);
      const release = buildReleaseBuybackTransaction(buybackVault, token);
      const releaseDecoded = decodeFunctionData({ abi: ponsBuybackVaultAbi, data: release.data });
      expect(release).toMatchObject({ to: buybackVault, value: 0n });
      expect(releaseDecoded.functionName).toBe("release");
      expect(releaseDecoded.args).toEqual([token]);
    }, HEGEL_SETTINGS);
  });

  it("round-trips every factory builder that encodes through the untyped factoryTransaction helper", () => {
    hegel.test((tc) => {
      const factory = drawAddress(tc);
      const token = drawAddress(tc);
      const newRecipient = drawAddress(tc);
      const enabled = tc.draw(gs.booleans());

      const cases = [
        [buildGraduateTransaction(factory, token), "graduate", [token]],
        [buildCreateGraduatedPoolTransaction(factory, token), "createGraduatedPool", [token]],
        [buildTransferCreatorFeeRecipientTransaction(factory, token, newRecipient), "transferCreatorFeeRecipient", [token, newRecipient]],
        [buildSetBuybackEnabledTransaction(factory, token, enabled), "setBuybackEnabled", [token, enabled]],
      ] as const;

      for (const [request, functionName, args] of cases) {
        const decoded = decodeFunctionData({ abi: ponsFactoryAbi, data: request.data });
        expect(request).toMatchObject({ to: factory, value: 0n });
        expect(decoded.functionName).toBe(functionName);
        expect(decoded.args).toEqual(args);
      }
    }, HEGEL_SETTINGS);
  });

  it("selects the correct fee escrow claim overload for each amount form", () => {
    hegel.test((tc) => {
      const feeEscrow = drawAddress(tc);
      const token = drawAddress(tc);
      const withAmount = tc.draw(gs.booleans());
      const amount = withAmount ? drawAmount(tc, 1n) : undefined;

      const native = buildClaimNativeFeesTransaction(feeEscrow, amount);
      const nativeDecoded = decodeFunctionData({ abi: ponsFeeEscrowAbi, data: native.data });
      expect(native).toMatchObject({ to: feeEscrow, value: 0n });
      expect(nativeDecoded.functionName).toBe("claim");
      expect(nativeDecoded.args ?? []).toEqual(amount === undefined ? [] : [amount]);

      const erc20 = buildClaimTokenFeesTransaction(feeEscrow, token, amount);
      const erc20Decoded = decodeFunctionData({ abi: ponsFeeEscrowAbi, data: erc20.data });
      expect(erc20).toMatchObject({ to: feeEscrow, value: 0n });
      expect(erc20Decoded.functionName).toBe("claimToken");
      expect(erc20Decoded.args).toEqual(amount === undefined ? [token] : [token, amount]);

      // The two overloads must not share a selector.
      expect(native.data.slice(0, 10)).not.toBe(
        buildClaimNativeFeesTransaction(feeEscrow, amount === undefined ? 1n : undefined).data.slice(0, 10),
      );
    }, HEGEL_SETTINGS);
  });

  it("round-trips launches to the factory or forwarder with normalized metadata and the exact native value", () => {
    hegel.test((tc) => {
      const salt = drawBytes32(tc);
      const pinEconomics = tc.draw(gs.booleans());
      const expectedEconomics = pinEconomics ? drawBytes32(tc) : undefined;
      const launchConfigId = tc.draw(gs.bigIntegers({ minValue: 0n, maxValue: 1_000n }));
      const launchFee = drawAmount(tc);
      const creatorTaxBps = tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 }));
      const buybackEnabled = tc.draw(gs.booleans());
      const creatorFeeRecipient = drawAddress(tc, 0n);
      const name = drawPaddedText(tc, "Pons ", 64);
      const symbol = drawPaddedText(tc, "P", 16);
      const logo = drawPaddedText(tc, "https://logo/", 512);
      const description = drawPaddedText(tc, "desc ", 2_048);
      const twitter = drawPaddedText(tc, "@p", 256);
      const withOpeningBuy = tc.draw(gs.booleans());
      const pairToken = withOpeningBuy ? zeroAddress : drawAddress(tc, 0n);
      const snipeTaxExemptions = drawAddresses(tc, withOpeningBuy ? 31 : 32);
      const openingBuy = withOpeningBuy
        ? { quoteIn: drawAmount(tc, 1n), minTokensOut: drawAmount(tc), recipient: drawAddress(tc) }
        : undefined;

      const request = buildLaunchTransaction(robinhoodMainnet, {
        token: {
          name: name.raw,
          symbol: symbol.raw,
          logo: logo.raw,
          description: description.raw,
          socials: { twitter: twitter.raw },
          creatorTaxBps,
          buybackEnabled,
          creatorFeeRecipient,
          salt,
          ...(expectedEconomics === undefined
            ? { unsafeAllowUnpinnedEconomics: true as const }
            : { expectedEconomics }),
        },
        launchConfigId,
        pairToken,
        snipeTaxExemptions,
        launchFee,
        openingBuy,
      });

      const expectedParams = {
        name: name.trimmed,
        symbol: symbol.trimmed,
        logo: logo.trimmed,
        description: description.trimmed,
        socials: { twitter: twitter.trimmed, telegram: "", discord: "", website: "", farcaster: "" },
        creatorFeeRecipient,
        creatorTaxBps,
        buybackEnabled,
        expectedEconomics: expectedEconomics ?? pad("0x0", { size: 32 }),
        salt,
      };

      if (openingBuy) {
        const decoded = decodeFunctionData({ abi: ponsForwarderAbi, data: request.data });
        expect(request.to).toBe(robinhoodMainnet.contracts.forwarder);
        expect(request.value).toBe(launchFee + openingBuy.quoteIn);
        expect(decoded.functionName).toBe("launchAndBuy");
        expect(decoded.args).toEqual([
          expectedParams, launchConfigId, zeroAddress, openingBuy.quoteIn, openingBuy.minTokensOut, openingBuy.recipient, snipeTaxExemptions,
        ]);
      } else {
        const decoded = decodeFunctionData({ abi: ponsFactoryAbi, data: request.data });
        expect(request.to).toBe(robinhoodMainnet.contracts.factory);
        expect(request.value).toBe(launchFee);
        expect(decoded.functionName).toBe("launchToken");
        expect(decoded.args).toEqual([expectedParams, launchConfigId, pairToken, snipeTaxExemptions]);
      }
    }, HEGEL_SETTINGS);
  });
});

describe("Pons calldata verification properties", () => {
  it("accepts a transaction mined exactly as the reviewed request, as a node would report it", () => {
    hegel.test((tc) => {
      const sender = drawAddress(tc);
      const request = buildCurveBuyTransaction({
        curve: drawAddress(tc),
        pairToken: zeroAddress,
        quoteIn: drawAmount(tc, 1n),
        minTokensOut: drawAmount(tc),
        recipient: drawAddress(tc),
      });
      expect(() => assertConfirmedTransaction(minedAsRequested(request, sender), request, sender)).not.toThrow();
    }, HEGEL_SETTINGS);
  });

  // assertConfirmedTransaction checks from, then to, then value, then input;
  // each perturbation below changes exactly one field, so the order does not
  // affect which code is expected.
  it("classifies any single perturbation of the mined transaction as a mismatch by code", () => {
    hegel.test((tc) => {
      const sender = drawAddress(tc);
      const quoteIn = drawAmount(tc, 1n);
      const request = buildCurveBuyTransaction({
        curve: drawAddress(tc),
        pairToken: zeroAddress,
        quoteIn,
        minTokensOut: drawAmount(tc),
        recipient: drawAddress(tc),
      });
      const mined = minedAsRequested(request, sender);
      const field = tc.draw(gs.sampledFrom(["input", "value", "to", "from"] as const));

      let perturbed: ConfirmedTransactionLike;
      let expectedCode: string;
      switch (field) {
        case "input": {
          const bytes = hexToBytes(mined.input);
          const index = tc.draw(gs.integers({ minValue: 0, maxValue: bytes.length - 1 }));
          bytes[index] = bytes[index] ^ tc.draw(gs.integers({ minValue: 1, maxValue: 255 }));
          perturbed = { ...mined, input: bytesToHex(bytes) };
          expectedCode = "CALLDATA_MISMATCH";
          break;
        }
        case "value": {
          // Reviewed value is quoteIn > 0, so both directions are reachable.
          const down = tc.draw(gs.booleans());
          const delta = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: down ? quoteIn : MAX_AMOUNT }));
          perturbed = { ...mined, value: down ? mined.value - delta : mined.value + delta };
          expectedCode = "UNEXPECTED_VALUE";
          break;
        }
        case "to": {
          perturbed = { ...mined, to: drawOtherAddress(tc, request.to) };
          expectedCode = "UNEXPECTED_TARGET";
          break;
        }
        case "from": {
          perturbed = { ...mined, from: drawOtherAddress(tc, sender) };
          expectedCode = "UNEXPECTED_SENDER";
          break;
        }
      }

      let caught: unknown;
      try {
        assertConfirmedTransaction(perturbed, request, sender);
      } catch (error) {
        caught = error;
      }
      expect(isPonsSdkError(caught)).toBe(true);
      if (isPonsSdkError(caught)) expect(caught.code).toBe(expectedCode);
    }, HEGEL_SETTINGS);
  });
});
