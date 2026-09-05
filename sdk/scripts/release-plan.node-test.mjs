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
    { version: "0.1.0-rc.1", distTag: "rc" },
  );
});

test("increments only numbered RCs from the matching release line", () => {
  assert.deepEqual(
    createReleasePlan({
      refType: "branch",
      refName: "release/v0.1.0",
      packageVersion: "0.1.0",
      publishedVersions: ["0.1.0-rc", "0.1.0-rc.2", "0.1.1-rc.9"],
    }),
    { version: "0.1.0-rc.3", distTag: "rc" },
  );
});

test("reuses the highest numbered RC already published from the same source", () => {
  assert.deepEqual(
    createReleasePlan({
      refType: "branch",
      refName: "release/v0.1.0",
      packageVersion: "0.1.0",
      sourceSha: "accepted-source",
      publishedVersions: ["0.1.0-rc.1", "0.1.0-rc.2", "0.1.0-rc.3"],
      publishedCandidates: [
        { version: "0.1.0-rc.1", gitHead: "other-source" },
        { version: "0.1.0-rc.2", gitHead: "accepted-source" },
        { version: "0.1.0-rc.3", gitHead: "accepted-source" },
      ],
    }),
    { version: "0.1.0-rc.3", distTag: "rc" },
  );
});

test("refuses candidates after the stable version is published", () => {
  assert.throws(() => createReleasePlan({
    refType: "branch",
    refName: "release/v0.1.0",
    packageVersion: "0.1.0",
    publishedVersions: ["0.1.0-rc.2", "0.1.0"],
  }), /already published/);
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
