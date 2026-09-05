import { readFileSync } from "node:fs";
import { decodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { ponsForwarderAbi } from "./abis.js";
import { robinhoodMainnet } from "./deployments.js";
import * as receipts from "./receipts.js";

// Pinned finalized receipts: the integration evidence between the deployed
// contracts and this SDK. Each verifier is fed a real Robinhood Chain receipt
// and must classify it as matched with the evidence recorded at pin time.
// The deployment identity block is asserted against the pinned deployment
// so that any compatibility change (code hash, ABI revision, source commit,
// address) fails here until the receipts are re-pinned.

interface PinnedReceipt {
  emitter: Address;
  transactionHash: Hex;
  blockNumber: number;
  evidence: Record<string, unknown>;
  transaction: { from: Address; to: Address; value: Hex; input: Hex };
  receipt: { status: Hex; logs: readonly { address: Address; topics: [Hex, ...Hex[]]; data: Hex }[] };
}

interface PinnedFixture {
  pinnedAtBlock: number;
  deployment: {
    chainId: number;
    abiRevision: string;
    sourceCommit: string;
    startBlock: string;
    factoryRuntimeCodeHash: Hex;
    forwarderRuntimeCodeHash: Hex;
    memeHookRuntimeCodeHash: Hex;
    feeEscrowRuntimeCodeHash: Hex;
    buybackVaultRuntimeCodeHash: Hex;
    contracts: Record<"factory" | "forwarder" | "memeHook" | "feeEscrow" | "buybackVault", Address>;
  };
  receipts: Record<string, PinnedReceipt>;
}

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/robinhood-mainnet-receipts.json", import.meta.url), "utf8"),
) as PinnedFixture;

const FINALITY_DEPTH = 5_000;

type Verifier = (receipt: receipts.ReceiptLike, emitter: Address, ...rest: never[]) => unknown;

const verifiers: Record<string, (pinned: PinnedReceipt) => unknown> = {
  verifyLaunchReceipt: (p) => receipts.verifyLaunchReceipt(p.receipt, p.emitter, {
    forwarder: robinhoodMainnet.contracts.forwarder,
    openingBuy: {},
  }),
  verifyCurveBuyReceipt: (p) => receipts.verifyCurveBuyReceipt(p.receipt, p.emitter),
  verifyCurveSellReceipt: (p) => receipts.verifyCurveSellReceipt(p.receipt, p.emitter),
  verifyPoolGraduatedReceipt: (p) => receipts.verifyPoolGraduatedReceipt(p.receipt, p.emitter),
  verifyFeesSweptReceipt: (p) => receipts.verifyFeesSweptReceipt(p.receipt, p.emitter),
  verifyBuybackLockedReceipt: (p) => receipts.verifyBuybackLockedReceipt(p.receipt, p.emitter),
  verifyLaunchSweptReceipt: (p) => receipts.verifyLaunchSweptReceipt(p.receipt, p.emitter),
  verifyCreatorFeeRecipientUpdatedReceipt: (p) => receipts.verifyCreatorFeeRecipientUpdatedReceipt(p.receipt, p.emitter),
  verifyBuybackEnabledUpdatedReceipt: (p) => receipts.verifyBuybackEnabledUpdatedReceipt(p.receipt, p.emitter),
  verifyPoolFeesSweptReceipt: (p) => receipts.verifyPoolFeesSweptReceipt(p.receipt, p.emitter),
  verifyNativeFeesClaimedReceipt: (p) => receipts.verifyNativeFeesClaimedReceipt(p.receipt, p.emitter),
  verifyTokenFeesClaimedReceipt: (p) => receipts.verifyTokenFeesClaimedReceipt(p.receipt, p.emitter),
  verifyBuybackReleasedReceipt: (p) => receipts.verifyBuybackReleasedReceipt(p.receipt, p.emitter),
};

/** Evidence is stored with bigint fields as decimal strings. */
function stringifyEvidence(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, child) => (typeof child === "bigint" ? child.toString() : child)));
}

describe("pinned Robinhood Chain receipts", () => {
  it("were pinned against the deployment this SDK currently targets", () => {
    const d = fixture.deployment;
    expect(d.chainId).toBe(robinhoodMainnet.chainId);
    expect(d.abiRevision).toBe(robinhoodMainnet.abiRevision);
    expect(d.sourceCommit).toBe(robinhoodMainnet.sourceCommit);
    expect(BigInt(d.startBlock)).toBe(robinhoodMainnet.startBlock);
    expect(d.factoryRuntimeCodeHash).toBe(robinhoodMainnet.factoryRuntimeCodeHash);
    expect(d.forwarderRuntimeCodeHash).toBe(robinhoodMainnet.forwarderRuntimeCodeHash);
    expect(d.memeHookRuntimeCodeHash).toBe(robinhoodMainnet.memeHookRuntimeCodeHash);
    expect(d.feeEscrowRuntimeCodeHash).toBe(robinhoodMainnet.feeEscrowRuntimeCodeHash);
    expect(d.buybackVaultRuntimeCodeHash).toBe(robinhoodMainnet.buybackVaultRuntimeCodeHash);
    for (const [name, address] of Object.entries(d.contracts)) {
      expect(getAddress(address)).toBe(robinhoodMainnet.contracts[name as keyof typeof d.contracts]);
    }
  });

  it("covers every exported receipt verifier exactly once", () => {
    const exported = Object.keys(receipts).filter((name) => /^verify\w+Receipt$/.test(name)).sort();
    expect(Object.keys(fixture.receipts).sort()).toEqual(exported);
    expect(Object.keys(verifiers).sort()).toEqual(exported);
  });

  for (const [name, pinned] of Object.entries(fixture.receipts)) {
    describe(name, () => {
      it("is a finalized transaction after the deployment start block", () => {
        expect(pinned.blockNumber).toBeGreaterThanOrEqual(Number(robinhoodMainnet.startBlock));
        expect(pinned.blockNumber + FINALITY_DEPTH).toBeLessThanOrEqual(fixture.pinnedAtBlock);
        expect(pinned.receipt.status).toBe("0x1");
      });

      it("classifies the pinned receipt as matched with the recorded evidence", () => {
        const verify = verifiers[name];
        expect(verify, `no verifier binding for ${name}`).toBeDefined();
        const evidence = verify!(pinned);
        expect(stringifyEvidence(evidence)).toEqual(pinned.evidence);
      });

      it("rejects the same receipt when attributed to the wrong emitter", () => {
        const wrongEmitter = getAddress(`0x${"ee".repeat(20)}`);
        let caught: unknown;
        try {
          verifiers[name]!({ ...pinned, emitter: wrongEmitter });
        } catch (error) {
          caught = error;
        }
        expect(receipts.assertSuccessfulReceipt).toBeDefined();
        expect(caught).toMatchObject({ code: "EVENT_NOT_FOUND" });
      });
    });
  }

  it("pins a launch whose mined transaction decodes as the forwarder's launchAndBuy", () => {
    const launch = fixture.receipts.verifyLaunchReceipt!;
    expect(getAddress(launch.transaction.to)).toBe(robinhoodMainnet.contracts.forwarder);
    const decoded = decodeFunctionData({ abi: ponsForwarderAbi, data: launch.transaction.input });
    expect(decoded.functionName).toBe("launchAndBuy");
    expect(BigInt(launch.transaction.value)).toBeGreaterThan(0n);
  });
});

// Keep the Verifier alias referenced so the shape is documented for future bindings.
export type { Verifier };
