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

// Enumerate finite categories with Vitest; Hegel explores values within each.
const NOISE_KINDS = ["wrongEmitter", "siblingEvent", "malformedEvent"] as const;
const NOISE_PROFILES = [...NOISE_KINDS, "mixed"] as const;
type NoiseProfile = typeof NOISE_PROFILES[number];

function drawNoise(tc: hegel.TestCase, abi: Abi, eventName: string, good: ReturnType<typeof encodeLog>, profile: NoiseProfile) {
  const count = tc.draw(gs.integers({ minValue: 0, maxValue: 8 }));
  // Prefer a sibling in the decoder's own ABI to exercise event-name binding.
  const sibling = abi.find((item): item is AbiEvent => item.type === "event" && item.name !== eventName);
  return Array.from({ length: count }, () => {
    const kind = profile === "mixed" ? tc.draw(gs.sampledFrom(NOISE_KINDS)) : profile;
    if (kind === "wrongEmitter") return { ...good, address: drawOtherAddress(tc, good.address) };
    if (kind === "malformedEvent") return { ...good, topics: [] as [], data: "0x" as Hex };
    const siblingAbi = sibling ? abi : ponsFeeEscrowAbi;
    const siblingName = sibling?.name ?? "Claimed";
    return encodeLog(siblingAbi, siblingName, good.address, drawEventArgs(tc, siblingAbi, siblingName));
  });
}

function expectCode(action: () => unknown, code: string, path?: string) {
  const error = caught(action);
  expect(isPonsSdkError(error)).toBe(true);
  if (isPonsSdkError(error)) {
    expect(error.code).toBe(code);
    if (path !== undefined) expect(error.path).toBe(path);
  }
}

describe("Pons receipt verifier properties", () => {
  it("covers every exported single-event verifier", () => {
    const exported = Object.keys(receipts).filter((name) => /^verify\w+Receipt$/.test(name) && name !== "verifyLaunchReceipt").sort();
    expect(singleEventVerifiers.map((v) => v.name).sort()).toEqual(exported);
  });

  describe.each(singleEventVerifiers)("$name", (v) => {
    it.each(NOISE_PROFILES)("preserves evidence and rejects evidence-free %s mixtures", (profile) => {
      hegel.test((tc) => {
        const emitter = drawAddress(tc);
        const args = drawEventArgs(tc, v.abi, v.eventName);
        const good = encodeLog(v.abi, v.eventName, emitter, args);
        const noise = drawNoise(tc, v.abi, v.eventName, good, profile);
        expectCode(() => runVerify(v, receiptWith(noise), emitter, args), "EVENT_NOT_FOUND");
        const at = tc.draw(gs.integers({ minValue: 0, maxValue: noise.length }));
        const logs = [...noise.slice(0, at), good, ...noise.slice(at)];
        expect(runVerify(v, receiptWith(logs), emitter, args)).toEqual(args);
        expect(runVerify(v, receiptWith([...logs].reverse()), emitter, args)).toEqual(args);
      }, HEGEL_SETTINGS);
    });

    it.each(eventInputs(v.abi, v.eventName))("rejects a perturbed $name expectation", (target) => {
      hegel.test((tc) => {
        const emitter = drawAddress(tc);
        const args = drawEventArgs(tc, v.abi, v.eventName);
        const expected = { ...args, [target.name!]: perturbArg(tc, target.type, args[target.name!]) };
        expectCode(() => runVerify(v, receiptWith([encodeLog(v.abi, v.eventName, emitter, args)]), emitter, expected), "RECEIPT_FIELD_MISMATCH", target.name);
      }, HEGEL_SETTINGS);
    });

    it.each(eventInputs(v.abi, v.eventName))("selects the unique expected event when $name conflicts", (target) => {
      hegel.test((tc) => {
        const emitter = drawAddress(tc);
        const args = drawEventArgs(tc, v.abi, v.eventName);
        const good = encodeLog(v.abi, v.eventName, emitter, args);
        const bad = encodeLog(v.abi, v.eventName, emitter, { ...args, [target.name!]: perturbArg(tc, target.type, args[target.name!]) });
        const noise = drawNoise(tc, v.abi, v.eventName, good, "mixed");
        expect(runVerify(v, receiptWith([...noise, bad, good]), emitter, args)).toEqual(args);
        expect(runVerify(v, receiptWith([...noise, good, bad]), emitter, args)).toEqual(args);
        expectCode(() => runVerify(v, receiptWith([good, ...noise, good]), emitter, args), "AMBIGUOUS_EVENT");
      }, HEGEL_SETTINGS);
    });

    it.each(["reverted", 0, "0x0"] as const)("rejects status %s before reading logs", (status) => {
      hegel.test((tc) => {
        const emitter = drawAddress(tc);
        const args = drawEventArgs(tc, v.abi, v.eventName);
        const good = encodeLog(v.abi, v.eventName, emitter, args);
        expectCode(() => runVerify(v, receiptWith([good], status), emitter, args), "RECEIPT_REVERTED");
        expectCode(() => runVerify(v, receiptWith([], status), emitter, args), "RECEIPT_REVERTED");
      }, HEGEL_SETTINGS);
    });
  });

  it.each(["absolute", "partial-fill"] as const)("enforces the curve-buy %s floor at equality and one unit beyond", (mode) => {
    hegel.test((tc) => {
      const curve = drawAddress(tc);
      const args = { ...drawEventArgs(tc, ponsCurveAbi, "CurveBuy"), quoteIn: tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT })) } as Record<string, unknown> & { quoteIn: bigint; tokensOut: bigint };
      const quoteOffered = args.quoteIn + tc.draw(gs.bigIntegers({ minValue: 0n, maxValue: MAX_AMOUNT }));
      const minimum = mode === "absolute" ? args.tokensOut : quoteOffered * args.tokensOut / args.quoteIn;
      const expected = mode === "absolute" ? {} : { quoteOffered };
      const receipt = receiptWith([encodeLog(ponsCurveAbi, "CurveBuy", curve, args)]);
      expect(receipts.verifyCurveBuyReceipt(receipt, curve, { ...expected, minTokensOut: minimum })).toEqual(args);
      expectCode(() => receipts.verifyCurveBuyReceipt(receipt, curve, { ...expected, minTokensOut: minimum + 1n }), "OUTPUT_BELOW_MINIMUM", "tokensOut");
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

  it.each(["token", "curve"] as const)("rejects an opening buy whose %s disagrees with the launch", (field) => {
    hegel.test((tc) => {
      const { launch, openingBuy } = drawLaunch(tc);
      const inconsistent = { ...openingBuy, [field]: drawOtherAddress(tc, openingBuy[field]) };
      const receipt = receiptWith([
        encodeLog(ponsFactoryAbi, "TokenLaunched", factory, launch),
        encodeLog(ponsForwarderAbi, "Launched", forwarder, inconsistent),
      ]);
      const error = caught(() => receipts.verifyLaunchReceipt(receipt, factory, { forwarder, openingBuy: {} }));
      expect(isPonsSdkError(error) && error.code).toBe("RECEIPT_FIELD_MISMATCH");
    }, HEGEL_SETTINGS);
  });

  it.each(NOISE_PROFILES)("preserves both launch events through %s mixtures", (profile) => {
    hegel.test((tc) => {
      const { launch, openingBuy } = drawLaunch(tc);
      const first = encodeLog(ponsFactoryAbi, "TokenLaunched", factory, launch);
      const second = encodeLog(ponsForwarderAbi, "Launched", forwarder, openingBuy);
      // Wrong-emitter decoys must not accidentally become the other evidence
      // event: the two event signatures are distinct.
      const noise = [...drawNoise(tc, ponsFactoryAbi, "TokenLaunched", first, profile), ...drawNoise(tc, ponsForwarderAbi, "Launched", second, profile)];
      const at = tc.draw(gs.integers({ minValue: 0, maxValue: noise.length }));
      const logs = [...noise.slice(0, at), first, ...noise.slice(at), second];
      const options = { expected: launch, forwarder, openingBuy };
      expect(receipts.verifyLaunchReceipt(receiptWith(logs), factory, options)).toEqual({ launch, openingBuy });
      expect(receipts.verifyLaunchReceipt(receiptWith([...logs].reverse()), factory, options)).toEqual({ launch, openingBuy });
      expectCode(() => receipts.verifyLaunchReceipt(receiptWith(noise), factory, options), "EVENT_NOT_FOUND");
      expectCode(() => receipts.verifyLaunchReceipt(receiptWith([...noise, first]), factory, options), "EVENT_NOT_FOUND");
      expectCode(() => receipts.verifyLaunchReceipt(receiptWith([...noise, second]), factory, options), "EVENT_NOT_FOUND");
    }, HEGEL_SETTINGS);
  });

  for (const part of ["launch", "openingBuy"] as const) {
    const abi = part === "launch" ? ponsFactoryAbi : ponsForwarderAbi;
    const eventName = part === "launch" ? "TokenLaunched" : "Launched";
    const emitter = part === "launch" ? factory : forwarder;
    describe(part, () => {
      it.each(eventInputs(abi, eventName))("rejects the $name expectation and selects unique matching launch evidence", (target) => {
        hegel.test((tc) => {
          const pair = drawLaunch(tc);
          const args = pair[part];
          const changed = { ...args, [target.name!]: perturbArg(tc, target.type, args[target.name!]) };
          const first = encodeLog(ponsFactoryAbi, "TokenLaunched", factory, pair.launch);
          const second = encodeLog(ponsForwarderAbi, "Launched", forwarder, pair.openingBuy);
          const bad = encodeLog(abi, eventName, emitter, changed);
          const options = { expected: pair.launch, forwarder, openingBuy: pair.openingBuy };
          const wrongOptions = part === "launch" ? { ...options, expected: changed } : { ...options, openingBuy: changed };
          expectCode(() => receipts.verifyLaunchReceipt(receiptWith([first, second]), factory, wrongOptions), "RECEIPT_FIELD_MISMATCH", target.name);
          expect(receipts.verifyLaunchReceipt(receiptWith([bad, first, second]), factory, options)).toEqual(pair);
          expect(receipts.verifyLaunchReceipt(receiptWith([first, second, bad]), factory, options)).toEqual(pair);
          expectCode(() => receipts.verifyLaunchReceipt(receiptWith([first, second, first, second]), factory, options), "AMBIGUOUS_EVENT");
        }, HEGEL_SETTINGS);
      });
    });
  }

  it.each(["reverted", 0, "0x0"] as const)("rejects launch status %s before reading either event", (status) => {
    hegel.test((tc) => {
      const { launch, openingBuy } = drawLaunch(tc);
      const logs = [encodeLog(ponsFactoryAbi, "TokenLaunched", factory, launch), encodeLog(ponsForwarderAbi, "Launched", forwarder, openingBuy)];
      expectCode(() => receipts.verifyLaunchReceipt(receiptWith(logs, status), factory, { forwarder }), "RECEIPT_REVERTED");
      expectCode(() => receipts.verifyLaunchReceipt(receiptWith([], status), factory, { forwarder }), "RECEIPT_REVERTED");
    }, HEGEL_SETTINGS);
  });

  it("enforces the opening-buy floor at equality and one unit below", () => {
    hegel.test((tc) => {
      const { launch, openingBuy } = drawLaunch(tc);
      const receipt = receiptWith([encodeLog(ponsFactoryAbi, "TokenLaunched", factory, launch), encodeLog(ponsForwarderAbi, "Launched", forwarder, openingBuy)]);
      expect(receipts.verifyLaunchReceipt(receipt, factory, { forwarder, openingBuy: { minTokensOut: openingBuy.tokensReceived } })).toEqual({ launch, openingBuy });
      expectCode(() => receipts.verifyLaunchReceipt(receipt, factory, { forwarder, openingBuy: { minTokensOut: openingBuy.tokensReceived + 1n } }), "OUTPUT_BELOW_MINIMUM", "openingBuy.tokensReceived");
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
