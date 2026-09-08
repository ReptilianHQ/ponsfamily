import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generate } from './generate-indexing.mjs';

const sdkRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const exampleRoot = resolve(sdkRoot, 'examples/envio');
generate({ check: true });
const starter = JSON.parse(readFileSync(resolve(exampleRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(resolve(exampleRoot, 'package-lock.json'), 'utf8'));
for (const [name, version] of Object.entries(starter.devDependencies)) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.packages[`node_modules/${name}`].version, version);
}

const verificationRoot = mkdtempSync(resolve(tmpdir(), 'pons-envio-example-'));
try {
  cpSync(exampleRoot, verificationRoot, { recursive: true, filter: path => !path.includes('node_modules') && !path.includes('.envio') });
  mkdirSync(resolve(verificationRoot, 'node_modules'), { recursive: true });
  symlinkSync(resolve(exampleRoot, 'node_modules/envio'), resolve(verificationRoot, 'node_modules/envio'), 'dir');

  run(resolve(exampleRoot, 'node_modules/.bin/envio'), ['codegen', '--directory', verificationRoot], {
    ...process.env,
    ENVIO_ROBINHOOD_MAINNET_RPC_URL: 'http://127.0.0.1:8545',
  });
  run(resolve(exampleRoot, 'node_modules/.bin/tsc'), [
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

console.log('Envio example matches reviewed Pons artifacts and passes Envio codegen/typecheck.');

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: sdkRoot, encoding: 'utf8', env });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`,
  );
}
