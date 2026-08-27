import { appendFile, readFile } from "node:fs/promises";

const numericIdentifier = "(?:0|[1-9]\\d*)";
const coreVersionPattern = `${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}`;
const coreVersionRegex = new RegExp(`^${coreVersionPattern}$`);
const releaseBranchRegex = new RegExp(`^release/v(${coreVersionPattern})$`);

export function createReleasePlan({ refType, refName, packageVersion }) {
  if (!coreVersionRegex.test(packageVersion)) {
    throw new Error(`sdk/package.json must contain a stable semantic version; received ${packageVersion}`);
  }

  if (refType === "branch") {
    const match = releaseBranchRegex.exec(refName);
    if (!match) {
      throw new Error(`RC releases require a release/vX.Y.Z branch; received ${refName}`);
    }
    if (match[1] !== packageVersion) {
      throw new Error(`RC branch version ${match[1]} does not match package version ${packageVersion}`);
    }
    return { version: `${packageVersion}-rc`, distTag: "rc" };
  }

  if (refType === "tag") {
    const expectedTag = `v${packageVersion}`;
    if (refName !== expectedTag) {
      throw new Error(`Final release tag must be ${expectedTag}; received ${refName}`);
    }
    return { version: packageVersion, distTag: "latest" };
  }

  throw new Error(`Unsupported Git ref type: ${refType}`);
}

async function main() {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const plan = createReleasePlan({
    refType: process.env.GITHUB_REF_TYPE,
    refName: process.env.GITHUB_REF_NAME,
    packageVersion: packageJson.version,
  });
  const output = `version=${plan.version}\ndist_tag=${plan.distTag}\n`;

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, output);
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
