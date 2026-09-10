import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ref = process.env.PONS_SDK_GIT_REF;
assert(ref, "PONS_SDK_GIT_REF is required");
assert.match(ref, /^[0-9a-f]{40}$/, "PONS_SDK_GIT_REF must be a full commit SHA");

const directory = await mkdtemp(join(tmpdir(), "pons-sdk-production-install-"));
try {
  await writeFile(join(directory, "package.json"), JSON.stringify({
    name: "pons-sdk-production-install-smoke",
    private: true,
    packageManager: "pnpm@11.9.0",
    type: "module",
    dependencies: {
      "@reptilianhq/pons-sdk": `github:ReptilianHQ/ponsfamily#${ref}&path:/sdk`,
      viem: "2.55.10",
    },
  }, null, 2));

  // The optional native keccak build is unnecessary for the SDK's ESM path.
  // Keep dependency builds disabled explicitly rather than relying on pnpm defaults.
  const sdk = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  await writeFile(join(directory, 'pnpm-workspace.yaml'), [
    'allowBuilds:', '  keccak: false', 'strictDepBuilds: true',
    'minimumReleaseAgeExclude:',
    `  - '@reptilianhq/uniswap-sdk@${sdk.dependencies['@reptilianhq/uniswap-sdk']}'`, '',
  ].join('\n'));

  const install = spawnSync("corepack", ["pnpm", "install", "--prod"], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });
  assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);

  const manifest = JSON.parse(await readFile(join(
    directory,
    "node_modules/@reptilianhq/pons-sdk/package.json",
  ), "utf8"));
  for (const lifecycle of ["preinstall", "install", "postinstall", "prepare", "prepack"]) {
    assert.equal(manifest.scripts?.[lifecycle], undefined, `${lifecycle} must not run for Git installs`);
  }

  const runtime = spawnSync("node", ["--input-type=module", "--eval", [
    "import { verifyCurveBuyReceipt } from '@reptilianhq/pons-sdk';",
    "import { getPonsV4Provider } from '@reptilianhq/pons-sdk/v4-provider';",
    "if (getPonsV4Provider().providerId !== 'pons') process.exit(1);",
    "if (typeof verifyCurveBuyReceipt !== 'function') process.exit(1);",
  ].join("\n")], { cwd: directory, encoding: "utf8" });
  assert.equal(runtime.status, 0, `${runtime.stdout}\n${runtime.stderr}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
