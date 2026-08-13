import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ABI_REVISION } from "../dist/abis.js";
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
assert.deepEqual(factoryEvents.map(({ name }) => name), [
  "TokenLaunched",
  "LaunchSwept",
  "PoolGraduated",
  "LaunchGraduationRescued",
]);
assert.deepEqual(curveEvents.map(({ name }) => name), ["CurveBuy", "CurveSell", "FeesSwept", "BuybackLocked"]);
