import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ABI_REVISION, ponsBuybackVaultAbi, ponsCurveAbi, ponsFactoryAbi, ponsFeeEscrowAbi, ponsMemeHookAbi } from "../dist/abis.js";
import { robinhoodMainnet } from "../dist/deployments.js";

const provenance = JSON.parse(await readFile(new URL("../provenance/mainnet.json", import.meta.url), "utf8"));
const factoryEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2Factory.json", import.meta.url), "utf8"));
const curveEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2Curve.json", import.meta.url), "utf8"));
const hookEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2MemeHook.json", import.meta.url), "utf8"));
const escrowEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2FeeEscrow.json", import.meta.url), "utf8"));
const vaultEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2BuybackVault.json", import.meta.url), "utf8"));
assert.equal(ABI_REVISION, "pons-v2-836f0f97");
assert.equal(robinhoodMainnet.chainId, provenance.chainId);
assert.equal(robinhoodMainnet.sourceCommit, provenance.sourceCommit);
assert.equal(robinhoodMainnet.contracts.factory.toLowerCase(), provenance.factory.toLowerCase());
assert.equal(robinhoodMainnet.startBlock, BigInt(provenance.startBlock));
assert.equal(robinhoodMainnet.factoryRuntimeCodeHash, provenance.factoryRuntimeCodeHash);
assert.equal(robinhoodMainnet.contracts.forwarder.toLowerCase(), provenance.forwarder.toLowerCase());
assert.equal(robinhoodMainnet.forwarderRuntimeCodeHash, provenance.forwarderRuntimeCodeHash);
assert.equal(provenance.forwarderSourceCommit, null, "Do not imply a public Git commit exists for the verified forwarder source");
for (const [name, artifact] of [
  ["memeHook", "PonsV2MemeHook.json"],
  ["feeEscrow", "PonsV2FeeEscrow.json"],
  ["buybackVault", "PonsV2BuybackVault.json"],
]) {
  assert.equal(robinhoodMainnet.contracts[name].toLowerCase(), provenance.reviewedContracts[name].address.toLowerCase());
  assert.equal(provenance.reviewedContracts[name].artifact, artifact);
  assert.equal(robinhoodMainnet[`${name}RuntimeCodeHash`], provenance.reviewedContracts[name].runtimeCodeHash);
  assert.match(provenance.reviewedContracts[name].verifiedSourceUrl, /^https:\/\/robinhoodchain\.blockscout\.com\/address\/0x[0-9a-fA-F]{40}\?tab=contract$/);
}
const factoryEventNames = [
  "TokenLaunched",
  "LaunchSwept",
  "CreatorFeeRecipientUpdated",
  "BuybackEnabledUpdated",
  "PoolGraduated",
  "LaunchGraduationRescued",
];
const curveEventNames = ["CurveBuy", "CurveSell", "FeesSwept", "BuybackLocked"];
assert.deepEqual(factoryEvents.map(canonicalEvent), selectEvents(ponsFactoryAbi, factoryEventNames));
assert.deepEqual(curveEvents.map(canonicalEvent), selectEvents(ponsCurveAbi, curveEventNames));
assert.deepEqual(hookEvents.map(canonicalEvent), selectEvents(ponsMemeHookAbi, ["HookFeeCollected", "PoolFeesSwept", "PoolFeesRescued"]));
assert.deepEqual(escrowEvents.map(canonicalEvent), selectEvents(ponsFeeEscrowAbi, ["Claimed", "ClaimedToken", "Credited", "CreditedToken"]));
assert.deepEqual(vaultEvents.map(canonicalEvent), selectEvents(ponsBuybackVaultAbi, ["Locked", "Released", "CreatorRecipientUpdated"]));

function selectEvents(abi, names) {
  return names.map((name) => {
    const event = abi.find((item) => item.type === "event" && item.name === name);
    assert.ok(event, `Missing ${name} from exported ABI`);
    return canonicalEvent(event);
  });
}

function canonicalEvent(event) {
  return {
    name: event.name,
    anonymous: event.anonymous ?? false,
    inputs: event.inputs.map(({ name, type, indexed }) => ({ name, type, indexed: indexed ?? false })),
  };
}
