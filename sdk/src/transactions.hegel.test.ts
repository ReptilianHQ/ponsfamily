import { describe, expect, it } from "vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { decodeFunctionData, getAddress, pad, toHex, zeroAddress, type Address, type Hex } from "viem";
import { ponsCurveAbi, ponsFactoryAbi, ponsForwarderAbi, ponsMemeHookAbi, ponsTokenAbi } from "./abis.js";
import { robinhoodMainnet } from "./deployments.js";
import { isPonsSdkError } from "./errors.js";
import { assertConfirmedTransaction, type ConfirmedTransactionLike } from "./receipts.js";
import {
  buildApprovalTransaction,
  buildCurveBuyTransaction,
  buildCurveSellTransaction,
  buildLaunchTransaction,
  buildSweepPoolFeesTransaction,
  type TransactionRequest,
} from "./transactions.js";

const MAX_AMOUNT = 10n ** 24n;
const MAX_ADDRESS = 2n ** 160n - 1n;
const MAX_BYTES32 = 2n ** 256n - 1n;
const HEGEL_SETTINGS = {
  testCases: 500,
  derandomize: true,
  database: hegel.Database.disabled,
} as const;

type TestCase = Parameters<Parameters<typeof hegel.test>[0]>[0];

function drawAddress(tc: TestCase, nonZero = true): Address {
  const raw = tc.draw(gs.bigIntegers({ minValue: nonZero ? 1n : 0n, maxValue: MAX_ADDRESS }));
  return getAddress(pad(toHex(raw), { size: 20 }));
}

function drawBytes32(tc: TestCase): Hex {
  return pad(toHex(tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_BYTES32 }))), { size: 32 });
}

function drawAmount(tc: TestCase, minValue = 0n): bigint {
  return tc.draw(gs.bigIntegers({ minValue, maxValue: MAX_AMOUNT }));
}

/** A transaction that a node would report after the reviewed request was mined unchanged. */
function minedAsRequested(request: TransactionRequest, from: Address): ConfirmedTransactionLike {
  return { from, to: request.to, value: request.value, input: request.data };
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

  it("round-trips curve sells with no native value", () => {
    hegel.test((tc) => {
      const curve = drawAddress(tc);
      const recipient = drawAddress(tc);
      const tokensIn = drawAmount(tc, 1n);
      const minQuoteOut = drawAmount(tc);

      const request = buildCurveSellTransaction({ curve, tokensIn, minQuoteOut, recipient });
      const decoded = decodeFunctionData({ abi: ponsCurveAbi, data: request.data });

      expect(request.to).toBe(curve);
      expect(request.value).toBe(0n);
      expect(decoded.functionName).toBe("sell");
      expect(decoded.args).toEqual([tokensIn, minQuoteOut, recipient]);
    }, HEGEL_SETTINGS);
  });

  it("round-trips approvals and pool fee sweeps through their ABIs", () => {
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
    }, HEGEL_SETTINGS);
  });

  it("round-trips launches to the factory or forwarder with the exact native value", () => {
    hegel.test((tc) => {
      const salt = drawBytes32(tc);
      const expectedEconomics = drawBytes32(tc);
      const launchConfigId = tc.draw(gs.bigIntegers({ minValue: 0n, maxValue: 1_000n }));
      const launchFee = drawAmount(tc);
      const creatorTaxBps = tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 }));
      const buybackEnabled = tc.draw(gs.booleans());
      const creatorFeeRecipient = drawAddress(tc, false);
      const name = `Pons ${tc.draw(gs.integers({ minValue: 0, maxValue: 99_999 }))}`;
      const symbol = `P${tc.draw(gs.integers({ minValue: 0, maxValue: 9_999 }))}`;
      const withOpeningBuy = tc.draw(gs.booleans());
      const openingBuy = withOpeningBuy
        ? { quoteIn: drawAmount(tc, 1n), minTokensOut: drawAmount(tc), recipient: drawAddress(tc) }
        : undefined;

      const request = buildLaunchTransaction(robinhoodMainnet, {
        token: { name, symbol, salt, expectedEconomics, creatorTaxBps, buybackEnabled, creatorFeeRecipient },
        launchConfigId,
        launchFee,
        openingBuy,
      });

      const expectedParams = {
        name,
        symbol,
        logo: "",
        description: "",
        socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
        creatorFeeRecipient,
        creatorTaxBps,
        buybackEnabled,
        expectedEconomics,
        salt,
      };

      if (openingBuy) {
        const decoded = decodeFunctionData({ abi: ponsForwarderAbi, data: request.data });
        expect(request.to).toBe(robinhoodMainnet.contracts.forwarder);
        expect(request.value).toBe(launchFee + openingBuy.quoteIn);
        expect(decoded.functionName).toBe("launchAndBuy");
        expect(decoded.args).toEqual([
          expectedParams, launchConfigId, zeroAddress, openingBuy.quoteIn, openingBuy.minTokensOut, openingBuy.recipient, [],
        ]);
      } else {
        const decoded = decodeFunctionData({ abi: ponsFactoryAbi, data: request.data });
        expect(request.to).toBe(robinhoodMainnet.contracts.factory);
        expect(request.value).toBe(launchFee);
        expect(decoded.functionName).toBe("launchToken");
        expect(decoded.args).toEqual([expectedParams, launchConfigId, zeroAddress, []]);
      }
    }, HEGEL_SETTINGS);
  });
});

describe("Pons calldata verification properties", () => {
  it("accepts a transaction mined exactly as the reviewed request", () => {
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

  it("classifies any single perturbation of the mined transaction as a mismatch by code", () => {
    hegel.test((tc) => {
      const sender = drawAddress(tc);
      const request = buildCurveSellTransaction({
        curve: drawAddress(tc),
        tokensIn: drawAmount(tc, 1n),
        minQuoteOut: drawAmount(tc),
        recipient: drawAddress(tc),
      });
      const mined = minedAsRequested(request, sender);
      const field = tc.draw(gs.sampledFrom(["input", "value", "to", "from"] as const));

      let perturbed: ConfirmedTransactionLike;
      let expectedCode: string;
      switch (field) {
        case "input": {
          const bytes = Buffer.from(mined.input.slice(2), "hex");
          const index = tc.draw(gs.integers({ minValue: 0, maxValue: bytes.length - 1 }));
          const flip = tc.draw(gs.integers({ minValue: 1, maxValue: 255 }));
          bytes[index] = bytes[index]! ^ flip;
          perturbed = { ...mined, input: `0x${bytes.toString("hex")}` };
          expectedCode = "CALLDATA_MISMATCH";
          break;
        }
        case "value": {
          perturbed = { ...mined, value: mined.value + drawAmount(tc, 1n) };
          expectedCode = "UNEXPECTED_VALUE";
          break;
        }
        case "to": {
          let other = drawAddress(tc);
          if (other === mined.to) other = zeroAddress === other ? getAddress(pad("0x1", { size: 20 })) : zeroAddress;
          perturbed = { ...mined, to: other };
          expectedCode = "UNEXPECTED_TARGET";
          break;
        }
        case "from": {
          let other = drawAddress(tc);
          if (other === sender) other = zeroAddress;
          perturbed = { ...mined, from: other };
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
