import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sdkRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const exampleRoot = resolve(sdkRoot, 'examples/envio');
const config = readFileSync(resolve(exampleRoot, 'config.yaml'), 'utf8');
const handler = readFileSync(resolve(exampleRoot, 'src/EventHandlers.ts'), 'utf8');
const readme = readFileSync(resolve(exampleRoot, 'README.md'), 'utf8');
const provenance = JSON.parse(readFileSync(resolve(sdkRoot, 'provenance/mainnet.json'), 'utf8'));

assert.match(
  config,
  /^handlers: \.\/src\/EventHandlers\.ts$/m,
  'Envio must load the packaged example handler instead of its src/handlers default',
);

const artifactContracts = [
  'PonsV2Factory',
  'PonsV2Curve',
  'PonsV2MemeHook',
  'PonsV2FeeEscrow',
  'PonsV2BuybackVault',
];

for (const contract of artifactContracts) {
  const artifact = JSON.parse(readFileSync(resolve(sdkRoot, `artifacts/${contract}.json`), 'utf8'));
  const events = artifact.filter((item) => item.type === 'event').map((item) => item.name);
  const section = config.match(new RegExp(
    `  - name: ${contract}\\n([\\s\\S]*?)(?=  - name: |\\nchains:)`,
  ))?.[0];
  assert.ok(section, `${contract} is missing from the global contract definitions`);
  assert.match(
    section,
    new RegExp(`abi_file_path: ./node_modules/@reptilianhq/pons-sdk/artifacts/${contract}\\.json`),
    `${contract} must use the published SDK artifact`,
  );
  for (const event of events) {
    assert.match(section, new RegExp(`- event: ${event}(?:\\n|$)`), `${contract}.${event} is missing`);
  }
}

const startBlock = provenance.startBlock;
assert.match(config, new RegExp(`start_block: ${startBlock}`));
const fixedAddresses = {
  factory: provenance.factory,
  memeHook: provenance.reviewedContracts.memeHook.address,
  feeEscrow: provenance.reviewedContracts.feeEscrow.address,
  buybackVault: provenance.reviewedContracts.buybackVault.address,
};
for (const [key, address] of Object.entries(fixedAddresses)) {
  assert.ok(
    config.includes(address.toLowerCase()),
    `Envio example is missing the SDK ${key} address`,
  );
}

assert.match(handler, /context\.chain\.PonsV2Curve\.add\(event\.params\.curve\)/);
assert.match(handler, /context\.chain\.PonsLaunchToken\.add\(event\.params\.token\)/);
assert.match(handler, /event\.params\.from\.toLowerCase\(\) !== ZERO_ADDRESS/);
assert.match(handler, /canonicalSupply: event\.params\.value/);
assert.match(readme, /full-supply ERC-20/);
assert.match(readme, /reorg rollback/);

const verificationRoot = mkdtempSync(resolve(tmpdir(), 'pons-envio-example-'));
try {
  cpSync(exampleRoot, verificationRoot, { recursive: true });
  const scopedModules = resolve(verificationRoot, 'node_modules/@reptilianhq');
  mkdirSync(scopedModules, { recursive: true });
  symlinkSync(sdkRoot, resolve(scopedModules, 'pons-sdk'), 'dir');
  symlinkSync(resolve(sdkRoot, 'node_modules/envio'), resolve(verificationRoot, 'node_modules/envio'), 'dir');

  run(resolve(sdkRoot, 'node_modules/.bin/envio'), ['codegen', '--directory', verificationRoot], {
    ...process.env,
    ENVIO_ROBINHOOD_MAINNET_RPC_URL: 'http://127.0.0.1:8545',
  });
  run(resolve(sdkRoot, 'node_modules/.bin/tsc'), [
    '--ignoreConfig',
    '--noEmit',
    '--strict',
    '--target', 'ES2022',
    '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext',
    '--skipLibCheck',
    resolve(verificationRoot, 'envio-env.d.ts'),
    resolve(verificationRoot, 'src/EventHandlers.ts'),
  ]);
} finally {
  rmSync(verificationRoot, { recursive: true, force: true });
}

console.log('Envio example matches reviewed Pons artifacts and passes Envio codegen/typecheck.');

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: sdkRoot, encoding: 'utf8', env });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`,
  );
}
