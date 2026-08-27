import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const readme = await readFile(new URL("README.md", root), "utf8");
const releasing = await readFile(new URL("RELEASING.md", root), "utf8");
const changelog = await readFile(new URL("CHANGELOG.md", root), "utf8");
const workflow = await readFile(new URL("../.github/workflows/sdk-release.yml", root), "utf8");
const releaseProvenanceScript = "scripts/release-provenance.mjs";

export function stableVersionFromManifest(version) {
  const match = /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:-rc)?$/.exec(version);
  if (!match) {
    throw new Error(`SDK release docs require a stable or workflow-generated -rc version; received ${version}`);
  }
  return match[1];
}

const stableVersion = stableVersionFromManifest(packageJson.version);
assert.ok(
  readme.includes("@reptilianhq:registry=https://npm.pkg.github.com"),
  "README must configure the GitHub Packages registry before installation",
);
assert.ok(
  readme.includes("//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}"),
  "README must show environment-backed GitHub Packages authentication",
);
for (const channel of ["rc", "latest"]) {
  const install = `@reptilianhq/pons-sdk@${channel}`;
  assert.ok(readme.includes(install), `README must install the ${channel} channel with ${install}`);
  assert.ok(releasing.includes(install), `RELEASING.md must verify the ${channel} channel with ${install}`);
}
assert.ok(
  !readme.includes(`@reptilianhq/pons-sdk@${stableVersion}`),
  "README install commands must use dist-tags instead of an exact version that may not be published yet",
);
assert.ok(
  changelog.includes(`## ${stableVersion}`),
  `CHANGELOG.md must contain a section for package version ${stableVersion}`,
);
assert.ok(packageJson.files.includes("RELEASING.md"), "Published packages must include the release guide linked from README");
assert.ok(
  workflow.includes('rc_package="@reptilianhq/pons-sdk@${{ steps.release.outputs.version }}-rc"')
    && workflow.includes('npm view "$rc_package" gitHead')
    && workflow.includes(`${releaseProvenanceScript} "$GITHUB_SHA" "$rc_version" "$rc_git_head"`),
  "Stable releases must verify the immutable RC package provenance",
);
await access(new URL(releaseProvenanceScript, root));

console.log(`Release docs describe ${packageJson.version} through the rc and latest channels.`);
