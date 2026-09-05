import { describe, expect, it } from "vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  getAddress,
  pad,
  toHex,
  zeroAddress,
  type Abi,
  type AbiEvent,
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
} from "./abis.js";
import { isPonsSdkError } from "./errors.js";
import * as receipts from "./receipts.js";
import type { ReceiptLike } from "./receipts.js";

const MAX_AMOUNT = 10n ** 24n;
const MAX_ADDRESS = 2n ** 160n - 1n;
const HEGEL_SETTINGS = {
  testCases: 500,
  derandomize: true,
  database: hegel.Database.disabled,
} as const;

function drawAddress(tc: hegel.TestCase): Address {
  return getAddress(pad(toHex(tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_ADDRESS }))), { size: 20 }));
}

function drawOtherAddress(tc: hegel.TestCase, other: Address): Address {
  const candidate = drawAddress(tc);
  return candidate.toLowerCase() === other.toLowerCase() ? zeroAddress : candidate;
}

/** Generates a value for one ABI input type and, on request, a different one. */
function drawArg(tc: hegel.TestCase, type: string): unknown {
  switch (type) {
    case "address": return drawAddress(tc);
    case "uint256": return tc.draw(gs.bigIntegers({ minValue: 0n, maxValue: MAX_AMOUNT }));
    case "bool": return tc.draw(gs.booleans());
    case "bytes32": return pad(toHex(tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: 2n ** 256n - 1n }))), { size: 32 });
    default: throw new Error(`unsupported ABI type ${type}`);
  }
}

function perturbArg(tc: hegel.TestCase, type: string, value: unknown): unknown {
  switch (type) {
    case "address": return drawOtherAddress(tc, value as Address);
    case "uint256": return (value as bigint) + tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
    case "bool": return !(value as boolean);
    case "bytes32": { const next = (BigInt(value as Hex) + 1n) % 2n ** 256n; return pad(toHex(next), { size: 32 }); }
    default: throw new Error(`unsupported ABI type ${type}`);
  }
}

/** Encodes one event log exactly as a node would report it. */
function encodeLog(abi: Abi, eventName: string, emitter: Address, args: Record<string, unknown>) {
  const item = getAbiItem({ abi, name: eventName }) as AbiEvent;
  const topics = encodeEventTopics({ abi, eventName, args } as never) as [Hex, ...Hex[]];
  const data = encodeAbiParameters(item.inputs.filter((input) => !input.indexed), item.inputs.filter((input) => !input.indexed).map((input) => args[input.name!]));
  return { address: emitter, topics, data };
}

function receiptWith(logs: ReceiptLike["logs"], status: ReceiptLike["status"] = "success"): ReceiptLike {
  return { status, logs };
}

interface VerifierCase {
  name: string;
  abi: Abi;
  eventName: string;
  verify: (receipt: ReceiptLike, emitter: Address, expected: never) => unknown;
}

// Every exported single-event verifier. verifyLaunchReceipt is covered
// separately because it consumes two events across two emitters.
const singleEventVerifiers: VerifierCase[] = [
  { name: "verifyCurveBuyReceipt", abi: ponsCurveAbi, eventName: "CurveBuy", verify: receipts.verifyCurveBuyReceipt },
  { name: "verifyCurveSellReceipt", abi: ponsCurveAbi, eventName: "CurveSell", verify: receipts.verifyCurveSellReceipt },
  { name: "verifyPoolGraduatedReceipt", abi: ponsFactoryAbi, eventName: "PoolGraduated", verify: receipts.verifyPoolGraduatedReceipt },
  { name: "verifyFeesSweptReceipt", abi: ponsCurveAbi, eventName: "FeesSwept", verify: receipts.verifyFeesSweptReceipt },
  { name: "verifyBuybackLockedReceipt", abi: ponsCurveAbi, eventName: "BuybackLocked", verify: receipts.verifyBuybackLockedReceipt },
  { name: "verifyLaunchSweptReceipt", abi: ponsFactoryAbi, eventName: "LaunchSwept", verify: receipts.verifyLaunchSweptReceipt },
  { name: "verifyCreatorFeeRecipientUpdatedReceipt", abi: ponsFactoryAbi, eventName: "CreatorFeeRecipientUpdated", verify: receipts.verifyCreatorFeeRecipientUpdatedReceipt },
  { name: "verifyBuybackEnabledUpdatedReceipt", abi: ponsFactoryAbi, eventName: "BuybackEnabledUpdated", verify: receipts.verifyBuybackEnabledUpdatedReceipt },
  { name: "verifyPoolFeesSweptReceipt", abi: ponsMemeHookAbi, eventName: "PoolFeesSwept", verify: receipts.verifyPoolFeesSweptReceipt },
  { name: "verifyNativeFeesClaimedReceipt", abi: ponsFeeEscrowAbi, eventName: "Claimed", verify: receipts.verifyNativeFeesClaimedReceipt },
  { name: "verifyTokenFeesClaimedReceipt", abi: ponsFeeEscrowAbi, eventName: "ClaimedToken", verify: receipts.verifyTokenFeesClaimedReceipt },
  { name: "verifyBuybackReleasedReceipt", abi: ponsBuybackVaultAbi, eventName: "Released", verify: receipts.verifyBuybackReleasedReceipt },
];

function eventInputs(abi: Abi, eventName: string) {
  return (getAbiItem({ abi, name: eventName }) as AbiEvent).inputs as readonly { name?: string; type: string; indexed?: boolean }[];
}

function drawEventArgs(tc: hegel.TestCase, abi: Abi, eventName: string): Record<string, unknown> {
  return Object.fromEntries(eventInputs(abi, eventName).map((input) => [input.name!, drawArg(tc, input.type)]));
}

function drawVerifier(tc: hegel.TestCase): VerifierCase {
  return singleEventVerifiers[tc.draw(gs.integers({ minValue: 0, maxValue: singleEventVerifiers.length - 1 }))]!;
}

/**
 * The single place the verifier binding is invoked with generated material.
 * Bindings keep their precise signatures (so a swapped parameter fails to
 * compile); only this call erases the expected-shape type.
 */
function runVerify(v: VerifierCase, receipt: ReceiptLike, emitter: Address, expected: Record<string, unknown>): unknown {
  return v.verify(receipt, emitter, expected as never);
}

function caught(run: () => unknown): unknown {
  try {
    run();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("Pons receipt verifier properties", () => {
  it("covers every exported single-event verifier", () => {
    const exported = Object.keys(receipts).filter((name) => /^verify\w+Receipt$/.test(name) && name !== "verifyLaunchReceipt").sort();
    expect(singleEventVerifiers.map((v) => v.name).sort()).toEqual(exported);
  });

  it("accepts a receipt whose event matches every expected field and returns it as evidence", () => {
    hegel.test((tc) => {
      const v = drawVerifier(tc);
      const emitter = drawAddress(tc);
      const args = drawEventArgs(tc, v.abi, v.eventName);
      // Unrelated logs from the same emitter and from strangers must not interfere.
      const stranger = encodeLog(ponsFeeEscrowAbi, "Claimed", drawOtherAddress(tc, emitter), { recipient: drawAddress(tc), amount: 1n });
      const receipt = receiptWith([stranger, encodeLog(v.abi, v.eventName, emitter, args)]);
      const evidence = runVerify(v, receipt, emitter, args);
      expect(evidence).toEqual(args);
    }, HEGEL_SETTINGS);
  });

  it("classifies any single perturbed expected field as RECEIPT_FIELD_MISMATCH", () => {
    hegel.test((tc) => {
      const v = drawVerifier(tc);
      const emitter = drawAddress(tc);
      const args = drawEventArgs(tc, v.abi, v.eventName);
      const inputs = eventInputs(v.abi, v.eventName);
      const target = inputs[tc.draw(gs.integers({ minValue: 0, maxValue: inputs.length - 1 }))]!;
      const expected = { ...args, [target.name!]: perturbArg(tc, target.type, args[target.name!]) };
      const error = caught(() => runVerify(v, receiptWith([encodeLog(v.abi, v.eventName, emitter, args)]), emitter, expected));
      expect(isPonsSdkError(error)).toBe(true);
      if (isPonsSdkError(error)) {
        expect(error.code).toBe("RECEIPT_FIELD_MISMATCH");
        expect(error.path).toBe(target.name);
      }
    }, HEGEL_SETTINGS);
  });

  it("classifies a matching event from any other emitter as EVENT_NOT_FOUND", () => {
    hegel.test((tc) => {
      const v = drawVerifier(tc);
      const emitter = drawAddress(tc);
      const args = drawEventArgs(tc, v.abi, v.eventName);
      const receipt = receiptWith([encodeLog(v.abi, v.eventName, drawOtherAddress(tc, emitter), args)]);
      const error = caught(() => runVerify(v, receipt, emitter, {}));
      expect(isPonsSdkError(error) && error.code).toBe("EVENT_NOT_FOUND");
    }, HEGEL_SETTINGS);
  });

  it("classifies a reverted receipt as RECEIPT_REVERTED before reading any log", () => {
    hegel.test((tc) => {
      const v = drawVerifier(tc);
      const emitter = drawAddress(tc);
      const args = drawEventArgs(tc, v.abi, v.eventName);
      const status = tc.draw(gs.sampledFrom(["reverted", 0, "0x0"] as const));
      const error = caught(() => runVerify(v, receiptWith([encodeLog(v.abi, v.eventName, emitter, args)], status), emitter, args));
      expect(isPonsSdkError(error) && error.code).toBe("RECEIPT_REVERTED");
    }, HEGEL_SETTINGS);
  });

  it("enforces output floors independently of exact field matches", () => {
    hegel.test((tc) => {
      const curve = drawAddress(tc);
      const args = drawEventArgs(tc, ponsCurveAbi, "CurveSell") as { quoteOut: bigint } & Record<string, unknown>;
      const shortfall = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const receipt = receiptWith([encodeLog(ponsCurveAbi, "CurveSell", curve, args)]);
      expect(receipts.verifyCurveSellReceipt(receipt, curve, { minQuoteOut: args.quoteOut })).toEqual(args);
      const error = caught(() => receipts.verifyCurveSellReceipt(receipt, curve, { minQuoteOut: args.quoteOut + shortfall }));
      expect(isPonsSdkError(error) && error.code).toBe("OUTPUT_BELOW_MINIMUM");
    }, HEGEL_SETTINGS);
  });
});

describe("Pons launch receipt properties", () => {
  const factory = getAddress("0x3333333333333333333333333333333333333333");
  const forwarder = getAddress("0x4444444444444444444444444444444444444444");

  function drawLaunch(tc: hegel.TestCase) {
    const launch = drawEventArgs(tc, ponsFactoryAbi, "TokenLaunched") as Record<string, unknown> & { token: Address; curve: Address };
    const openingBuy = {
      ...drawEventArgs(tc, ponsForwarderAbi, "Launched"),
      token: launch.token,
      curve: launch.curve,
    } as Record<string, unknown> & { token: Address; curve: Address; tokensReceived: bigint };
    return { launch, openingBuy };
  }

  it("accepts a launch with a consistent atomic opening buy and returns both events", () => {
    hegel.test((tc) => {
      const { launch, openingBuy } = drawLaunch(tc);
      const receipt = receiptWith([
        encodeLog(ponsFactoryAbi, "TokenLaunched", factory, launch),
        encodeLog(ponsForwarderAbi, "Launched", forwarder, openingBuy),
      ]);
      const result = receipts.verifyLaunchReceipt(receipt, factory, {
        expected: launch as never,
        forwarder,
        openingBuy: { ...openingBuy, minTokensOut: openingBuy.tokensReceived } as never,
      });
      expect(result).toEqual({ launch, openingBuy });
      expect(receipts.verifyLaunchReceipt(receipt, factory)).toEqual({ launch });
    }, HEGEL_SETTINGS);
  });

  it("rejects an opening buy whose token or curve disagrees with the launch", () => {
    hegel.test((tc) => {
      const { launch, openingBuy } = drawLaunch(tc);
      const field = tc.draw(gs.sampledFrom(["token", "curve"] as const));
      const inconsistent = { ...openingBuy, [field]: drawOtherAddress(tc, openingBuy[field]) };
      const receipt = receiptWith([
        encodeLog(ponsFactoryAbi, "TokenLaunched", factory, launch),
        encodeLog(ponsForwarderAbi, "Launched", forwarder, inconsistent),
      ]);
      const error = caught(() => receipts.verifyLaunchReceipt(receipt, factory, { forwarder, openingBuy: {} }));
      expect(isPonsSdkError(error) && error.code).toBe("RECEIPT_FIELD_MISMATCH");
    }, HEGEL_SETTINGS);
  });

  it("rejects every curve buy whose actual spend exceeds its reviewed offer", () => {
    hegel.test((tc) => {
      const curve = drawAddress(tc);
      const account = drawAddress(tc);
      const quoteOffered = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const excess = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const quoteIn = quoteOffered + excess;
      const tokensOut = quoteIn * 2n;
      const minTokensOut = quoteOffered * 2n;
      const receipt = receiptWith([encodeLog(ponsCurveAbi, "CurveBuy", curve, {
        buyer: account, recipient: account, quoteIn, tokensOut, fee: 0n, tax: 0n,
      })]);

      // This deliberately satisfies the partial-fill price equation; only the
      // independently reviewed spend ceiling can reject the evidence.
      expect(quoteIn * minTokensOut).toBe(quoteOffered * tokensOut);
      const error = caught(() => receipts.verifyCurveBuyReceipt(receipt, curve, {
        buyer: account, recipient: account, minTokensOut, quoteOffered,
      }));
      expect(isPonsSdkError(error) && error.code).toBe("RECEIPT_FIELD_MISMATCH");
      if (isPonsSdkError(error)) expect(error.path).toBe("quoteIn");
    }, HEGEL_SETTINGS);
  });
});
