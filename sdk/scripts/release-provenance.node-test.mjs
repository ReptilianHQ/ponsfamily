import assert from "node:assert/strict";
import test from "node:test";

import { assertStableReleaseProvenance } from "./release-provenance.mjs";

const rcCommit = "a".repeat(40);
const movedBranchCommit = "b".repeat(40);

test("accepts a stable tag on the commit recorded by the published RC", () => {
  assert.doesNotThrow(() => assertStableReleaseProvenance({
    packageVersion: "0.1.0",
    tagSha: rcCommit,
    rcVersion: "0.1.0-rc",
    rcGitHead: rcCommit,
  }));
});

test("rejects a tag on a release branch moved after RC publication", () => {
  assert.throws(() => assertStableReleaseProvenance({
    packageVersion: "0.1.0",
    tagSha: movedBranchCommit,
    rcVersion: "0.1.0-rc",
    rcGitHead: rcCommit,
  }), /does not match published RC commit/);
});

test("rejects stable publication before the matching RC exists", () => {
  assert.throws(() => assertStableReleaseProvenance({
    packageVersion: "0.1.0",
    tagSha: rcCommit,
    rcVersion: "",
    rcGitHead: "",
  }), /Expected published RC/);
});

test("rejects malformed package provenance", () => {
  assert.throws(() => assertStableReleaseProvenance({
    packageVersion: "0.1.0",
    tagSha: rcCommit,
    rcVersion: "0.1.0-rc",
    rcGitHead: "not-a-commit",
  }), /gitHead is invalid/);
});
