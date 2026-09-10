import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { getPonsIndexingManifest } from '../dist/indexing.js';
import { generate, renderIndexing, validateCatalog } from './generate-indexing.mjs';

test('deterministic generation detects changed, missing and obsolete outputs without writing', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'pons-generation-'));
  try {
    assert.deepEqual(renderIndexing(), renderIndexing());
    generate({ directory });
    generate({ directory, check: true });
    const example = resolve(directory, 'examples/envio');
    const config = parse(readFileSync(resolve(example, 'config.yaml'), 'utf8'));
    // Envio appends its recursive module glob to this directory. A file path
    // passes codegen but discovers zero runtime handlers.
    const handlerFiles = globSync(`./${config.handlers}/**/*.{js,mjs,ts}`, { cwd: example });
    assert.ok(handlerFiles.some(path => path.endsWith('EventHandlers.ts')),
      'Envio runtime discovery must load the generated event registrations');
    for (const path of ['indexing/mainnet.json', 'artifacts/PonsV2Factory.json', 'examples/envio/config.yaml', 'examples/envio/schema.graphql', 'examples/envio/src/EventHandlers.ts', 'examples/envio/src/eventLog.ts']) {
      writeFileSync(resolve(directory, path), 'stale');
      assert.throws(() => generate({ directory, check: true }), /Indexing output drift/);
      assert.equal(readFileSync(resolve(directory, path), 'utf8'), 'stale');
      generate({ directory });
    }
    rmSync(resolve(directory, 'examples/envio/schema.graphql'));
    assert.throws(() => generate({ directory, check: true }), /Indexing output drift/);
    generate({ directory });
    writeFileSync(resolve(directory, 'examples/envio/src/removedHandler.ts'), 'obsolete');
    assert.throws(() => generate({ directory, check: true }), /Indexing output drift/);
    generate({ directory });
    generate({ directory, check: true });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('coverage, metadata, discovery and materialization references fail closed', () => {
  const original = getPonsIndexingManifest();
  for (const mutate of [
    m => m.catalog.pop(),
    m => { m.catalog[0].parameters[0].name = 'missing'; },
    m => { m.catalog[0].description = ''; },
    m => { m.sources.find(s => s.kind === 'dynamic').registeredBy.addressParameter = 'missing'; },
    m => { m.materializations[0].updates[0].set.curve.parameter = 'missing'; },
    m => { m.dependencies[0].filters[0].parameter = 'missing'; },
  ]) {
    const manifest = structuredClone(original); mutate(manifest);
    assert.throws(() => validateCatalog(manifest));
  }
});

test('shared manager ingestion is disabled by default and bounded by selected pool ids', async () => {
  const { getV4PoolId } = await import('@reptilianhq/uniswap-sdk/v4');
  const manifest = getPonsIndexingManifest();
  const provider = manifest.composition;
  const key = { currency0: '0x0000000000000000000000000000000000000000', currency1: '0x1111111111111111111111111111111111111111', fee: 10000, tickSpacing: 200, hooks: provider.hooks[0] };
  const pool = { providerId: provider.providerId, deploymentId: provider.deploymentId, chainId: provider.chainId, poolManager: provider.poolManager, key, poolId: getV4PoolId(key), membership: { sourceAddress: provider.discovery.address, eventSignature: provider.discovery.eventSignature, blockNumber: provider.startBlock, blockHash: `0x${'12'.repeat(32)}`, transactionHash: `0x${'34'.repeat(32)}`, logIndex: 0 } };
  const empty = renderIndexing();
  assert.ok(!empty.get('examples/envio/config.yaml').toLowerCase().includes(provider.poolManager.toLowerCase()));
  assert.match(empty.get('examples/envio/src/EventHandlers.ts'), /where: \(\) => false/);
  const selected = renderIndexing(manifest, { poolSelection: [pool, pool] });
  assert.ok(selected.get('examples/envio/config.yaml').toLowerCase().includes(provider.poolManager.toLowerCase()));
  assert.ok(selected.get('examples/envio/src/EventHandlers.ts').includes(JSON.stringify({ params: { id: [pool.poolId] } })));
  for (const patch of [{ chainId: 1 }, { providerId: 'foreign' }, { poolId: `0x${'00'.repeat(32)}` }, { poolManager: key.currency1 }]) {
    assert.throws(() => renderIndexing(manifest, { poolSelection: [{ ...pool, ...patch }] }));
  }
  assert.throws(() => renderIndexing(manifest, { poolSelection: [pool, { ...pool, membership: { ...pool.membership, blockHash: `0x${'56'.repeat(32)}` } }] }), /Conflicting/);
  const unsafe = structuredClone(manifest);
  unsafe.sources.find(s => s.kind === 'shared').kind = 'fixed';
  assert.throws(() => validateCatalog(unsafe));
});
