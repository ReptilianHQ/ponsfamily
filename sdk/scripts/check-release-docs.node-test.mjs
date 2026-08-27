import assert from "node:assert/strict";
import test from "node:test";

import { stableVersionFromManifest } from "./check-release-docs.mjs";

test("accepts a stable source manifest", () => {
  assert.equal(stableVersionFromManifest("0.1.1"), "0.1.1");
});

test("resolves the workflow-generated RC manifest to its stable release line", () => {
  assert.equal(stableVersionFromManifest("0.1.1-rc"), "0.1.1");
});

for (const version of ["0.1.1-rc.1", "0.1.1-beta", "v0.1.1", "01.1.1"]) {
  test(`rejects unsupported manifest version ${version}`, () => {
    assert.throws(() => stableVersionFromManifest(version));
  });
}
