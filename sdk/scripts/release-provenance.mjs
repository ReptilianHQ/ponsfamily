import { readFile } from "node:fs/promises";

const gitCommitRegex = /^[0-9a-f]{40}$/i;

export function assertStableReleaseProvenance({ packageVersion, tagSha, rcVersion, rcGitHead }) {
  const expectedRcVersion = `${packageVersion}-rc`;
  if (rcVersion !== expectedRcVersion) {
    throw new Error(`Expected published RC ${expectedRcVersion}; received ${rcVersion || "missing"}`);
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
  const [tagSha = "", rcVersion = "", rcGitHead = ""] = process.argv.slice(2);
  assertStableReleaseProvenance({
    packageVersion: packageJson.version,
    tagSha,
    rcVersion,
    rcGitHead,
  });
  process.stdout.write(`Stable tag ${tagSha} matches published ${rcVersion}.\n`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  await main();
}
