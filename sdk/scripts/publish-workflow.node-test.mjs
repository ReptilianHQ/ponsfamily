import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = parse(readFileSync(new URL("../../.github/workflows/sdk-release.yml", import.meta.url), "utf8"));
const requestWorkflow = parse(readFileSync(new URL("../../.github/workflows/sdk-release-request.yml", import.meta.url), "utf8"));

function stepIndex(job, name) {
  return job.steps.findIndex((step) => step.name === name);
}

test("separates unprivileged release requests from the trusted publisher", () => {
  assert.deepEqual(requestWorkflow.on.push.branches, ["release/v*"]);
  assert.deepEqual(requestWorkflow.on.push.tags, ["v*"]);
  assert.deepEqual(requestWorkflow.permissions, { contents: "read" });
  assert.deepEqual(workflow.permissions, { actions: "read", contents: "read" });
  assert.deepEqual(workflow.jobs.authorize.permissions, { actions: "read", contents: "read" });
  assert.equal(workflow.jobs.publish.needs, "authorize");
  assert.deepEqual(workflow.jobs.publish.permissions, { contents: "read", packages: "write" });
  assert.deepEqual(
    Object.entries(workflow.jobs)
      .filter(([, job]) => job.permissions?.packages === "write")
      .map(([name]) => name),
    ["publish"],
  );
});

test("fully authorizes the exact release ref before package-write execution", () => {
  const authorization = workflow.jobs.authorize.steps.find((step) => step.id === "authorize").run;
  const checks = [
    'test "$source_sha" = "$EVENT_SOURCE_SHA"',
    'ref_path="heads/${ref_name}"',
    'ref_path="tags/${ref_name}"',
    'git/ref/${ref_path}',
    'while [ "$object_type" = tag ]',
    'test "$object_type" = commit',
    'test "$remote_sha" = "$source_sha"',
    'compare/${source_sha}...${main_sha}',
    'test "$main_status" = ahead || test "$main_status" = identical',
  ];
  for (const check of checks) assert.ok(authorization.includes(check), `missing authorization check: ${check}`);
  assert.match(workflow.jobs.authorize.if, /head_repository\.full_name == github\.repository/u);
  assert.equal(workflow.jobs.publish.steps[0].with.ref, "${{ needs.authorize.outputs.source_sha }}");
});

test("validates provenance and immutable targets before publishing", () => {
  const publish = workflow.jobs.publish;
  assert.deepEqual(publish.concurrency, {
    group: "pons-sdk-publish",
    queue: "max",
    "cancel-in-progress": false,
  });
  assert.ok(stepIndex(publish, "Verify final release matches the published release candidate") < stepIndex(publish, "Publish to GitHub Packages"));
  assert.ok(stepIndex(publish, "Check for an existing immutable target version") < stepIndex(publish, "Publish to GitHub Packages"));
  assert.ok(stepIndex(publish, "Publish to GitHub Packages") < stepIndex(publish, "Publish or repair the selected install channel"));
  const releaseStep = publish.steps.find((step) => step.id === "release");
  assert.equal(releaseStep.env.RELEASE_SOURCE_SHA, "${{ needs.authorize.outputs.source_sha }}");
});
