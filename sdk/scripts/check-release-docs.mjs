import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const readme = await readFile(new URL("README.md", root), "utf8");
const releasing = await readFile(new URL("RELEASING.md", root), "utf8");
const changelog = await readFile(new URL("CHANGELOG.md", root), "utf8");
const workflow = await readFile(new URL("../.github/workflows/sdk-release.yml", root), "utf8");
const releaseProvenanceScript = "scripts/release-provenance.mjs";
const trustedPublisher = "${GITHUB_WORKSPACE}/.release-tools/sdk/scripts/artifacts/sdk-publish.mjs";

export function stableVersionFromManifest(version) {
  const match = /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:-rc\.(?:0|[1-9]\d*))?$/.exec(version);
  if (!match) {
    throw new Error(`SDK release docs require a stable or workflow-generated -rc.N version; received ${version}`);
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
  workflow.includes(`${releaseProvenanceScript} "\${{ needs.authorize.outputs.source_sha }}"`)
    && workflow.includes("needs.authorize.outputs.ref_type == 'branch'")
    && workflow.includes('ref: main')
    && workflow.includes('path: .release-tools')
    && workflow.includes('sdk/scripts/artifacts')
    && workflow.includes(trustedPublisher)
    && workflow.includes('npm install --global npm@11.5.2')
    && workflow.includes('prepare "${RUNNER_TEMP}/sdk-release"')
    && workflow.includes('publish "${RUNNER_TEMP}/sdk-release"')
    && workflow.includes('RELEASE_SOURCE_SHA: ${{ needs.authorize.outputs.source_sha }}')
    && workflow.includes('RELEASE_DIST_TAG: ${{ steps.release.outputs.dist_tag }}')
    && workflow.includes('pons-sdk-publish-${{ github.run_id }}-${{ github.run_attempt }}')
    && workflow.includes('path: ${{ runner.temp }}/sdk-release')
    && workflow.includes('actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f'),
  "Stable releases must verify the immutable RC package provenance",
);
assert.ok(!workflow.includes('npm publish --access public --tag'), "The trusted publisher must publish the prepared tarball");
assert.ok(!workflow.includes('npm dist-tag add'), "The trusted publisher must guard channel repair");
await access(new URL(releaseProvenanceScript, root));

console.log(`Release docs describe ${packageJson.version} through the rc and latest channels.`);
