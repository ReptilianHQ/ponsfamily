import assert from "node:assert/strict";
import test from "node:test";

import { createReleasePlan } from "./release-plan.mjs";

test("plans an RC from the matching release branch", () => {
  assert.deepEqual(
    createReleasePlan({
      refType: "branch",
      refName: "release/v0.1.0",
      packageVersion: "0.1.0",
    }),
    { version: "0.1.0-rc", distTag: "rc" },
  );
});

test("plans a final release from the matching stable tag", () => {
  assert.deepEqual(
    createReleasePlan({ refType: "tag", refName: "v0.1.0", packageVersion: "0.1.0" }),
    { version: "0.1.0", distTag: "latest" },
  );
});

for (const candidate of [
  { refType: "branch", refName: "release/v0.1.1", packageVersion: "0.1.0" },
  { refType: "branch", refName: "release/v0.1.0-rc", packageVersion: "0.1.0" },
  { refType: "tag", refName: "v0.1.0-rc", packageVersion: "0.1.0" },
  { refType: "tag", refName: "sdk-v0.1.0", packageVersion: "0.1.0" },
  { refType: "tag", refName: "v0.1.1", packageVersion: "0.1.0" },
  { refType: "tag", refName: "v0.1.0", packageVersion: "0.1.0-rc" },
]) {
  test(`rejects invalid release input ${JSON.stringify(candidate)}`, () => {
    assert.throws(() => createReleasePlan(candidate));
  });
}
