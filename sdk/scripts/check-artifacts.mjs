import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ABI_REVISION, ponsBuybackVaultAbi, ponsCurveAbi, ponsFactoryAbi, ponsFeeEscrowAbi, ponsMemeHookAbi, ponsTokenAbi } from "../dist/abis.js";
import { robinhoodMainnet } from "../dist/deployments.js";
import { getPonsIndexingManifest } from "../dist/indexing.js";

const provenance = JSON.parse(await readFile(new URL("../provenance/mainnet.json", import.meta.url), "utf8"));
const factoryEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2Factory.json", import.meta.url), "utf8"));
const curveEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2Curve.json", import.meta.url), "utf8"));
const hookEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2MemeHook.json", import.meta.url), "utf8"));
const escrowEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2FeeEscrow.json", import.meta.url), "utf8"));
const vaultEvents = JSON.parse(await readFile(new URL("../artifacts/PonsV2BuybackVault.json", import.meta.url), "utf8"));
const tokenEvents = JSON.parse(await readFile(new URL("../artifacts/PonsLaunchToken.json", import.meta.url), "utf8"));
const poolManagerEvents = JSON.parse(await readFile(new URL("../artifacts/UniswapV4PoolManager.json", import.meta.url), "utf8"));
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
const curveEventNames = ["CurveBuy", "CurveBuyRefunded", "CurveSell", "FeesSwept", "BuybackLocked", "CurveCompleted"];
assert.deepEqual(factoryEvents.map(canonicalEvent), selectEvents(ponsFactoryAbi, factoryEventNames));
assert.deepEqual(curveEvents.map(canonicalEvent), selectEvents(ponsCurveAbi, curveEventNames));
assert.deepEqual(hookEvents.map(canonicalEvent), selectEvents(ponsMemeHookAbi, ["PoolRegistered", "ProtocolFeeRecipientUpdated", "HookFeeCollected", "PoolFeesSwept", "PoolFeesRescued"]));
assert.deepEqual(escrowEvents.map(canonicalEvent), selectEvents(ponsFeeEscrowAbi, ["Claimed", "ClaimedToken", "Credited", "CreditedToken"]));
assert.deepEqual(vaultEvents.map(canonicalEvent), selectEvents(ponsBuybackVaultAbi, ["Locked", "Released", "CreatorRecipientUpdated"]));
assert.deepEqual(tokenEvents.map(canonicalEvent), selectEvents(ponsTokenAbi, ["Transfer"]));
assert.deepEqual(poolManagerEvents.map(canonicalEvent), [{
  name: "Initialize",
  anonymous: false,
  inputs: [
    { name: "id", type: "bytes32", indexed: true },
    { name: "currency0", type: "address", indexed: true },
    { name: "currency1", type: "address", indexed: true },
    { name: "fee", type: "uint24", indexed: false },
    { name: "tickSpacing", type: "int24", indexed: false },
    { name: "hooks", type: "address", indexed: false },
    { name: "sqrtPriceX96", type: "uint160", indexed: false },
    { name: "tick", type: "int24", indexed: false },
  ],
}, {
  name: "Swap",
  anonymous: false,
  inputs: [
    { name: "id", type: "bytes32", indexed: true },
    { name: "sender", type: "address", indexed: true },
    { name: "amount0", type: "int128", indexed: false },
    { name: "amount1", type: "int128", indexed: false },
    { name: "sqrtPriceX96", type: "uint160", indexed: false },
    { name: "liquidity", type: "uint128", indexed: false },
    { name: "tick", type: "int24", indexed: false },
    { name: "fee", type: "uint24", indexed: false },
  ],
}]);

const manifest = getPonsIndexingManifest(robinhoodMainnet.chainId);
assert.equal(manifest.abiRevision, ABI_REVISION);
for (const contract of manifest.contracts) {
  const artifact = JSON.parse(await readFile(new URL(`../artifacts/${contract.name}.json`, import.meta.url), "utf8"));
  assert.deepEqual(
    artifact.map((event) => event.name),
    [...contract.events],
    `${contract.name} manifest events must match its artifact`,
  );
}

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
