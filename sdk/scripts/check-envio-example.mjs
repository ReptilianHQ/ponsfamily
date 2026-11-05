import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getPonsV4Provider } from '../dist/v4-provider.js';
import { getV4PoolId } from '@reptilianhq/uniswap-sdk/v4';
import { generate } from './generate-indexing.mjs';

const sdkRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const exampleRoot = resolve(sdkRoot, 'examples/envio');
// Optional probe: `--envio <version>` runs the same codegen and type-check against
// another Envio version. It is informational, never part of check or release, and
// does not make that version supported.
// pnpm forwards a literal `--` ahead of the flag; drop one if present.
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
assert.ok(
  args.length === 0 || (args.length === 2 && args[0] === '--envio'),
  'usage: check-envio-example.mjs [--envio <version>]',
);
const probeVersion = args[1];
assert.ok(
  probeVersion === undefined || /^\d+\.\d+\.\d+$/.test(probeVersion),
  '--envio needs an exact version such as 3.15.0',
);
generate({ check: true });
const starter = JSON.parse(readFileSync(resolve(exampleRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve(exampleRoot, 'package-lock.json'), 'utf8'));
for (const [name, version] of Object.entries(probeVersion ? {} : starter.devDependencies)) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.packages[`node_modules/${name}`].version, version);
}

const provider = getPonsV4Provider();
const key = { currency0: '0x0000000000000000000000000000000000000000', currency1: '0x1111111111111111111111111111111111111111', fee: 10000, tickSpacing: 200, hooks: provider.hooks[0] };
const selected = { providerId: provider.providerId, deploymentId: provider.deploymentId, chainId: provider.chainId, poolManager: provider.poolManager, key, poolId: getV4PoolId(key), membership: { sourceAddress: provider.discovery.address, eventSignature: provider.discovery.eventSignature, blockNumber: provider.startBlock, blockHash: `0x${'12'.repeat(32)}`, transactionHash: `0x${'34'.repeat(32)}`, logIndex: 0 } };
const toolRoot = probeVersion ? installProbe(starter, probeVersion) : exampleRoot;
if (probeVersion) process.on('exit', () => rmSync(toolRoot, { recursive: true, force: true }));
for (const poolSelection of [[], [selected]]) {
  const verificationRoot = mkdtempSync(resolve(tmpdir(), 'pons-envio-example-'));
  try {
    cpSync(exampleRoot, verificationRoot, { recursive: true, filter: path => !path.includes('node_modules') && !path.includes('.envio') });
    generate({ directory: verificationRoot, poolSelection });
    // Generator paths include examples/envio; copy that variant into the verification root.
    cpSync(resolve(verificationRoot, 'examples/envio'), verificationRoot, { recursive: true });
    mkdirSync(resolve(verificationRoot, 'node_modules'), { recursive: true });
    symlinkSync(resolve(toolRoot, 'node_modules/envio'), resolve(verificationRoot, 'node_modules/envio'), 'dir');

    run(resolve(toolRoot, 'node_modules/.bin/envio'), ['codegen', '--directory', verificationRoot], {
      ...process.env,
      ENVIO_ROBINHOOD_MAINNET_RPC_URL: 'http://127.0.0.1:8545',
    });
    run(resolve(toolRoot, 'node_modules/.bin/tsc'), [
      '--ignoreConfig',
      '--noEmit',
      '--strict',
      '--target', 'ES2022',
      '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext',
      '--skipLibCheck',
      resolve(verificationRoot, 'envio-env.d.ts'),
      resolve(verificationRoot, 'src/EventHandlers.ts'),
      resolve(verificationRoot, 'src/eventLog.ts'),
    ]);
  } finally {
    rmSync(verificationRoot, { recursive: true, force: true });
  }

}

if (probeVersion) {
  console.log(`Probe passed: ${probeVersion} ran codegen and the type-check. Informational only; the starter is verified at its pin.`);
}
if (!probeVersion) console.log('Empty and selected Envio examples match reviewed Pons artifacts and pass Envio codegen/typecheck.');

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: sdkRoot, encoding: 'utf8', env });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`,
  );
}

// The probe reuses the starter's exact devDependencies (including its TypeScript pin)
// and overrides only envio, so the type-check stays comparable across versions.
function installProbe(starter, version) {
  const dir = mkdtempSync(resolve(tmpdir(), 'envio-probe-'));
  writeFileSync(
    resolve(dir, 'package.json'),
    JSON.stringify({ private: true, devDependencies: { ...starter.devDependencies, envio: version } }),
  );
  try {
    const result = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, `npm install of envio@${version} failed:\n${result.stdout}${result.stderr}`);
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return dir;
}
