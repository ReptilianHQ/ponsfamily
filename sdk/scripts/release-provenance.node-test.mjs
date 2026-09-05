import assert from "node:assert/strict";
import test from "node:test";

import { assertStableReleaseProvenance, releaseCandidateVersions } from "./release-provenance.mjs";

const rcCommit = "a".repeat(40);
const movedBranchCommit = "b".repeat(40);

test("orders only matching numbered RCs from newest to oldest", () => {
  assert.deepEqual(
    releaseCandidateVersions("0.1.0", ["0.1.0-rc", "0.1.0-rc.2", "0.1.0-rc.10", "0.2.0-rc.20"]),
    ["0.1.0-rc.10", "0.1.0-rc.2"],
  );
});

test("accepts a stable tag on the commit recorded by the published RC", () => {
  assert.doesNotThrow(() => assertStableReleaseProvenance({
    packageVersion: "0.1.0",
    tagSha: rcCommit,
    rcVersion: "0.1.0-rc.2",
    rcGitHead: rcCommit,
  }));
});

test("rejects a tag on a release branch moved after RC publication", () => {
  assert.throws(() => assertStableReleaseProvenance({
    packageVersion: "0.1.0",
    tagSha: movedBranchCommit,
    rcVersion: "0.1.0-rc.2",
    rcGitHead: rcCommit,
  }), /does not match published RC commit/);
});

test("rejects stable publication before the matching RC exists", () => {
  assert.throws(() => assertStableReleaseProvenance({
    packageVersion: "0.1.0",
    tagSha: rcCommit,
    rcVersion: "",
    rcGitHead: "",
  }), /Expected a published numbered RC/);
});

test("rejects malformed package provenance", () => {
  assert.throws(() => assertStableReleaseProvenance({
    packageVersion: "0.1.0",
    tagSha: rcCommit,
    rcVersion: "0.1.0-rc.2",
    rcGitHead: "not-a-commit",
  }), /gitHead is invalid/);
});
