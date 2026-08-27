import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const readme = await readFile(new URL("README.md", root), "utf8");
const releasing = await readFile(new URL("RELEASING.md", root), "utf8");
const changelog = await readFile(new URL("CHANGELOG.md", root), "utf8");

assert.match(packageJson.version, /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/);
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
  !readme.includes(`@reptilianhq/pons-sdk@${packageJson.version}`),
  "README install commands must use dist-tags instead of an exact version that may not be published yet",
);
assert.ok(
  changelog.includes(`## ${packageJson.version}`),
  `CHANGELOG.md must contain a section for package version ${packageJson.version}`,
);
assert.ok(packageJson.files.includes("RELEASING.md"), "Published packages must include the release guide linked from README");

console.log(`Release docs describe ${packageJson.version} through the rc and latest channels.`);
