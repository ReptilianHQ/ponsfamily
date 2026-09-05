import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/sdk-release.yml", import.meta.url), "utf8");
const requestWorkflow = readFileSync(new URL("../../.github/workflows/sdk-release-request.yml", import.meta.url), "utf8");

test("separates unprivileged release requests from the trusted publisher", () => {
  assert.match(requestWorkflow, /branches:\n {6}- "release\/v\*"/u);
  assert.match(requestWorkflow, /tags:\n {6}- "v\*"/u);
  assert.doesNotMatch(requestWorkflow, /packages: write/u);
  assert.match(workflow, /workflow_run:/u);
  assert.match(workflow, /needs: authorize/u);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/u);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/u);
  assert.match(workflow, /ref: \$\{\{ needs\.authorize\.outputs\.source_sha \}\}/u);
  assert.match(workflow, /concurrency:\n {6}group: pons-sdk-publish\n {6}queue: max\n {6}cancel-in-progress: false/u);
  assert.match(workflow, /node scripts\/release-provenance\.mjs "\$\{\{ needs\.authorize\.outputs\.source_sha \}\}"/u);
  assert.match(workflow, /npm dist-tag add/u);
  assert.ok(workflow.indexOf("id: authorize") < workflow.indexOf("packages: write"));
  assert.ok(workflow.indexOf("release-provenance.mjs") < workflow.indexOf("npm publish --access public"));
  assert.ok(workflow.indexOf("Check for an existing immutable target version") < workflow.indexOf("Publish to GitHub Packages"));
});
