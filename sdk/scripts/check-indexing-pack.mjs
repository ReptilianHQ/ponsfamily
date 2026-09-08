import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const temp = mkdtempSync(resolve(tmpdir(), 'pons-packed-indexing-'));
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr); return result.stdout;
}
try {
  const [pack] = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temp]));
  assert.ok(!pack.files.some(f => f.path.startsWith('examples/')));
  assert.ok(pack.files.some(f => f.path === 'indexing/mainnet.json'));
  const scoped = resolve(temp, 'node_modules/@reptilianhq'); mkdirSync(scoped, { recursive: true });
  run('tar', ['-xzf', resolve(temp, pack.filename), '-C', scoped]);
  run('mv', ['package', 'pons-sdk'], scoped);
  symlinkSync(resolve(root, 'node_modules/viem'), resolve(temp, 'node_modules/viem'), 'dir');
  run('node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import manifest from '@reptilianhq/pons-sdk/indexing/mainnet.json' with { type: 'json' };
    import { getPonsIndexingManifest } from '@reptilianhq/pons-sdk/indexing';
    assert.deepEqual(manifest, JSON.parse(JSON.stringify(getPonsIndexingManifest(), (_, v) => typeof v === 'bigint' ? String(v) : v)));
    for (const contract of [...manifest.contracts, ...manifest.dependencies]) {
      const { default: abi } = await import(contract.artifact, { with: { type: 'json' } });
      for (const name of contract.events) assert(abi.some(e => e.name === name));
    }
  `], temp);
  console.log('Packed indexing exports resolve; Envio starter stays repo-local.');
} finally { rmSync(temp, { recursive: true, force: true }); }
