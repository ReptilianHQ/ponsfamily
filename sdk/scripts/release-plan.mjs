import { appendFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const numericIdentifier = "(?:0|[1-9]\\d*)";
const coreVersionPattern = `${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}`;
const coreVersionRegex = new RegExp(`^${coreVersionPattern}$`);
const releaseBranchRegex = new RegExp(`^release/v(${coreVersionPattern})$`);

export function nextReleaseCandidateVersion(packageVersion, publishedVersions) {
  if (!coreVersionRegex.test(packageVersion)) {
    throw new Error(`Cannot derive an RC from invalid stable version ${packageVersion}`);
  }
  if (publishedVersions.includes(packageVersion)) {
    throw new Error(`Stable version ${packageVersion} is already published; prepare a new release line`);
  }
  const escapedVersion = packageVersion.replaceAll(".", "\\.");
  const candidateRegex = new RegExp(`^${escapedVersion}-rc\\.(${numericIdentifier})$`);
  let highest = 0;
  for (const version of publishedVersions) {
    const match = candidateRegex.exec(version);
    if (!match) continue;
    const number = Number(match[1]);
    if (!Number.isSafeInteger(number)) {
      throw new Error(`RC number is outside the safe integer range: ${version}`);
    }
    highest = Math.max(highest, number);
  }
  if (highest === Number.MAX_SAFE_INTEGER) {
    throw new Error(`RC number is exhausted for ${packageVersion}`);
  }
  return `${packageVersion}-rc.${highest + 1}`;
}

export function existingReleaseCandidateVersion(packageVersion, publishedCandidates, sourceSha) {
  const escapedVersion = packageVersion.replaceAll(".", "\\.");
  const candidateRegex = new RegExp(`^${escapedVersion}-rc\\.(${numericIdentifier})$`);
  return publishedCandidates
    .filter(({ version, gitHead }) => gitHead === sourceSha && candidateRegex.test(version))
    .sort((left, right) => Number(candidateRegex.exec(right.version)[1]) - Number(candidateRegex.exec(left.version)[1]))
    .at(0)?.version;
}

export function createReleasePlan({
  refType,
  refName,
  packageVersion,
  publishedVersions = [],
  publishedCandidates = [],
  sourceSha,
}) {
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
    if (publishedVersions.includes(packageVersion)) {
      throw new Error(`Stable version ${packageVersion} is already published; prepare a new release line`);
    }
    const existingVersion = existingReleaseCandidateVersion(packageVersion, publishedCandidates, sourceSha);
    return {
      version: existingVersion ?? nextReleaseCandidateVersion(packageVersion, publishedVersions),
      distTag: "rc",
    };
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
  const publishedVersions = process.env.GITHUB_REF_TYPE === "branch"
    ? JSON.parse(execFileSync("npm", ["view", packageJson.name, "versions", "--json"], { encoding: "utf8" }))
    : [];
  const versions = Array.isArray(publishedVersions) ? publishedVersions : [publishedVersions];
  const candidatePrefix = `${packageJson.version}-rc.`;
  const publishedCandidates = process.env.GITHUB_REF_TYPE === "branch"
    ? versions.filter((version) => version.startsWith(candidatePrefix)).map((version) => ({
        version,
        gitHead: execFileSync("npm", ["view", `${packageJson.name}@${version}`, "gitHead"], { encoding: "utf8" }).trim(),
      }))
    : [];
  const plan = createReleasePlan({
    refType: process.env.GITHUB_REF_TYPE,
    refName: process.env.GITHUB_REF_NAME,
    packageVersion: packageJson.version,
    publishedVersions: versions,
    publishedCandidates,
    sourceSha: process.env.RELEASE_SOURCE_SHA,
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
