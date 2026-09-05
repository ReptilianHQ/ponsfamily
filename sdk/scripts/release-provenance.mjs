import { appendFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const gitCommitRegex = /^[0-9a-f]{40}$/i;
const numericIdentifier = "(?:0|[1-9]\\d*)";
const coreVersionRegex = new RegExp(`^${numericIdentifier}\\.${numericIdentifier}\\.${numericIdentifier}$`);

export function releaseCandidateVersions(packageVersion, publishedVersions) {
  if (!coreVersionRegex.test(packageVersion)) {
    throw new Error(`Invalid stable package version: ${packageVersion}`);
  }
  const escapedVersion = packageVersion.replaceAll(".", "\\.");
  const candidateRegex = new RegExp(`^${escapedVersion}-rc\\.(${numericIdentifier})$`);
  return publishedVersions
    .map((version) => ({ version, match: candidateRegex.exec(version) }))
    .filter(({ match }) => match)
    .map(({ version, match }) => {
      const number = Number(match[1]);
      if (!Number.isSafeInteger(number)) throw new Error(`RC number is outside the safe integer range: ${version}`);
      return { version, number };
    })
    .sort((left, right) => right.number - left.number)
    .map(({ version }) => version);
}

export function assertStableReleaseProvenance({ packageVersion, tagSha, rcVersion, rcGitHead }) {
  if (!releaseCandidateVersions(packageVersion, [rcVersion]).includes(rcVersion)) {
    throw new Error(`Expected a published numbered RC for ${packageVersion}; received ${rcVersion || "missing"}`);
  }
  if (!gitCommitRegex.test(tagSha)) {
    throw new Error(`Stable tag SHA is invalid: ${tagSha || "missing"}`);
  }
  if (!gitCommitRegex.test(rcGitHead)) {
    throw new Error(`Published RC gitHead is invalid: ${rcGitHead || "missing"}`);
  }
  if (tagSha.toLowerCase() !== rcGitHead.toLowerCase()) {
    throw new Error(`Stable tag ${tagSha} does not match published RC commit ${rcGitHead}`);
  }
}

async function main() {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const [tagSha = ""] = process.argv.slice(2);
  const published = JSON.parse(execFileSync("npm", ["view", packageJson.name, "versions", "--json"], { encoding: "utf8" }));
  const versions = releaseCandidateVersions(packageJson.version, Array.isArray(published) ? published : [published]);
  let rcVersion = "";
  let rcGitHead = "";
  for (const version of versions) {
    const gitHead = execFileSync("npm", ["view", `${packageJson.name}@${version}`, "gitHead"], { encoding: "utf8" }).trim();
    if (gitHead.toLowerCase() === tagSha.toLowerCase()) {
      rcVersion = version;
      rcGitHead = gitHead;
      break;
    }
  }
  assertStableReleaseProvenance({
    packageVersion: packageJson.version,
    tagSha,
    rcVersion,
    rcGitHead,
  });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `rc_version=${rcVersion}\n`);
  }
  process.stdout.write(`Stable tag ${tagSha} matches published ${rcVersion}.\n`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
