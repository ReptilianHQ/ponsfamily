import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ABI_REVISION, ponsCurveAbi, ponsFactoryAbi } from "../dist/abis.js";
import { robinhoodMainnet } from "../dist/deployments.js";

const provenance = JSON.parse(await readFile(new URL("../provenance/mainnet.json", import.meta.url), "utf8"));
const factoryEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2Factory.json", import.meta.url), "utf8"));
const curveEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2Curve.json", import.meta.url), "utf8"));
assert.equal(ABI_REVISION, "pons-v2-836f0f97");
assert.equal(robinhoodMainnet.chainId, provenance.chainId);
assert.equal(robinhoodMainnet.sourceCommit, provenance.sourceCommit);
assert.equal(robinhoodMainnet.contracts.factory.toLowerCase(), provenance.factory.toLowerCase());
assert.equal(robinhoodMainnet.startBlock, BigInt(provenance.startBlock));
assert.equal(robinhoodMainnet.factoryRuntimeCodeHash, provenance.factoryRuntimeCodeHash);
assert.equal(robinhoodMainnet.contracts.forwarder.toLowerCase(), provenance.forwarder.toLowerCase());
assert.equal(robinhoodMainnet.forwarderRuntimeCodeHash, provenance.forwarderRuntimeCodeHash);
assert.equal(provenance.forwarderSourceCommit, null, "Do not imply a public Git commit exists for the verified forwarder source");
const factoryEventNames = [
  "TokenLaunched",
  "LaunchSwept",
  "PoolGraduated",
  "LaunchGraduationRescued",
];
const curveEventNames = ["CurveBuy", "CurveSell", "FeesSwept", "BuybackLocked"];
assert.deepEqual(factoryEvents.map(canonicalEvent), selectEvents(ponsFactoryAbi, factoryEventNames));
assert.deepEqual(curveEvents.map(canonicalEvent), selectEvents(ponsCurveAbi, curveEventNames));

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
